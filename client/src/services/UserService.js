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
            userInfo {
                firstName
                lastName
                avatar
                id
            }
        }
    }
    `;

    const _FORGOT_PASSWORD_MUTATION = gql`
    mutation ForgotPassword($username: String!, $password: String!) {
        forgotPassword(username: $username, password: $password) {
            id
            email
            username
            firstName
            lastName
            avatar
            role
            accessToken
            userType
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

    return {
        UPDATE_USER_MUTATION: _UPDATE_USER_MUTATION,
        FORGOT_PASSWORD_MUTATION: _FORGOT_PASSWORD_MUTATION
    }
})();

export default UserService