// Reads whatever is CURRENTLY in the database MONGODB points at (the local dev database, per
// Danny's 2026-09-05 request to seed from real current data instead of a hand-written fixture)
// and writes it to scripts/seed-data/copperwolf/ as a snapshot that scripts/seed-copperwolf.js
// restores on every reseed. Run this whenever you want the seed to pick up whatever you've since
// added or changed locally - it is read-only against both Mongo and Storage, never deletes or
// modifies anything in either, and is safe to re-run any time.
//
// WHAT GETS CAPTURED:
//   - every document in every collection scripts/lib/copperwolf-collections.js lists, as EJSON
//     (Mongo's own JSON-with-types format - preserves ObjectId/Date/etc. exactly, unlike
//     JSON.stringify, so a restored document is byte-for-byte the same types, not a stringified
//     approximation) - one file per collection under mongo/.
//   - every Firebase Storage file actually referenced by one of those documents (avatars, project
//     reference/body/design images, message attachments, form uploads, shared images - see
//     scripts/lib/copperwolf-storage-refs.js for the exact field list) - downloaded into
//     storage-files/, alongside a manifest recording each file's object path, content type, and
//     download token.
//
// WHY THE FILES THEMSELVES, NOT JUST THE URLS: scripts/seed-copperwolf.js always wipes Storage
// before reloading data (Danny's explicit "wipe it every time, even locally", 2026-09-04). The
// exported Mongo documents keep their real download URLs completely unchanged - restoring the
// same bytes to the same object path with the same firebaseStorageDownloadTokens metadata makes
// those exact URLs valid again, with no rewriting needed anywhere in the restored documents.
//
// WHAT DOES NOT GET CAPTURED: Firebase Auth users (out of scope - see seed-copperwolf.js's header
// on why), and any Storage file that isn't referenced by any field copperwolf-storage-refs.js
// knows about (a file nothing points to has nothing to restore its reference from anyway, and is
// exactly the kind of orphan this whole effort started to get rid of - see seed-copperwolf.js).
//
// Usage (from server/):
//   npm run export:copperwolf          # NODE_ENV unset -> .env.development -> local dev database
//   npm run export:copperwolf:prod     # NODE_ENV=PRODUCTION -> .env.production -> real Atlas
//                                       # cluster, if you ever want to snapshot production instead

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

if (process.env.NODE_ENV !== 'PRODUCTION') {
  dotenv.config({ path: path.join(__dirname, '..', '.env.development') });
} else {
  dotenv.config({ path: path.join(__dirname, '..', '.env.production') });
}

const mongoose = require('mongoose');

const { COLLECTIONS } = require('./lib/copperwolf-collections');
const { initFirebaseBucket } = require('./lib/copperwolf-firebase');
const { extractStorageUrls, parseDownloadUrl } = require('./lib/copperwolf-storage-refs');

const { EJSON } = mongoose.mongo.BSON;

const DATA_DIR = path.join(__dirname, 'seed-data', 'copperwolf');
const MONGO_DIR = path.join(DATA_DIR, 'mongo');
const STORAGE_FILES_DIR = path.join(DATA_DIR, 'storage-files');

const mongoUri = (process.env.MONGODB || '').replace(/,\s*$/, '');
if (!mongoUri) {
  throw new Error('MONGODB environment variable is not set - check server/.env.development(.production).');
}
const redactedUri = mongoUri.replace(/\/\/.*@/, '//***@');

async function exportMongoCollections() {
  fs.mkdirSync(MONGO_DIR, { recursive: true });
  const counts = {};
  const urlsByCollection = {};

  for (const { name, Model } of COLLECTIONS) {
    const docs = await Model.find({}).lean();
    fs.writeFileSync(path.join(MONGO_DIR, `${name}.json`), EJSON.stringify(docs, null, 2));
    counts[name] = docs.length;
    console.log(`  ${name}: ${docs.length} document(s)`);

    const urls = [];
    for (const doc of docs) {
      urls.push(...extractStorageUrls(name, doc));
    }
    if (urls.length > 0) {
      urlsByCollection[name] = urls;
    }
  }
  return { counts, urlsByCollection };
}

async function exportStorageFiles(bucket, urlsByCollection) {
  fs.mkdirSync(STORAGE_FILES_DIR, { recursive: true });

  // Dedup across collections/fields - the same file is legitimately referenced from more than one
  // place (a SharedImage.url is always a copy of a Message.imageUrls entry, never a second file -
  // see models/SharedImage.js).
  const allUrls = new Set(Object.values(urlsByCollection).flat());

  const manifest = [];
  const skipped = [];
  let bytesDownloaded = 0;

  for (const url of allUrls) {
    const parsed = parseDownloadUrl(url);
    if (!parsed) {
      skipped.push({ url, reason: 'not a recognized Firebase download URL' });
      continue;
    }
    const { objectPath, token } = parsed;
    const file = bucket.file(objectPath);
    try {
      const [exists] = await file.exists();
      if (!exists) {
        skipped.push({ url, reason: 'referenced but no longer exists in Storage' });
        continue;
      }
      const [metadata] = await file.getMetadata();
      const [buffer] = await file.download();
      const localPath = path.join(STORAGE_FILES_DIR, objectPath);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buffer);
      bytesDownloaded += buffer.length;
      manifest.push({
        objectPath,
        token,
        contentType: metadata.contentType || 'application/octet-stream',
      });
    } catch (err) {
      skipped.push({ url, reason: err.message || String(err) });
    }
  }

  fs.writeFileSync(path.join(DATA_DIR, 'storage-manifest.json'), JSON.stringify(manifest, null, 2));
  return { fileCount: manifest.length, bytesDownloaded, skipped, totalReferenced: allUrls.size };
}

async function run() {
  console.log(`Connecting to ${redactedUri} ...`);
  await mongoose.connect(mongoUri);
  const bucket = initFirebaseBucket();

  console.log(`\nExporting Mongo collections to ${MONGO_DIR} ...`);
  const { counts, urlsByCollection } = await exportMongoCollections();
  const totalDocs = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const referencedCount = Object.values(urlsByCollection).reduce((sum, arr) => sum + arr.length, 0);

  console.log(`\nDownloading Storage files behind ${referencedCount} referencing field value(s) ...`);
  const storageResult = await exportStorageFiles(bucket, urlsByCollection);

  const info = {
    exportedAt: new Date().toISOString(),
    sourceUri: redactedUri,
    collectionCounts: counts,
    totalDocuments: totalDocs,
    storageFilesExported: storageResult.fileCount,
    storageBytesExported: storageResult.bytesDownloaded,
    storageUrlsSkipped: storageResult.skipped,
  };
  fs.writeFileSync(path.join(DATA_DIR, 'snapshot-info.json'), JSON.stringify(info, null, 2));

  console.log('\nDone.');
  console.log(`  ${totalDocs} document(s) across ${COLLECTIONS.length} collection(s).`);
  console.log(
    `  ${storageResult.fileCount} Storage file(s), ${(storageResult.bytesDownloaded / 1024).toFixed(1)} KB.`
  );
  if (storageResult.skipped.length > 0) {
    console.log(
      `  ${storageResult.skipped.length} referenced URL(s) could not be downloaded - see ` +
        'snapshot-info.json (storageUrlsSkipped) for which ones and why.'
    );
  }
  console.log(`\nSnapshot written to ${DATA_DIR}`);
  console.log('Run "npm run seed:copperwolf" to wipe and restore from this snapshot.');

  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nExport failed:', err);
    process.exit(1);
  });
