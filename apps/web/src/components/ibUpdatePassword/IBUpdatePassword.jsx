import { useMutation } from "@apollo/client";
import { CircularProgress } from "@mui/material";
import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ALERT_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
import { useAuth } from "../../context/auth";
import UserService from "../../services/UserService";
import IBPasswordField from "../inputs/IBPasswordField";
import "./ibUpdatePassword.css";

// NOTE: this used to support an `isPublic` mode for a logged-out "forgot password" flow that
// only asked for an account identifier - no proof of account ownership. That was a full account-takeover
// vulnerability (see server/graphql/resolvers/users.js changePassword for details) and has been
// removed. Changing a password now always requires an authenticated session and the current
// password. A real logged-out reset flow needs an email-based token and isn't built yet.
const IBUpdatePassword = () => {
	const currentPasswordRef = useRef();
	const newPasswordRef = useRef();
	const confirmNewPasswordRef = useRef();
    const [loading, setLoading] = useState(false);
    const { updateCurrentUser, setAlert } = useAuth();
    const [changePassword] = useMutation(UserService.CHANGE_PASSWORD_MUTATION);
    const [errors, setErrors] = useState({});

    const doPasswordsMatch = (password, confirmPassword) => {
        const newErrors = {};
        if (password.trim() === "") {
            newErrors.password = "Password must not be empty";
        } else if (password !== confirmPassword) {
            newErrors.confirmPassword = "Passwords must match";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

	const handleChangePassword = (e) => {
        e.preventDefault();
        if(doPasswordsMatch(newPasswordRef.current.value, confirmNewPasswordRef.current.value)) {
            setLoading(true);
            changePassword({
                variables: {
                    currentPassword: currentPasswordRef.current.value,
                    newPassword: newPasswordRef.current.value,
                },
            }).then(({ data: { changePassword: usr } }) => {
                setLoading(false);
                updateCurrentUser(usr);
                setAlert({
                    isAlert: true,
                    severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
                    message: 'Password updated successfully',
                    timeout: ALERT_CONSTANTS.TIMEOUT,
                    location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE
                });
            }).catch((err) => {
                setLoading(false);
                setAlert({
                    isAlert: true,
                    severity: ALERT_CONSTANTS.SEVERITY.ERROR,
                    message: err.message,
                    timeout: ALERT_CONSTANTS.TIMEOUT,
                    location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE
                });
            });
        } else {
            setAlert({
                isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: 'Invalid data',
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE
            });
        }
    };

	return (
        <div className="resetPassword">
			<form className="resetPasswordForm">
                <div className="resetPasswordInputContainer">
                    <div>
                        <IBPasswordField
                            passwordRef={currentPasswordRef}
                            label="Current Password"
                            required={false}
                            autoFocus={true}
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
                            label="Confirm New Password"
                            required={false}
                            id="confirmNewPassword"
                        />
                    </div>
                </div>
                <div className="resetPasswordButton">
                    <button type="submit" onClick={handleChangePassword}>
                        {loading ? (
                            <CircularProgress color="inherit" size="20px" />
                        ) : (
                            "Update Password"
                        )}
                    </button>
                </div>
                { Object.keys(errors).length > 0 && (
                    <div className="errors">
                    <ul className="list">
                    {Object.values(errors).map((value) => (
                        <li key={value}>{value}</li>
                        ))}
                    </ul>
                    </div>
                )}
			</form>
		</div>
	);
};

export default IBUpdatePassword;
