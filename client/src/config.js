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

// The SQUARE block is gone from this file entirely.
//
// It held APPLICATION_ID and LOCATION_ID, which are genuinely public identifiers - Square's own
// Web Payments SDK needs them in the browser, so keeping them here wasn't a secrets leak and
// wasn't why they were removed.
//
// They were removed because a hardcoded APPLICATION_ID is a SECOND definition of a value the
// server already holds, and the two drifted: this file named one Square sandbox application while
// SQUARE_SANDBOX_ACCESS_TOKEN named a different one. A card nonce is only chargeable by the
// application that minted it, so the browser tokenized against app A and the server charged with
// app B's token. Square's rejection ("Card nonce not found in this application environment") is
// accurate and unreadable unless you already know to diff two files in different halves of the
// repo.
//
// Both values now come from GET /square/config, served from the same env the charge itself reads.
// See client/src/components/IBSquarePayments/squareConfig.js. Don't put them back here.
//
// ACCESS_TOKEN was also once in this block, as a plain string - that one WAS a real leak, bundled
// into the client JS and extractable from devtools by anyone. It lives only in the server's
// environment now. Don't put that back either.
