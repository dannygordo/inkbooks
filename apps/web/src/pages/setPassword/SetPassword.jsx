import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button, TextField, CircularProgress } from "@mui/material";
import PasswordService from "../../services/PasswordService";
import { ROUTE_CONSTANTS } from "../../constants";
import "./setPassword.css";

/**
 * Where an invite link and a reset link both land. Public - the whole point is serving someone
 * who has no session.
 *
 * The token is checked before the form renders. A dead link should say so immediately rather than
 * after someone has chosen a password, typed it twice, and pressed submit - the failure is the
 * same either way, but finding out first costs nothing and finding out last feels like the app
 * wasted your time.
 *
 * Note this page does NOT log anyone in on success; it sends them to the login screen. Setting a
 * password isn't proof of intent to start a session, and auto-authenticating whoever redeems a
 * link would mean an intercepted email grants a live session rather than just a password the real
 * owner can immediately reset. See server/graphql/mutations/passwords.js.
 */
const SetPassword = () => {
	const { token } = useParams();
	const navigate = useNavigate();
	const { data, loading } = PasswordService.useInspectToken(token);
	const [setPasswordWithToken, { loading: submitting }] =
		PasswordService.useSetPasswordWithToken();

	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState(null);
	const [done, setDone] = useState(false);

	const status = data?.inspectPasswordToken;

	const handleSubmit = async (e) => {
		e.preventDefault();
		// Checked here as well as server-side. The server is the authority, but making someone
		// wait for a round trip to be told their two entries don't match is a poor trade.
		if (password.length < 8) {
			setError("Password must be at least 8 characters.");
			return;
		}
		if (password !== confirm) {
			setError("Those two passwords don't match.");
			return;
		}
		setError(null);
		try {
			await setPasswordWithToken({ variables: { token, newPassword: password } });
			setDone(true);
		} catch (err) {
			setError(err.graphQLErrors?.[0]?.message || err.message);
		}
	};

	if (loading) {
		return (
			<div className="setPassword">
				<CircularProgress size="30px" />
			</div>
		);
	}

	if (done) {
		return (
			<div className="setPassword">
				<h1 className="setPasswordTitle">Password set</h1>
				<p>You can now log in with your new password.</p>
				<Button
					variant="contained"
					sx={{ backgroundColor: "#333" }}
					onClick={() => navigate(ROUTE_CONSTANTS.LOGIN)}
				>
					Go to login
				</Button>
			</div>
		);
	}

	if (!status?.valid) {
		return (
			<div className="setPassword">
				<h1 className="setPasswordTitle">This link isn't valid</h1>
				{/* One message covering expired, already-used and fabricated alike - the server
				    doesn't distinguish them either, deliberately, and the advice is the same in
				    every case. */}
				<p>
					It may have expired, or already been used. Ask your shop admin to send a new
					invite, or <Link to={ROUTE_CONSTANTS.RESET_PASSWORD}>request a reset</Link>.
				</p>
			</div>
		);
	}

	const isInvite = status.purpose === "invite";

	return (
		<div className="setPassword">
			<h1 className="setPasswordTitle">
				{isInvite ? "Welcome to InkBooks" : "Choose a new password"}
			</h1>
			<p className="setPasswordIntro">
				{isInvite
					? `Hi ${status.firstName || "there"} - choose a password to finish setting up your account.`
					: `Hi ${status.firstName || "there"} - pick a new password below.`}
			</p>

			<form className="setPasswordForm" onSubmit={handleSubmit}>
				<TextField
					label="New password"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					helperText="At least 8 characters"
					fullWidth
					// The first field on a page whose only purpose is this form.
					autoFocus
				/>
				<TextField
					label="Confirm password"
					type="password"
					value={confirm}
					onChange={(e) => setConfirm(e.target.value)}
					fullWidth
				/>
				{error && <div className="setPasswordError">{error}</div>}
				<Button
					type="submit"
					variant="contained"
					sx={{ backgroundColor: "#333" }}
					disabled={submitting}
				>
					{submitting ? "Saving..." : "Set password"}
				</Button>
			</form>
		</div>
	);
};

export default SetPassword;
