import React, { useReducer, createContext, useState, useContext } from "react";
import { useApolloClient } from "@apollo/client";
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
	// AuthProvider must be rendered INSIDE ApolloProvider. It is (see index.jsx), and it has to be:
	// ending a session means discarding what that session cached, and this is the only component
	// that knows a session ended.
	const apollo = useApolloClient();
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

	/**
	 * Throws away everything the previous session cached.
	 *
	 * ---------------------------------------------------------------------------------------------
	 * THE BUG THIS EXISTS FOR
	 *
	 * Log in as an artist, log out, log in as a shop admin, log out, log back in as the artist - and
	 * the shop admin's clients were on the artist's screen, for an artist who isn't even connected
	 * to that shop.
	 *
	 * There is ONE InMemoryCache, constructed at module load in index.jsx, and it lived for the
	 * lifetime of the browser tab. logout() cleared localStorage and signed out of Firebase and
	 * never touched it. So every normalised entity the shop admin's session read - Client:..,
	 * Project:.., Shop:.. - and every ROOT_QUERY field keyed by its variables sat there waiting for
	 * whoever logged in next.
	 *
	 * The reason it renders rather than merely lingering: Apollo's default fetchPolicy is
	 * cache-first. A query whose ROOT_QUERY entry is already populated for those variables is
	 * answered from memory and NEVER SENT. The server's shop-scoping is intact and was never
	 * consulted, because no request was made - which is also why this could not have been caught by
	 * any server-side test.
	 *
	 * WHY BOTH CALLS
	 *
	 *   cache.reset()  is synchronous. It closes the window between "the session changed" and "the
	 *                  cache is empty" - clearStore() alone defers to a microtask, and a component
	 *                  rendering in that window would read the old user's data.
	 *   clearStore()   additionally tears down in-flight queries. A response for the PREVIOUS user
	 *                  that is still in the air would otherwise land after the wipe and write that
	 *                  user's data straight back in. Not refetched afterwards, deliberately:
	 *                  resetStore() would re-run every active query, and on logout those would fire
	 *                  with no credential at all.
	 * ---------------------------------------------------------------------------------------------
	 */
	const discardSessionCache = () => {
		apollo.cache.reset();
		// Active queries are expected to error rather than refetch - see above. Swallowed because
		// the session change has already happened and cannot be undone by a failed teardown.
		Promise.resolve(apollo.clearStore()).catch(() => {});
	};

	/**
	 * THE ONE PLACE THE SIGNED-IN IDENTITY CHANGES.
	 *
	 * login() and logout() used to each write storage and dispatch by hand, which is how the cache
	 * wipe came to be missing from one of them - there was no single place it could have been added
	 * that covered both. A new session-ending path (a token expiring, a forced sign-out, anything
	 * added later) goes through here and inherits the wipe rather than having to remember it.
	 *
	 * @param {object|null} userData - null ends the session.
	 */
	const setSession = (userData) => {
		// UNCONDITIONAL, not "only when the id changed". A rule with no exceptions is one that
		// cannot be reasoned about wrongly at three in the morning, and the cost of the case it
		// over-covers - the same person authenticating twice in a row - is one round trip.
		discardSessionCache();

		if (userData) {
			CacheService.setItem(
				AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
				JSON.stringify(userData)
			);
			dispatch({
				type: AUTH_SETTINGS_CONSTANTS.AUTH_REDUCER_TYPES.LOGIN,
				payload: userData,
			});
		} else {
			CacheService.removeItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE);
			dispatch({ type: AUTH_SETTINGS_CONSTANTS.AUTH_REDUCER_TYPES.LOGOUT });
		}
	};

	const login = (userData) => {
		setSession(userData);

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
	/**
	 * The SAME person, re-read - a renamed profile, a rate changed in Settings, the refresh at the
	 * end of the signup wizard.
	 *
	 * DELIBERATELY DOES NOT GO THROUGH setSession, because it must NOT discard the cache. Nobody
	 * signed in or out; throwing away every cached query because somebody edited their own display
	 * name would refetch the entire screen they are standing on. The distinction that matters for
	 * the leak is "whose session is this", and that is exactly what has not changed here.
	 */
	const updateCurrentUser = (userData) => {
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
		setSession(null);
		// Now that each user gets their own real Firebase identity (rather than everyone sharing
		// one static account), it matters that logging out of the app also ends that Firebase
		// session - otherwise it lingers in the browser, which is a real concern on a shared
		// front-desk device.
		signOut(auth).catch((error) => console.log(error.code, error.message));
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
