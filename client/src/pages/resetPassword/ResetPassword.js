import "./resetPassword.css";

import IBUpdatePassword from "../../components/ibUpdatePassword/IBUpdatePassword";
import { useAuth } from "../../context/auth";
import { Link } from "react-router-dom";
import { ROUTE_CONSTANTS } from "../../constants";

// This page used to offer a logged-out "forgot password" form that only asked for a username -
// no email, no token, no proof of ownership. That was a full account-takeover vulnerability
// (see server/graphql/resolvers/users.js changePassword for the write-up) and has been removed.
// There is currently no self-service way to reset a password without being logged in - that
// needs a real email-based reset token flow, which needs a transactional email provider that
// isn't set up yet (see PRODUCTION_ROADMAP.md Phase 1, item 1). Until then, a logged-in user can
// change their own password here (or from their Profile page); a logged-out user is directed to
// contact their shop admin, who can reset it for them via an authenticated updateUser call.
const ResetPassword = () => {
	const { user } = useAuth();

	if (!user) {
		return (
			<div className="resetPassword public">
				<p style={{ maxWidth: 400, textAlign: "center" }}>
					Self-service password reset by email isn't available yet.
					Please contact your shop administrator to have your
					password reset, or{" "}
					<Link to={ROUTE_CONSTANTS.LOGIN}>log in</Link> if you
					remember it.
				</p>
			</div>
		);
	}

	return (
		<div className="resetPassword">
			<IBUpdatePassword />
		</div>
	);
};

export default ResetPassword;
