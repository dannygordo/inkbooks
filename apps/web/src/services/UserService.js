import { gql, useQuery, useMutation } from "@apollo/client";
import { useAuth } from "../context/auth";

/**
 * Everything the app expects to find on `context.user`.
 *
 * ONE DEFINITION, because the two documents that produce a session used to carry two different
 * ones. Login selected `userInfo { ... on Artist { shop { id } } }`; the signup mutation selected
 * no userInfo at all. Nothing failed - the field is nullable - so a brand new account reached the
 * dashboard with `user.userInfo` undefined, Settings decided it wasn't an artist and showed
 * "Nothing to configure here yet for this account type", and the fix was to log out and back in,
 * because logging in was the only document that asked for the field. Anything that hands back a
 * signed-in user spreads this now, so the two cannot drift apart again.
 *
 * NO accessToken OR firebaseToken HERE, deliberately. Those belong to the act of authenticating,
 * not to the user record: `getUser` returns the stored document, where both are null. Selecting
 * them in a shared fragment would mean a routine refetch writes null over the live token in
 * Apollo's normalised cache (same `User:<id>` entry) and signs somebody out for reading their own
 * profile. Login and signup select them explicitly, alongside this.
 */
export const CURRENT_USER_FIELDS = gql`
	fragment CurrentUserFields on User {
		id
		email
		firstName
		lastName
		avatar
		role
		userType
		tagColor
		themePreference
		userInfo {
			... on Artist {
				avatar
				id
				firstName
				lastName
				hourlyRate
				shop {
					id
					name
					website
				}
			}
			... on Client {
				avatar
				id
				firstName
				lastName
			}
			... on Staff {
				avatar
				id
				firstName
				lastName
				title
				shop {
					id
					name
					website
				}
			}
		}
	}
`;

/**
 * Re-read the signed-in user.
 *
 * getUser lets a caller fetch THEMSELVES without any further permission check (see
 * resolvers/users.js), which is what makes this usable as a plain session refresh. Used at the end
 * of the signup wizard, where the later steps change the account after it was first cached.
 */
export const GET_CURRENT_USER = gql`
	${CURRENT_USER_FIELDS}
	query GetCurrentUser($userId: ID!) {
		getUser(userId: $userId) {
			...CurrentUserFields
		}
	}
`;

const UserService = (() => {

    const _UPDATE_USER_MUTATION = gql`
    mutation UpdateUser($user: UserUpdateInput) {
        updateUser(user: $user) {
            id
            email
            firstName
            lastName
            avatar
            role
            accessToken
            userType
            tagColor
            themePreference
            userInfo {
                firstName
                lastName
                avatar
                id
            }
        }
    }
    `;

    // Renamed from forgotPassword/FORGOT_PASSWORD_MUTATION: this now requires the caller's
    // current password and a valid session - see server/graphql/resolvers/users.js for why.
    const _CHANGE_PASSWORD_MUTATION = gql`
    mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
        changePassword(currentPassword: $currentPassword, newPassword: $newPassword) {
            id
            email
            firstName
            lastName
            avatar
            role
            accessToken
            userType
            tagColor
            userInfo {
                id
                firstName
                lastName
                email
                avatar
            }
        }
    }
    `;

    const _FETCH_TAG_COLORS_BY_SHOP = gql`
        query GetUserTagColors($shopId: ID!) {
            getUserTagColors(shopId: $shopId) {
                tagColor
            }
        }
    `;
    // skip when there's no shopId at all - a Client (no `shop` field on that type) or an
    // independent Artist (no shop connection - a real, supported case, not a data gap) has no
    // shop-scoped tag colors to fetch. Without this, Apollo still fires the query with an
    // undefined variable against a schema field typed `shopId: ID!` (non-null) - found via manual
    // testing crashing Profile.jsx before this call even ran (see that file's own fix), so this
    // guard is what actually stops the query from ever being attempted for those users.
    const _getTagColorsByShop = (shopId) => {
        return useQuery(_FETCH_TAG_COLORS_BY_SHOP, {
			variables: {
				shopId,
			},
			skip: !shopId,
		});
    }

    return {
        UPDATE_USER_MUTATION: _UPDATE_USER_MUTATION,
        CHANGE_PASSWORD_MUTATION: _CHANGE_PASSWORD_MUTATION,
        getTagColorsByShop: _getTagColorsByShop
    }
})();

export default UserService