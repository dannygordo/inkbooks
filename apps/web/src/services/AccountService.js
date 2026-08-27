import { gql } from "@apollo/client";

/**
 * Account creation for the three wizards. Each of these creates a User alongside the profile
 * record - see server/graphql/mutations/accounts.js.
 *
 * The artist and staff mutations return an inviteLink. That's selected here rather than ignored
 * because the wizard shows it: utils/email.js no-ops when the mail provider isn't configured, so
 * an invite can succeed with nothing sent, and an admin needs to be able to hand the link over
 * directly instead of trusting a claim this app can't verify.
 */
export const AccountService = (() => {
	const _CREATE_ARTIST_ACCOUNT = gql`
		mutation CreateArtistAccount($input: CreateArtistAccountInput!) {
			createArtistAccount(input: $input) {
				inviteLink
				artist {
					id
					firstName
					lastName
					email
					title
					userId
				}
			}
		}
	`;

	const _CREATE_STAFF_ACCOUNT = gql`
		mutation CreateStaffAccount($input: CreateStaffAccountInput!) {
			createStaffAccount(input: $input) {
				inviteLink
				staff {
					id
					firstName
					lastName
					email
					title
					userId
				}
			}
		}
	`;

	const _CREATE_CLIENT_ACCOUNT = gql`
		mutation CreateClientAccount($input: CreateClientAccountInput!) {
			createClientAccount(input: $input) {
				# False when the email already had an account, so the wizard can say the record
				# was updated rather than implying it created one.
				isNewAccount
				client {
					id
					firstName
					lastName
					email
					phone
				}
			}
		}
	`;

	return {
		CREATE_ARTIST_ACCOUNT: _CREATE_ARTIST_ACCOUNT,
		CREATE_STAFF_ACCOUNT: _CREATE_STAFF_ACCOUNT,
		CREATE_CLIENT_ACCOUNT: _CREATE_CLIENT_ACCOUNT,
	};
})();

export default AccountService;
