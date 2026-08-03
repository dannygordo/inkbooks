import React, { useEffect, useRef, useState } from "react";
import IBCardWrapper from "../../components/card/ibCard/IBCardWrapper";
import IBUpdatePassword from "../../components/ibUpdatePassword/IBUpdatePassword";
import IBAvatar from "../../components/inputs/IBAvatar";
import IBInput from "../../components/inputs/IBInput";
import IBSubmitButton from "../../components/inputs/IBSubmitButton";
import { useAuth } from "../../context/auth";
import IBDeleteFile from "../../firebase/IBDeleteFile";
import IBUploadFile from "../../firebase/IBUploadFile";
import UserService from "../../services/UserService";
import { useMutation } from "@apollo/client";
import "./profile.css";
import UtilsService from "../../services/UtilsService";
import {
	ALERT_CONSTANTS,
	APP_SETTINGS_CONSTANTS,
	AUTH_SETTINGS_CONSTANTS,
} from "../../constants";
import { Check, Upload } from "@mui/icons-material";
import CropEasy from "../../components/crop/CropEasy";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";

const Profile = () => {
	const { user, setLoading, setAlert, updateCurrentUser } = useAuth();
	const [file, setFile] = useState(null);
	const [photoURL, setPhotoURL] = useState(user.avatar);
	const [openCrop, setOpenCrop] = useState(false);
	const [updateUser] = useMutation(UserService.UPDATE_USER_MUTATION);
	const [tagColors, setTagColors] = useState([]);
	console.log(user);
	// user.userInfo.shop is legitimately absent for a Client (no `shop` field on that type at
	// all) or null for an independent Artist (no shop connection - a real, supported case, not a
	// data gap - see PRODUCTION_ROADMAP.md's artist-centric tenancy section). The old
	// unconditional `.shop.id` crashed the entire Profile page - not just the avatar upload below
	// - for any Client or independent Artist the instant they navigated here, found via manual
	// testing. Optional-chained to undefined instead, which getTagColorsByShop's own `skip: !shopId`
	// (see UserService.js) now treats as "nothing to fetch" rather than firing a doomed query.
	const { data: availableTags, loading } = UserService.getTagColorsByShop(
		user.userInfo?.shop?.id
	);

	// Was gated on `if (availableTags)` - for an independent artist (no shop, see this file's own
	// comment above on getTagColorsByShop's skip guard), that query never fires at all, so
	// `availableTags` never becomes truthy and this effect silently never ran: no color swatches
	// ever populated, and (see the render guard below) the *entire* Profile page got stuck showing
	// a permanent loading spinner instead - not just the tag-color picker. There's no other shop
	// artist to collide colors with when there's no shop, so an empty "already taken" list (instead
	// of skipping the computation) correctly shows the full palette. Found via manual testing: an
	// independent artist reported their calendar appointments rendering with no visible color label
	// at all (only visible via the tooltip) - traced back to this, not the calendar rendering code -
	// their tagColor was stuck at registration's default ('#fff') because they could never actually
	// reach the picker to change it.
	useEffect(() => {
		setTagColors(UtilsService.showAvailableColorTags(
			APP_SETTINGS_CONSTANTS.TAG_COLORS,
			availableTags?.getUserTagColors ?? [],
			user.tagColor
		));
	}, [loading, availableTags]);

	const handleChangeAvatar = (e) => {
		const file = e.target.files[0];
		if (file) {
			console.log(file);
			setFile(file);
			setPhotoURL(URL.createObjectURL(file));
			setOpenCrop(true);
		}
	};

	const handleUpdateUser = (avatar) => {
		updateUser({
			variables: {
				user: {
					id: user.id,
					email: user.email,
					username: user.username,
					firstName: user.firstName,
					lastName: user.lastName,
					avatar: avatar,
					role: user.role,
				},
			},
		}).then(({ data: { updateUser: usr } }) => {
			console.log(usr);
			console.log(user);

			//merges the returned avatar url to (and updates) the current authContext user object
			let tempUser = { ...user };
			tempUser.avatar = usr.avatar;
			setPhotoURL(usr.avatar);
			updateCurrentUser(tempUser);
		});
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);

		let url = "";
		try {
			console.log(file);
			if (file) {
				const imageName = `${user.id}.${Date.now()}.${file.name
					.split(".")
					.pop()}`;
				//creates the image path, formats the path for storage in Firebase
				// Same shop-less fallback as IBProgressItemProject.jsx's project-image upload -
				// see that file's comment for the full explanation.
				const shopPathSegment = user.userInfo?.shop?.id || 'independent';
				const imgPath = `${shopPathSegment}/${user.id}/profile`;
				url = await IBUploadFile(
					file,
					`${UtilsService.formatImagePathForFirebaseStorage(
						imgPath
					)}/${imageName}`
				);

				//This splits the image name off of the current authContext user and deletes it from Firebase
				if (user?.avatar) {
					try {
						const prevImage = user.avatar
							.split("%2Fprofile%2F")[1]
							.split("?")[0];
						if (prevImage) {
							await IBDeleteFile(
								`${UtilsService.formatImagePathForFirebaseStorage(
									imgPath
								)}/${prevImage}`
							);
						}
					} catch (err) {
						console.log(err);
					}
				}
			}
			//this updates the authContext user object
			handleUpdateUser(url);
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message:
					AUTH_SETTINGS_CONSTANTS.RESPONSE_MESSAGES
						.RECORD_UPDATE_SUCCESS,
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
			console.log(error);
		}

		setLoading(false);
	};

	const handleTagColor = (tag) => {
		console.log(tag);
		// availableTags is undefined for a shop-less artist (query always skipped, see above) -
		// treat "no shop-mates to collide with" as an empty used-colors list rather than crashing.
		let tempTags = (availableTags?.getUserTagColors ?? []).filter((tag) => tag.tagColor !== user.tagColor);
		updateUser({
			variables: {
				user: {
					tagColor: tag.value,
					id: user.id,
					email: user.email,
					username: user.username,
					role: user.role,
				},
			},
		}).then(({ data: { updateUser: usr } }) => {
			console.log(usr);
			console.log(user);

			let tempUser = { ...user };
			tempUser.tagColor = usr.tagColor;
			updateCurrentUser(tempUser);
			
			
			console.log(tempTags);
			tempTags.push({tagColor: tag.value});
			console.log(tempTags);
			setTagColors(UtilsService.showAvailableColorTags(
				APP_SETTINGS_CONSTANTS.TAG_COLORS,
				tempTags,
				tag.value
			));

			tempTags = [];
		});
	}

	// Was gated on `if (availableTags)` - since getTagColorsByShop is permanently skipped for a
	// shop-less artist (see comment above), availableTags could never become truthy for them, and
	// this whole page - avatar upload, password change, tag color, all of it, not just the color
	// picker - got stuck on the else branch's <IBPageLoader /> forever. Gate on the query's actual
	// `loading` flag instead: false immediately for a skipped query, so the page now renders right
	// away for an independent artist, same as it always did for a shop artist once their real query
	// resolved.
	if (!loading) {
		console.log(availableTags);
		return !openCrop ? (
			<div className="profile">
				<div
					className="profileTitleContainer"
					style={{ marginBottom: "40px" }}
				>
					<h1 className="profileTitle">{`${user.firstName} ${user.lastName} Profile`}</h1>
					<div className="profileActions">
						<div className="profileActionItem"></div>
					</div>
				</div>
				<div className="profileContainer">
					<IBCardWrapper>
						<div>
							<h1>Update Avatar</h1>
						</div>
						<form onSubmit={handleSubmit}>
							<div className="profileAvatarContainer">
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
							<div>
								<IBSubmitButton
									text="Upload Pic"
									endIcon={<Upload />}
								/>
							</div>
						</form>
					</IBCardWrapper>
					<IBCardWrapper>
						<div>
							<h1>Update Password</h1>
						</div>
						<IBUpdatePassword />
					</IBCardWrapper>
					{user.userInfo.userType !== "client" ?
					(<IBCardWrapper>
						<div>
							<h1>Select Tag Color</h1>
							<h6 style={{color: '#bbb', marginBottom: 15}}>Choose the color you'd like to represent you on the calendar</h6>
						</div>
						<div
							style={{
								display: "flex",
								flexDirection: "row",
								justifyContent: "left",
								alignItems: 'center',
								flexWrap: "wrap",
								width: 350
							}}
						>
							{tagColors && tagColors.map((tag, index) => {
								return (
									<div
										onClick={() => {handleTagColor(tag)}}
										key={index}
										style={{
											borderRadius: "50%",
											width: "60px",
											height: "60px",
											color: "#fff",
											padding: "5px",
											margin: '5px',
											display: 'flex',
											justifyContent: 'center',
											alignItems: 'center',
											cursor: 'pointer',
											backgroundColor: tag.value,
										}}
									>
										{tag.value === user.tagColor ?
											<Check />
											:
											tag.label.charAt(0)
										}
									</div>
								);
							})}
						</div>
					</IBCardWrapper>
					) : null}
					
				</div>
			</div>
		) : (
			<CropEasy {...{ photoURL, setOpenCrop, setPhotoURL, setFile }} />
		);
	} else {
		return <IBPageLoader />;
	}
};

export default Profile;
