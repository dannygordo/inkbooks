import React, { useReducer, createContext, useState, useContext } from "react";
import jwtDecode from "jwt-decode";
import { CacheService } from "../services/CacheService";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "../firebase/firebase";
import { AUTH_SETTINGS_CONSTANTS } from "../constants";

const initialState = {
	user: null,
	firebaseUser: null,
};

if (CacheService.getItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE)) {
	const token = jwtDecode(
		CacheService.getItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE)
			.accessToken
	);

	if (token.exp * 1000 < Date.now()) {
		CacheService.removeItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE);
	} else {
		initialState.user = CacheService.getItem(
			AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE
		);
	}
}

const AuthContext = createContext({
	user: null,
	firebaseUser: null,
	login: (userData) => {},
	logout: () => {},
});

export const useAuth = () => {
	return useContext(AuthContext);
};

function authReducer(state, action) {
	switch (action.type) {
		case AUTH_SETTINGS_CONSTANTS.AUTH_REDUCER_TYPES.LOGIN:
			return {
				...state,
				user: action.payload,
			};
		case AUTH_SETTINGS_CONSTANTS.AUTH_REDUCER_TYPES.LOGOUT:
			return {
				...state,
				user: null,
			};
		case AUTH_SETTINGS_CONSTANTS.AUTH_REDUCER_TYPES.FIREBASE_LOGIN:
			return {
				...state,
				firebaseUser: action.payload,
			};
		case AUTH_SETTINGS_CONSTANTS.AUTH_REDUCER_TYPES.UPDATE_USER:
			console.log(action.payload);
			return {
				...state,
				user: action.payload
			};
		default:
			return state;
	}
}

function AuthProvider(props) {
	const [state, dispatch] = useReducer(authReducer, initialState);
	const [modal, setModal] = useState({
		isOpen: false,
		title: "",
		content: "",
	});
	const [alert, setAlert] = useState({
		isAlert: false,
		severity: "info",
		message: "",
		timeout: null,
		location: "",
	});
	const [loading, setLoading] = useState(false);

	const login = (userData) => {
		CacheService.setItem(
			AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
			JSON.stringify(userData)
		);

		dispatch({
			type: AUTH_SETTINGS_CONSTANTS.AUTH_REDUCER_TYPES.LOGIN,
			payload: userData,
		});

		// Sign into Firebase as this specific user (for Storage access - project images, avatars,
		// etc.), using a short-lived custom token the server minted for this exact account.
		// This replaces the old pattern of every user signing into one shared, hardcoded
		// firebase@inkbooks.net account - see server/utils/firebase-admin.js for why that was a
		// real problem and what changed. If firebaseToken is missing (server's Firebase Admin
		// SDK isn't configured yet), skip Firebase sign-in rather than crashing the login flow -
		// app login/auth still works, only Firebase Storage features are affected.
		if (userData.firebaseToken) {
			signInWithCustomToken(auth, userData.firebaseToken)
				.then((userCredential) => {
					const fbUser = userCredential.user;
					dispatch({
						type: AUTH_SETTINGS_CONSTANTS.AUTH_REDUCER_TYPES
							.FIREBASE_LOGIN,
						payload: fbUser,
					});
				})
				.catch((error) => {
					console.log(error.code, error.message);
				});
		} else {
			console.warn(
				"No firebaseToken returned at login - Firebase Storage features " +
					"(image upload/delete) will not work until the server's Firebase Admin SDK is configured."
			);
		}
	};
	const updateCurrentUser = (userData) => {
		CacheService.removeItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE);
		CacheService.setItem(
			AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
			JSON.stringify(userData)
		);
		dispatch({
			type: AUTH_SETTINGS_CONSTANTS.AUTH_REDUCER_TYPES.UPDATE_USER,
			payload: userData
		});
	};

	const logout = () => {
		CacheService.removeItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE);
		// Now that each user gets their own real Firebase identity (rather than everyone sharing
		// one static account), it matters that logging out of the app also ends that Firebase
		// session - otherwise it lingers in the browser, which is a real concern on a shared
		// front-desk device.
		signOut(auth).catch((error) => console.log(error.code, error.message));
		dispatch({ type: AUTH_SETTINGS_CONSTANTS.AUTH_REDUCER_TYPES.LOGOUT });
	};

	return (
		<AuthContext.Provider
			value={{
				user: state.user,
				firebaseUser: state.firebaseUser,
				login,
				updateCurrentUser,
				logout,
				modal,
				setModal,
				alert,
				setAlert,
				loading,
				setLoading,
			}}
			{...props}
		/>
	);
}

export { AuthContext, AuthProvider };
