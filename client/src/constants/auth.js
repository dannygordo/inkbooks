// Names match server/utils/constants.js exactly. They didn't: this file called 15 STAFF while
// the server called it SHOP_STAFF, so the same number had two names depending on which half of
// the codebase you were reading - and a role check written from memory in the wrong file is a
// silent authorization bug, not a compile error.
//
// Lower is more privileged throughout, so "at least this privileged" is `role <= X`.
export const ROLES = {
	// Reserved, and deliberately powerless - see server/utils/constants.js. Nothing grants
	// cross-shop access any more; don't write UI that assumes this role sees more than a
	// SHOP_ADMIN does.
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

// Mirrors server/utils/constants.js's ARTIST_STATUS / STAFF_STATUS / CLIENT_STATUS. Same reason
// ROLES lives here: a status number written from memory in the wrong file is a silent bug, not a
// compile error.
//
// ARCHIVED is 4 in all three, deliberately - "archived" is one fact, not three. Archiving is how
// someone is removed from the app; there is no delete (see server/graphql/typeDefs.js). It never
// touches history: an archived artist's completed sessions still count toward shop revenue.
//
// Absent/undefined means active everywhere. Client.status and Staff.status were added with
// archiving, so records predating it have no value, and treating unset as anything else would
// hide them all.
export const ARTIST_STATUS = {
	ACTIVE: 1,
	INACTIVE: 2,
	BOOKS_CLOSED: 3,
	ARCHIVED: 4,
};

export const STAFF_STATUS = {
	ACTIVE: 1,
	ARCHIVED: 4,
};

export const CLIENT_STATUS = {
	ACTIVE: 1,
	ARCHIVED: 4,
};
