const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Replaces the old shared Firebase login (a single hardcoded email/password every user of the
// app signed into) with real per-user Firebase Auth. The server mints a short-lived custom
// token for the specific authenticated app user, using their own Mongo _id as the Firebase uid,
// and the client exchanges it for a real per-user Firebase session via signInWithCustomToken.
//
// This requires a Firebase service account key, which is NOT something Claude/an AI agent can
// generate - it has to come from your own Firebase Console access:
//   1. Firebase Console -> Project Settings (gear icon) -> Service Accounts
//   2. "Generate new private key" -> downloads a JSON file
//   3. Save it somewhere OUTSIDE version control, e.g. server/firebase-service-account.json
//      (already covered by the *firebase-adminsdk*.json / firebase-service-account*.json
//      patterns added to .gitignore - never commit this file)
//   4. Set FIREBASE_SERVICE_ACCOUNT_PATH in server/.env(.production/.development) to point at it,
//      e.g. FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

let initialized = false;

function ensureInitialized() {
  if (initialized) {
    return true;
  }
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    console.warn(
      '[firebase-admin] FIREBASE_SERVICE_ACCOUNT_PATH is not set - Firebase custom token ' +
        'minting is disabled. Login/register will still work, but per-user Firebase Storage ' +
        'access (uploading/deleting images) will not until this is configured.'
    );
    return false;
  }
  const resolvedPath = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    console.warn(
      `[firebase-admin] FIREBASE_SERVICE_ACCOUNT_PATH is set to "${serviceAccountPath}" but no ` +
        'file exists there. Firebase custom token minting is disabled.'
    );
    return false;
  }
  try {
    admin.initializeApp({
      credential: admin.credential.cert(require(resolvedPath)),
    });
    initialized = true;
    return true;
  } catch (err) {
    console.warn('[firebase-admin] Failed to initialize Firebase Admin SDK:', err.message);
    return false;
  }
}

/**
 * Mints a Firebase custom token for a specific app user, scoped to that user's own Mongo _id
 * as the Firebase uid. Custom claims (role, userType) are attached so Storage/Firestore
 * security rules can be written against request.auth.token.* later without another round trip.
 * Returns null (rather than throwing) if Firebase Admin isn't configured yet, so login/register
 * keep working even before the service account key is set up.
 */
async function mintFirebaseToken(userId, claims = {}) {
  if (!ensureInitialized()) {
    return null;
  }
  try {
    return await admin.auth().createCustomToken(String(userId), claims);
  } catch (err) {
    console.warn('[firebase-admin] Failed to mint custom token:', err.message);
    return null;
  }
}

module.exports = { mintFirebaseToken };
