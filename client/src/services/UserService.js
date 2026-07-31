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
    const _getTagColorsByShop = (shopId) => {
        return useQuery(_FETCH_TAG_COLORS_BY_SHOP, {
			variables: {
				shopId,
			},
		});
    }

    return {
        UPDATE_USER_MUTATION: _UPDATE_USER_MUTATION,
        CHANGE_PASSWORD_MUTATION: _CHANGE_PASSWORD_MUTATION,
        getTagColorsByShop: _getTagColorsByShop
    }
})();

export default UserService