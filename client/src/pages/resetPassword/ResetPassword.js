import "./resetPassword.css";

import IBUpdatePassword from "../../components/ibUpdatePassword/IBUpdatePassword";
import { useRef, useState } from "react";
import { CircularProgress } from "@mui/material";
import { useAuth } from "../../context/auth";
import { useMutation } from "@apollo/client";
import UserService from "../../services/UserService";
import IBErrorsList from "../../components/ibErrorsList/IBErrorsList";
import { useNavigate } from "react-router-dom";
import { ALERT_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";

const ResetPassword = () => {
	// const currentPasswordRef = useRef();
	// const newPasswordRef = useRef();
	// const confirmNewPasswordRef = useRef();
	// const usernameRef = useRef();
	// const loading = false;
    // const { user, updateCurrentUser, logout, setAlert } = useAuth();
    // const [forgotPassword] = useMutation(UserService.FORGOT_PASSWORD_MUTATION);
    // const navigate = useNavigate();
    // const [errors, setErrors] = useState({});


    // const doPasswordsMatch = (password, confirmPassword) => {
    //     if (password.trim() === "") {
    //         errors.password = "Password must not be empty";
    //         setErrors(errors);
    //         return false
    //       } else if (password !== confirmPassword) {
    //         errors.confirmPassword = "Passwords must match";
    //         setErrors(errors);
    //         return false;
    //       }
    //       return true;
    // }

    // const resetPasswordMutation = (username, password) => {
    //     forgotPassword({
    //         variables: {
    //             username: username,
    //             password: password
    //         },
    //     }).then(({ data: { forgotPassword: usr } }) => {
    //         logout();
    //         navigate(ROUTE_CONSTANTS.LOGIN);
    //     });
    // }

	// const handleResetPassword = (e) => {
    //     e.preventDefault();
    //     if(doPasswordsMatch(newPasswordRef.current.value, confirmNewPasswordRef.current.value)) {
    //         if(usernameRef.current.value) {
    //             resetPasswordMutation(usernameRef.current.value, confirmNewPasswordRef.current.value);
    //         } else {
    //             if(user) {
    //                 const test = user.username;
    //                 resetPasswordMutation(test, confirmNewPasswordRef.current.value);
    //             }
    //         }
    //     } else {
    //         setAlert({
    //             isAlert: true,
	// 			severity: ALERT_CONSTANTS.SEVERITY.ERROR,
	// 			message: 'Invalid data',
	// 			timeout: ALERT_CONSTANTS.TIMEOUT,
	// 			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE
    //         });
    //     }
    // };

	return (
		// <div className="resetPassword">
		// 	<form className="resetPasswordForm">
        //         <div className="resetPasswordInputContainer">
                    <IBUpdatePassword isPublic={true} />
        //         </div>
        //         <div className="resetPasswordButton">
        //             <button type="submit" onClick={handleResetPassword}>
        //                 {loading ? (
        //                     <CircularProgress color="inherit" size="20px" />
        //                 ) : (
        //                     "Reset Password"
        //                 )}
        //             </button>
        //         </div>
        //         { Object.keys(errors).length > 0 && (
        //             <div className="errors">
        //             <ul className="list">
        //             {Object.values(errors).map((value) => (
        //                 <li key={value}>{value}</li>
        //                 ))}
        //             </ul>
        //             </div>
        //         )}
		// 	</form>
		// </div>
	);
};

export default ResetPassword;
