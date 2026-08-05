import "./resetPassword.css";
import "../setPassword/setPassword.css";

import React, { useState } from "react";
import { Button, TextField } from "@mui/material";
import IBUpdatePassword from "../../components/ibUpdatePassword/IBUpdatePassword";
import { useAuth } from "../../context/auth";
import { Link } from "react-router-dom";
import { ROUTE_CONSTANTS } from "../../constants";
import PasswordService from "../../services/PasswordService";

/**
 * This page used to offer a logged-out "forgot password" form that asked only for an identifier -
 * no email, no token, no proof of ownership. That was a full account-takeover vulnerability and
 * was removed, leaving a note telling locked-out users to phone their shop admin.
 *
 * The form is back, and this time it's real: it emails a single-use, one-hour token to the
 * address on file, and the password only changes by redeeming that token (see
 * pages/setPassword/SetPassword.jsx and server/utils/password-tokens.js). The proof of ownership
 * the old version lacked is control of the mailbox.
 *
 * THE CONFIRMATION IS DELIBERATELY UNCONDITIONAL. It says the same thing whether or not the
 * address belongs to an account, because the server behaves the same way for the same reason: a
 * form that answers "no account found" is a tool for checking who a shop's clients are. That does
 * mean someone who mistypes their address gets a reassuring message and no email, which is a real
 * usability cost - and the right trade, because the alternative hands out true answers about real
 * people to anyone who asks.
 */
const ResetPassword = () => {
	const { user } = useAuth();
	const [requestPasswordReset, { loading }] = PasswordService.useRequestPasswordReset();
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			await requestPasswordReset({ variables: { email } });
		} catch (err) {
			// Swallowed on purpose, matching the server. Surfacing a failure here would leak the
			// same thing the unconditional response exists to hide, and there's nothing the
			// person could usefully do with it anyway.
		}
		setSubmitted(true);
	};

	// A logged-in user landing here wants to change a password they know, which is a different
	// operation with a different guarantee (it requires the current password).
	if (user) {
		return (
			<div className="resetPassword">
				<IBUpdatePassword />
			</div>
		);
	}

	if (submitted) {
		return (
			<div className="setPassword">
				<h1 className="setPasswordTitle">Check your email</h1>
				<p className="resetPasswordNotice">
					If an account exists for that address, we've sent a link to reset the
					password. It expires in an hour and can only be used once.
				</p>
				<Link to={ROUTE_CONSTANTS.LOGIN}>Back to login</Link>
			</div>
		);
	}

	return (
		<div className="setPassword">
			<h1 className="setPasswordTitle">Reset your password</h1>
			<p className="resetPasswordNotice">
				Enter the email address on your account and we'll send you a link to set a new
				password.
			</p>
			<form className="setPasswordForm" onSubmit={handleSubmit}>
				<TextField
					label="Email address"
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					fullWidth
					required
					autoFocus
				/>
				<Button
					type="submit"
					variant="contained"
					sx={{ backgroundColor: "#333" }}
					disabled={loading || !email.trim()}
				>
					{loading ? "Sending..." : "Send reset link"}
				</Button>
			</form>
			<Link to={ROUTE_CONSTANTS.LOGIN}>Back to login</Link>
		</div>
	);
};

export default ResetPassword;
