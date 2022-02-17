export const ROLES = {
    ADMIN: 1,
    SHOP_ADMIN: 10,
    STAFF: 15,
    ARTIST: 20,
    CLIENT: 30
};

export const AUTH_ERROR_MESSAGES = {
    TOKEN_IS_INVALID: 'Token is invalid',
    AUTH_FAILED: 'You are not authenticated',
    UNAUTHORIZED_ACTION: 'You are not authorized to perform this action',
    INCORRECT_CREDENTIALS: 'The username and/or password submitted are not correct.  Please try again.',
    INVALID_REQUEST: 'The request you made is not valid, please check the URL and try again'
};

export const AUTH_SUCCESS_MESSAGES = {
    DELETE_SUCCESSFUL: 'Delete request successful!',
    UPDATE_SUCCESSFUL: 'Update request successful',
    CREATE_SUCCESSFUL: 'Create request successful'
};