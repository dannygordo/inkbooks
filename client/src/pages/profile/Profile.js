import React, { useRef, useState } from "react";
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
import { ALERT_CONSTANTS, AUTH_SETTINGS_CONSTANTS } from "../../constants";
import { Upload } from "@mui/icons-material";
import CropEasy from '../../components/crop/CropEasy';

const Profile = () => {
	const { user, setLoading, setAlert, updateCurrentUser } = useAuth();
	const [file, setFile] = useState(null);
	const [photoURL, setPhotoURL] = useState(user.avatar);
    const [openCrop, setOpenCrop] = useState(false);
	const [updateUser] = useMutation(UserService.UPDATE_USER_MUTATION);

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
				const imgPath = `${user.userInfo.shop.name}/${user.firstName}_${user.lastName}/profile`;
				url = await IBUploadFile(
					file,
					`${UtilsService.formatImagePathForFirebaseStorage(imgPath)}/${imageName}`
				);
				
                //This splits the image name off of the current authContext user and deletes it from Firebase
				if (user?.avatar) {
                    try {
                        const prevImage = user.avatar
                            .split('%2Fprofile%2F')[1]
                            .split("?")[0];
                        if (prevImage) {
                                await IBDeleteFile(`${UtilsService.formatImagePathForFirebaseStorage(imgPath)}/${prevImage}`);
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
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE
            });
            console.log(error);
            }

		setLoading(false);
	};

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
							<IBSubmitButton text="Upload Pic" endIcon={<Upload />} />
						</div>
					</form>
				</IBCardWrapper>
                <IBCardWrapper>
					<div>
						<h1>Update Password</h1>
					</div>
					<IBUpdatePassword isPublic={false} />
                </IBCardWrapper>
			</div>
		</div>
	): (
        <CropEasy {...{photoURL, setOpenCrop, setPhotoURL, setFile}} />
    );
};

export default Profile;
