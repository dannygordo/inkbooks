import { gql, useQuery, useMutation } from "@apollo/client";

/**
 * The logged-out half of password management - the invite link a new artist or staff member
 * receives, and the self-service reset this app previously didn't have.
 *
 * Every operation here runs with no session, by design: the caller is someone who can't log in.
 */
export const PasswordService = (() => {
	// Checked before the form renders so a dead link says so up front, rather than after someone
	// has chosen and typed a password twice. Returns nothing identifying beyond a first name -
	// see server/graphql/resolvers/passwords.js.
	const _INSPECT_TOKEN = gql`
		query InspectPasswordToken($token: String!) {
			inspectPasswordToken(token: $token) {
				valid
				purpose
				firstName
			}
		}
	`;

	const _useInspectToken = (token) =>
		useQuery(_INSPECT_TOKEN, {
			variables: { token },
			skip: !token,
			// A token is single-use and time-limited, so a cached "valid" from a minute ago is
			// exactly the wrong thing to trust.
			fetchPolicy: "network-only",
		});

	const _REQUEST_PASSWORD_RESET = gql`
		mutation RequestPasswordReset($email: String!) {
			requestPasswordReset(email: $email)
		}
	`;

	const _SET_PASSWORD_WITH_TOKEN = gql`
		mutation SetPasswordWithToken($token: String!, $newPassword: String!) {
			setPasswordWithToken(token: $token, newPassword: $newPassword)
		}
	`;

	const _useRequestPasswordReset = () => useMutation(_REQUEST_PASSWORD_RESET);
	const _useSetPasswordWithToken = () => useMutation(_SET_PASSWORD_WITH_TOKEN);

	return {
		INSPECT_TOKEN: _INSPECT_TOKEN,
		REQUEST_PASSWORD_RESET: _REQUEST_PASSWORD_RESET,
		SET_PASSWORD_WITH_TOKEN: _SET_PASSWORD_WITH_TOKEN,
		useInspectToken: _useInspectToken,
		useRequestPasswordReset: _useRequestPasswordReset,
		useSetPasswordWithToken: _useSetPasswordWithToken,
	};
})();

export default PasswordService;
