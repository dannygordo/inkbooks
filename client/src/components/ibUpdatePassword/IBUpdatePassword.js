import React, { useRef } from "react";
import { useAuth } from "../../context/auth";
import IBPasswordField from "../inputs/IBPasswordField";
import "./ibUpdatePassword.css";

const IBUpdatePassword = () => {
	const { user } = useAuth();
	const currentPasswordRef = useRef();
	const newPasswordRef = useRef();
	const confirmNewPasswordRef = useRef();

	return (
		<div>
			<IBPasswordField
				passwordRef={currentPasswordRef}
				label="Current Password"
				required={false}
				id="password"
			/>
			<IBPasswordField
				passwordRef={newPasswordRef}
				label="New Password"
				required={false}
				id="newPassword"
			/>
			<IBPasswordField
				passwordRef={confirmNewPasswordRef}
				label="Confrim New Password"
				required={false}
				id="confirmNewPassword"
			/>
		</div>
	);
};

export default IBUpdatePassword;
