import { gql, useQuery, useMutation } from "@apollo/client";
import { useAuth } from "../context/auth";

const UserService = (() => {

    const _UPDATE_USER_MUTATION = gql`
    mutation UpdateUser($user: UserUpdateInput) {
        updateUser(user: $user) {
            id
            email
            username
            firstName
            lastName
            avatar
            role
            accessToken
            userType
            tagColor
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
            username
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