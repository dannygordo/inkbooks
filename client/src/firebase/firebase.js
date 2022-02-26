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
	databaseURL: FIREBASE.DATABASE_URL,
	projectId: FIREBASE.PROJECT_ID,
	storageBucket: FIREBASE.STORAGE_BUCKET,
	messagingSenderId: FIREBASE.MESSAGING_SENDER_ID,
	appId: FIREBASE.APP_ID,
	measurementId: FIREBASE.MEASUREMENT_ID,
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const storage = getStorage(app);
export const db = getFirestore();
export const auth = getAuth();
