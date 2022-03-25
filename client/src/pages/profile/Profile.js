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
	const { data: availableTags, loading } = UserService.getTagColorsByShop(
		user.userInfo.shop.id
	);

	useEffect(() => {
		if(availableTags) {
			console.log('huh');
			setTagColors(UtilsService.showAvailableColorTags(
				APP_SETTINGS_CONSTANTS.TAG_COLORS,
				availableTags.getUserTagColors,
				user.tagColor
			));
		}
	}, [loading]);

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
				const imgPath = `${user.userInfo.shop.id}/${user.id}/profile`;
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
		let tempTags = availableTags.getUserTagColors.filter((tag) => tag.tagColor !== user.tagColor);
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

	if (availableTags) {
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
						<IBUpdatePassword isPublic={false} />
					</IBCardWrapper>
					<IBCardWrapper>
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
