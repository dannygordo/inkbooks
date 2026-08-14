// Explicit React import - see scripts/check-react-in-tested-components.mjs.
import React, { useEffect, useState } from "react";
import { useMutation } from "@apollo/client";
import { Check, Upload } from "@mui/icons-material";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBUpdatePassword from "../ibUpdatePassword/IBUpdatePassword";
import IBAvatar from "../inputs/IBAvatar";
import IBSubmitButton from "../inputs/IBSubmitButton";
import CropEasy from "../crop/CropEasy";
import IBUploadFile from "../../firebase/IBUploadFile";
import IBDeleteFile from "../../firebase/IBDeleteFile";
import UserService from "../../services/UserService";
import UtilsService from "../../services/UtilsService";
import { useAuth } from "../../context/auth";
import {
	ALERT_CONSTANTS,
	APP_SETTINGS_CONSTANTS,
	AUTH_SETTINGS_CONSTANTS,
} from "../../constants";

/**
 * Avatar, password and calendar colour.
 *
 * WAS ITS OWN PAGE at /profile, reached from a menu in the header. Two destinations for "things
 * about me I can change" is one too many: nothing distinguished a profile setting from a settings
 * setting except which of the two got built first, so finding either meant guessing. Everything
 * here is now a panel on Settings alongside the shop, rates, booking link and notifications, and
 * the header menu points at that one page.
 *
 * The header menu itself stays. It is where a person expects to find who they are signed in as and
 * how to sign out, and burying log out inside a settings page is worse than the duplication that
 * was removed - the fix was to stop it being a second navigation surface, not to delete it.
 */
const AccountPanel = () => {
	const { user, setLoading, setAlert, updateCurrentUser } = useAuth();
	const [file, setFile] = useState(null);
	const [photoURL, setPhotoURL] = useState(user.avatar);
	const [openCrop, setOpenCrop] = useState(false);
	const [tagColors, setTagColors] = useState([]);
	const [updateUser] = useMutation(UserService.UPDATE_USER_MUTATION);

	// user.userInfo.shop is legitimately absent for a Client (no `shop` field on that type at all)
	// or null for an independent Artist - a real, supported case, not a data gap. The old
	// unconditional `.shop.id` crashed the whole page for either, and getTagColorsByShop's own
	// `skip: !shopId` treats undefined as "nothing to fetch" rather than firing a doomed query.
	const { data: availableTags, loading } = UserService.getTagColorsByShop(
		user.userInfo?.shop?.id
	);

	// Gated on the query's `loading` flag, NOT on `availableTags` being truthy. For a shop-less
	// artist the query is permanently skipped, so availableTags never arrives - and the old
	// `if (availableTags)` version meant no swatches ever populated and the entire page sat on a
	// spinner forever. An independent artist reported their calendar labels having no colour; the
	// cause was that they could never reach this picker to change the default.
	useEffect(() => {
		setTagColors(
			UtilsService.showAvailableColorTags(
				APP_SETTINGS_CONSTANTS.TAG_COLORS,
				availableTags?.getUserTagColors ?? [],
				user.tagColor
			)
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loading, availableTags]);

	const handleChangeAvatar = (e) => {
		const chosen = e.target.files[0];
		if (chosen) {
			setFile(chosen);
			setPhotoURL(URL.createObjectURL(chosen));
			setOpenCrop(true);
		}
	};

	const handleUpdateUser = (avatar) => {
		updateUser({
			variables: {
				user: {
					id: user.id,
					email: user.email,
					firstName: user.firstName,
					lastName: user.lastName,
					avatar,
					role: user.role,
				},
			},
		}).then(({ data: { updateUser: usr } }) => {
			setPhotoURL(usr.avatar);
			updateCurrentUser({ ...user, avatar: usr.avatar });
		});
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);

		let url = "";
		try {
			if (file) {
				const imageName = `${user.id}.${Date.now()}.${file.name.split(".").pop()}`;
				// Same shop-less fallback as the project-image upload - an independent artist has no
				// shop id to key storage under, and 'independent' is a real path segment rather than
				// the string "undefined".
				const shopPathSegment = user.userInfo?.shop?.id || "independent";
				const imgPath = `${shopPathSegment}/${user.id}/profile`;
				url = await IBUploadFile(
					file,
					`${UtilsService.formatImagePathForFirebaseStorage(imgPath)}/${imageName}`
				);

				if (user?.avatar) {
					try {
						const prevImage = user.avatar.split("%2Fprofile%2F")[1]?.split("?")[0];
						if (prevImage) {
							await IBDeleteFile(
								`${UtilsService.formatImagePathForFirebaseStorage(imgPath)}/${prevImage}`
							);
						}
					} catch {
						// An orphaned old avatar in storage is not worth failing the upload over.
					}
				}
			}
			handleUpdateUser(url);
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: AUTH_SETTINGS_CONSTANTS.RESPONSE_MESSAGES.RECORD_UPDATE_SUCCESS,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		} catch (error) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: error.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}

		setLoading(false);
	};

	const handleTagColor = (tag) => {
		// Undefined for a shop-less artist (query always skipped) - "no shop-mates to collide with"
		// is an empty used-colours list, not a crash.
		const stillTaken = (availableTags?.getUserTagColors ?? []).filter(
			(t) => t.tagColor !== user.tagColor
		);
		updateUser({
			variables: {
				user: { tagColor: tag.value, id: user.id, email: user.email, role: user.role },
			},
		}).then(({ data: { updateUser: usr } }) => {
			updateCurrentUser({ ...user, tagColor: usr.tagColor });
			setTagColors(
				UtilsService.showAvailableColorTags(
					APP_SETTINGS_CONSTANTS.TAG_COLORS,
					[...stillTaken, { tagColor: tag.value }],
					tag.value
				)
			);
		});
	};

	// `user.userType`, not `user.userInfo.userType`. The old version read userType off userInfo,
	// where it does not exist - so the check was `undefined !== "client"`, permanently true, and
	// every client was shown a calendar-colour picker for a calendar they do not have. It would
	// also have thrown outright for any account whose userInfo was null.
	const showsOnACalendar = user.userType !== "client";

	if (openCrop) {
		return <CropEasy {...{ photoURL, setOpenCrop, setPhotoURL, setFile }} />;
	}

	return (
		<>
			<IBCardWrapper>
				<h1>Photo</h1>
				<p className="settingsPanelHelp">
					Shown next to your name across the app and on your booking page.
				</p>
				<form onSubmit={handleSubmit}>
					<div className="settingsAvatar">
						<label htmlFor="profilePic">
							<input
								accept="image/*"
								id="profilePic"
								type="file"
								style={{ display: "none" }}
								onChange={handleChangeAvatar}
							/>
							<IBAvatar
								size={100}
								cursor="pointer"
								imgUrl={photoURL}
								label={`${user.firstName} ${user.lastName}`}
							/>
						</label>
					</div>
					<div className="settingsActions">
						<IBSubmitButton text="Upload Pic" endIcon={<Upload />} />
					</div>
				</form>
			</IBCardWrapper>

			<IBCardWrapper>
				<h1>Password</h1>
				<IBUpdatePassword />
			</IBCardWrapper>

			{showsOnACalendar && (
				<IBCardWrapper>
					<h1>Calendar color</h1>
					<p className="settingsPanelHelp">
						How your appointments are labelled on the calendar. Colors already taken by
						someone else at your shop are not offered.
					</p>
					<div className="settingsTagColors">
						{tagColors &&
							tagColors.map((tag) => (
								<button
									type="button"
									// The colour value, not the array index. An index key is wrong the
									// moment the list is filtered - which it is, every time somebody
									// picks a colour.
									key={tag.value}
									onClick={() => handleTagColor(tag)}
									aria-label={tag.label}
									aria-pressed={tag.value === user.tagColor}
									className="settingsTagColor"
									style={{ backgroundColor: tag.value }}
								>
									{tag.value === user.tagColor ? <Check /> : tag.label.charAt(0)}
								</button>
							))}
					</div>
				</IBCardWrapper>
			)}
		</>
	);
};

export default AccountPanel;
