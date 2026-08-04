// Names match server/utils/constants.js exactly. They didn't: this file called 15 STAFF while
// the server called it SHOP_STAFF, so the same number had two names depending on which half of
// the codebase you were reading - and a role check written from memory in the wrong file is a
// silent authorization bug, not a compile error.
//
// Lower is more privileged throughout, so "at least this privileged" is `role <= X`.
export const ROLES = {
	ADMIN: 1,
	SHOP_ADMIN: 10,
	SHOP_STAFF: 15,
	ARTIST: 20,
	CLIENT: 30,
};

export const AUTH_ERROR_MESSAGES = {
	TOKEN_IS_INVALID: "Token is invalid",
	AUTH_FAILED: "You are not authenticated",
	UNAUTHORIZED_ACTION: "You are not authorized to perform this action",
	INCORRECT_CREDENTIALS:
		"The username and/or password submitted are not correct.  Please try again.",
	INVALID_REQUEST:
		"The request you made is not valid, please check the URL and try again",
};

export const AUTH_SUCCESS_MESSAGES = {
	DELETE_SUCCESSFUL: "Delete request successful!",
	UPDATE_SUCCESSFUL: "Update request successful",
	CREATE_SUCCESSFUL: "Create request successful",
};

export const AUTH_SETTINGS_CONSTANTS = {
	CURRENT_USER_CACHE: "token",
	CURRENT_FIREBASE_USER_CACHE: "fbu",
	AUTH_REDUCER_TYPES: {
		LOGIN: "LOGIN",
		LOGOUT: "LOGOUT",
		FIREBASE_LOGIN: "FIREBASE_LOGIN",
		UPDATE_USER: "UPDATE_USER",
	},
	RESPONSE_MESSAGES: {
		IMAGE_UPLOAD_SUCCESS: "Images have been uploaded successfully!",
		RECORD_UPDATE_SUCCESS: "Changes have been successfully saved!!",
	},
};
