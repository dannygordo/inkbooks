// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { FIREBASE } from "../config";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
	apiKey: FIREBASE.API_KEY,
	authDomain: FIREBASE.AUTH_DOMAIN,
	projectId: FIREBASE.PROJECT_ID,
	storageBucket: FIREBASE.STORAGE_BUCKET,
	messagingSenderId: FIREBASE.MESSAGING_SENDER_ID,
	appId: FIREBASE.APP_ID,
	measurementId: FIREBASE.MEASUREMENT_ID,
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
// getAnalytics() is skipped under Vitest (import.meta.env.MODE === "test" - see apiUrl.js's own
// comment on this same convention) rather than called unconditionally at module load. It isn't
// just unnecessary noise in tests: @firebase/analytics schedules its own gtag-script detection
// (findGtagScriptOnPage, in a network-touching check that runs after this module's synchronous
// import finishes) which can still be in flight when a test file's jsdom environment gets torn
// down, throwing "window is not defined" as an unhandled rejection attributed to whichever test
// happens to be running at that moment (first observed surfacing via Settings.test.jsx, though the
// dangling promise itself is created by every test that transitively imports this module through
// AuthContext, not by Settings.jsx itself). No behavior change outside tests - analytics still
// initializes normally in development and production.
export const analytics = import.meta.env.MODE === "test" ? null : getAnalytics(app);
export const storage = getStorage(app);
export const db = getFirestore();
export const auth = getAuth();
