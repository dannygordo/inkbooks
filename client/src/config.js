// Was `module.exports = {...}` (CommonJS) despite being consumed elsewhere via ES named imports
// (`import { FIREBASE } from "../config"`, `import { SQUARE } from "../../config"`) - Webpack's
// CJS/ESM interop silently made that work under CRA, but Vite's dev server serves source files
// as native ESM with no such interop for local (non-npm-package) modules - `module` isn't even
// defined in that context, so this would have thrown "module is not defined" the instant
// firebase.js or squareConfig.js loaded. Converted to real ES named exports matching those exact
// import sites - same values, same names, no consumer file needed to change.

// NOTE: EMAIL/EMAIL_PWD used to live here - a single shared Firebase account every user
// signed into. That credential shipped inside the compiled JS bundle to every browser that
// loaded the app, extractable via devtools by anyone. It's gone now: each user signs into
// Firebase with their own identity via a custom token minted server-side at login
// (server/utils/firebase-admin.js). Don't add a static Firebase credential back here.
// inkbooks-872df was stale/wrong config from some earlier point in this project's history -
// it doesn't match the service account key or the actual Firebase project in use. The real
// project is inkbooks-cd85b, pulled directly from its web app config in the Firebase Console.
// (DATABASE_URL was dropped - it was a gs:// Storage URI mislabeled as a Realtime Database
// URL, and nothing in this app calls getDatabase()/uses Realtime Database at all.)
export const FIREBASE = {
    API_KEY: 'AIzaSyC-LKgnpiw2dUqhh5b-p1EZfRorTdJaSqo',
    AUTH_DOMAIN: 'inkbooks-cd85b.firebaseapp.com',
    PROJECT_ID: 'inkbooks-cd85b',
    STORAGE_BUCKET: 'inkbooks-cd85b.firebasestorage.app',
    MESSAGING_SENDER_ID: '437606997241',
    APP_ID: '1:437606997241:web:d99ee8cf975e0031551628',
    MEASUREMENT_ID: 'G-5DLVM35CTN'
};

// ACCESS_TOKEN removed - it was sitting here as a plain string, which means it was being
// bundled into the compiled client JS and shipped to every browser that loaded the app,
// extractable via devtools by anyone. Same class of bug as the shared Firebase credential
// fixed above. Square's ACCESS_TOKEN is a real secret and must only ever live server-side
// (env var), used to call Square's Payments API after the client sends up a card nonce.
// APPLICATION_ID and LOCATION_ID are safe to keep here - Square's own Web Payments SDK
// requires them client-side and treats them as public identifiers, not secrets.
// PROCESS_URL still points at a localhost:4000 endpoint that doesn't exist in this
// codebase yet - this Square integration is unfinished and won't work in production
// regardless of this fix. Flagging, not building it out - that's a separate task.
export const SQUARE = {
    SANDBOX: {
        APPLICATION_NAME: 'inkbooks',
        APPLICATION_ID: 'sandbox-sq0idb-jP6MNHK_aUZtUZgYMYc0RA',
        LOCATION_ID: 'L8YSXGA7M0B9X',
        PROCESS_URL: 'http://localhost:4000/process-payment'
    },
    PRODUCTION: {
        APPLICATION_NAME: 'inkbooks',
        APPLICATION_ID: 'sandbox-sq0idb-jP6MNHK_aUZtUZgYMYc0RA',
        LOCATION_ID: 'L8YSXGA7M0B9X',
        PROCESS_URL: 'http://localhost:4000/process-payment'
    }
};
