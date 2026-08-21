// firebase-admin 14.x dropped the legacy namespaced API (`admin.credential.cert`,
// `admin.auth()`) from the default `require('firebase-admin')` export entirely - it's
// modular-only now, same pattern the client SDK moved to a couple of majors ago.
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getStorage, getDownloadURL } = require('firebase-admin/storage');
const logger = require('./logger');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
let authInstance = null;
let bucketInstance = null;

function ensureInitialized() {
  if (initialized) {
    return true;
  }
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    logger.warn(
      '[firebase-admin] FIREBASE_SERVICE_ACCOUNT_PATH is not set - Firebase custom token ' +
        'minting is disabled. Login/register will still work, but per-user Firebase Storage ' +
        'access (uploading/deleting images) will not until this is configured.'
    );
    return false;
  }
  const resolvedPath = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    logger.warn(
      `[firebase-admin] FIREBASE_SERVICE_ACCOUNT_PATH is set to "${serviceAccountPath}" but no ` +
        'file exists there. Firebase custom token minting is disabled.'
    );
    return false;
  }
  try {
    // storageBucket matches client/src/config.js's FIREBASE.STORAGE_BUCKET (not a secret - it's
    // the same value Firebase's own client SDK config exposes to every browser) - set via env
    // var here rather than hardcoded so dev/prod can point at different projects if that ever
    // changes.
    const app = initializeApp({
      credential: cert(require(resolvedPath)),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    authInstance = getAuth(app);
    if (process.env.FIREBASE_STORAGE_BUCKET) {
      bucketInstance = getStorage(app).bucket();
    } else {
      logger.warn(
        '[firebase-admin] FIREBASE_STORAGE_BUCKET is not set - guest reference-image uploads ' +
          'are disabled until this is configured (Firebase custom token minting is unaffected).'
      );
    }
    initialized = true;
    return true;
  } catch (err) {
    logger.warn({ err }, '[firebase-admin] Failed to initialize Firebase Admin SDK');
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
    return await authInstance.createCustomToken(String(userId), claims);
  } catch (err) {
    logger.warn({ err, userId }, '[firebase-admin] Failed to mint custom token');
    return null;
  }
}

/**
 * Uploads a single anonymously-submitted file (raw Buffer, already validated for type/size by the
 * caller) to a scoped path under Storage, and returns a permanent public download URL.
 *
 * GENERALIZED from what used to be uploadGuestReferenceImage's own hardcoded `booking-uploads/`
 * path - routes/formUploads.js (a form's file-upload/signature-adjacent fields) needed the exact
 * same Storage logic under a different folder, and a second copy of this function differing only
 * in one hardcoded path string is exactly the kind of duplication this codebase's own comments
 * elsewhere warn is how two copies of one fact quietly drift apart.
 *
 * Uses getDownloadURL() (firebase-admin/storage's own helper, not a hand-rolled signed URL) -
 * V4 signed URLs cap out at 7 days no matter what expiry you ask for, which doesn't fit a
 * reference image a client and artist may still be discussing weeks later. getDownloadURL()
 * mints the same kind of long-lived, token-based URL the client SDK's own getDownloadURL()
 * produces for authenticated uploads elsewhere in this app (see firebase/IBUploadFile.js) - same
 * effective security posture (permanent-by-URL), not a new one.
 *
 * Filenames are never trusted from the client - the returned path is a fresh random UUID plus a
 * fixed, validated extension, so nothing about the original filename ever reaches Storage.
 *
 * Throws on failure - the route calling this is responsible for turning that into an HTTP error
 * response. Returns null only if Firebase Admin/Storage isn't configured yet, matching
 * mintFirebaseToken's existing "degrade, don't crash the server" convention.
 */
async function uploadPublicFile(buffer, { extension, folder }) {
  if (!ensureInitialized() || !bucketInstance) {
    return null;
  }
  const filename = `${folder}/${crypto.randomUUID()}${extension}`;
  const file = bucketInstance.file(filename);
  await file.save(buffer, {
    metadata: {
      contentType: extensionToContentType(extension),
      // Set here (rather than as a separate setMetadata call after) - firebaseStorageDownloadTokens
      // is read case-sensitively by getDownloadURL()/the client SDK, and some upload paths lowercase
      // headers, so setting it once at save-time avoids that entirely.
      metadata: { firebaseStorageDownloadTokens: crypto.randomUUID() },
    },
  });
  return getDownloadURL(file);
}

// Thin, folder-fixed wrappers so every existing call site keeps its own descriptive name rather
// than every route inlining its own folder string (a typo'd folder name is otherwise invisible
// until someone goes looking in Storage for files that technically uploaded fine).
async function uploadGuestReferenceImage(buffer, { extension }) {
  return uploadPublicFile(buffer, { extension, folder: 'booking-uploads' });
}
async function uploadFormSubmissionFile(buffer, { extension }) {
  return uploadPublicFile(buffer, { extension, folder: 'form-uploads' });
}
// Third caller of uploadPublicFile - see routes/messageUploads.js. A message attachment isn't
// guest/public in the sense the other two folders are (a real Conversation membership check gates
// who ever sees the resulting URL, via createMessage/getMessagesByConversationId), but Storage
// itself has no concept of that - the file just needs a folder of its own so a Storage-side
// listing can tell the three upload kinds apart, same reasoning as the other two.
async function uploadMessageAttachment(buffer, { extension }) {
  return uploadPublicFile(buffer, { extension, folder: 'message-uploads' });
}

const EXTENSION_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function extensionToContentType(extension) {
  return EXTENSION_CONTENT_TYPES[extension] || 'application/octet-stream';
}

module.exports = {
  mintFirebaseToken,
  uploadGuestReferenceImage,
  uploadFormSubmissionFile,
  uploadMessageAttachment,
  EXTENSION_CONTENT_TYPES,
};
