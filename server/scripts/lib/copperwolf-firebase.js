// Shared, self-contained Firebase Admin bucket init for the copperwolf scripts (seed + export) -
// deliberately NOT reusing utils/firebase-admin.js's module-scoped ensureInitialized()/
// bucketInstance, which never exposes its bucket to callers (by design, it's only used internally
// for uploads elsewhere in the server). Both copperwolf scripts are standalone one-off processes,
// so calling initializeApp() directly here is safe - nothing else in either process has already
// called it.
const path = require('path');
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');

function initFirebaseBucket() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!serviceAccountPath || !bucketName) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_PATH / FIREBASE_STORAGE_BUCKET must both be set - this script ' +
        'always touches Firebase Storage and refuses to run without them rather than silently ' +
        'skipping that step.'
    );
  }
  const resolvedPath = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`No file exists at FIREBASE_SERVICE_ACCOUNT_PATH ("${serviceAccountPath}").`);
  }
  const app = initializeApp({
    credential: cert(require(resolvedPath)),
    storageBucket: bucketName,
  });
  return getStorage(app).bucket();
}

module.exports = { initFirebaseBucket };
