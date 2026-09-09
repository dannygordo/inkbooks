// Wipes EVERY collection in whatever database MONGODB points at, wipes EVERY file in the Firebase
// Storage bucket FIREBASE_STORAGE_BUCKET points at, and restores both from a snapshot of Danny's
// real Copper Wolf data - the shop, staff, artists, and whatever else is in the database at
// snapshot time (bookings, projects, forms, images, everything) - instead of a hand-written
// fixture (see scripts/seed.js/scripts/seed-large.js for that kind of fixture, with made-up
// names).
//
// THIS SCRIPT DOES NOT CREATE ANY NEW DATA ITSELF. Everything it loads comes from the snapshot at
// scripts/seed-data/copperwolf/, produced by running scripts/export-copperwolf-snapshot.js against
// whichever database currently holds the data you want to seed from (originally: the local dev
// database, per Danny's 2026-09-05 request - "seed the database with the current data I've put
// into the database"). Re-run the export whenever you want the seed to pick up more recent
// changes; this script always restores whatever the snapshot currently contains, nothing more and
// nothing less.
//
// EARLIER VERSION OF THIS SCRIPT (2026-09-05, same day) hardcoded a specific roster - Danny,
// Aimee, Cass, Mary, Lydia, Michelle, Meagan - with a shared devpass123 password, and sent each of
// them a real "your account is ready" email on every run. That is gone: with real accounts now
// coming from a real snapshot, their real (already-hashed) passwords travel with them as part of
// the restore, and there is no new account being created for anyone to be emailed about. If you
// ever need brand-new throwaway fixture accounts again, that is what scripts/seed.js is for.
//
// READ ALL OF THIS BEFORE RUNNING IT.
//
// ---------------------------------------------------------------------------------------------
// ONE CRITICAL THING THIS SCRIPT CANNOT PROTECT YOU FROM: .env.development and .env.production
// currently point at the SAME Firebase Storage bucket (see both files' FIREBASE_STORAGE_BUCKET
// value - there is no separate dev project). Only MONGODB is actually separated by environment
// (localhost in .env.development, the real Atlas cluster in .env.production, same convention
// index.js already uses). That means every run of this script, local or production, wipes the
// SAME real Firebase Storage bucket before restoring the snapshot's own files back into it - there
// is no "safe" local Firebase to test against. (Confirmed with Danny 2026-09-05.)
//
// FIREBASE AUTH IS NOT TOUCHED. Only Cloud Storage is wiped and restored. A Firebase Auth user is
// created lazily (keyed by Mongo _id) the first time someone logs in and the client exchanges a
// custom token - see utils/firebase-admin.js. Wiping Mongo means old Firebase Auth entries become
// orphaned (a Firebase Auth uid with no matching Mongo user), but they hold no images and cost
// nothing, so they are out of scope for what Danny actually asked for ("no orphaned images").
//
// Usage (from server/):
//   npm run export:copperwolf         # refresh the snapshot from whatever MONGODB points at
//   npm run seed:copperwolf           # wipe + restore from that snapshot (NODE_ENV unset ->
//                                      # .env.development -> should be localhost for a real test)
//   npm run seed:copperwolf:prod      # NODE_ENV=PRODUCTION -> .env.production -> the real Atlas
//                                      # cluster. Requires typing a confirmation phrase.
// ---------------------------------------------------------------------------------------------

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const dotenv = require('dotenv');

// Same NODE_ENV convention index.js itself uses - this is the ONLY axis on which "local test run"
// and "production run" actually differ (see header comment).
if (process.env.NODE_ENV !== 'PRODUCTION') {
  dotenv.config({ path: path.join(__dirname, '..', '.env.development') });
} else {
  dotenv.config({ path: path.join(__dirname, '..', '.env.production') });
}

const mongoose = require('mongoose');

const { COLLECTIONS } = require('./lib/copperwolf-collections');
const { initFirebaseBucket } = require('./lib/copperwolf-firebase');
const ClientFlagType = require('../models/ClientFlagType');

const { EJSON } = mongoose.mongo.BSON;

const DATA_DIR = path.join(__dirname, 'seed-data', 'copperwolf');
const MONGO_DIR = path.join(DATA_DIR, 'mongo');
const STORAGE_FILES_DIR = path.join(DATA_DIR, 'storage-files');
const MANIFEST_PATH = path.join(DATA_DIR, 'storage-manifest.json');
const SNAPSHOT_INFO_PATH = path.join(DATA_DIR, 'snapshot-info.json');

const mongoUri = (process.env.MONGODB || '').replace(/,\s*$/, '');
if (!mongoUri) {
  throw new Error('MONGODB environment variable is not set - check server/.env.development(.production).');
}
const redactedUri = mongoUri.replace(/\/\/.*@/, '//***@');
const targetIsLocal = /^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(mongoUri);

async function wipeFirebaseStorage(bucket) {
  console.log(`Wiping every file in Firebase Storage bucket "${bucket.name}" ...`);
  const [files] = await bucket.getFiles();
  if (files.length === 0) {
    console.log('  (bucket already empty)');
    return;
  }
  // force: true continues past a single file's delete failure instead of aborting the whole
  // batch on the first one - appropriate here since the goal is "as empty as possible", not
  // "abort and leave things half-wiped because one object had a transient error".
  await bucket.deleteFiles({ force: true });
  console.log(`  deleted ${files.length} file(s).`);
}

async function confirmOrExit(promptText, requiredAnswer) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(promptText, resolve));
  rl.close();
  if (answer.trim() !== requiredAnswer) {
    console.error('\nConfirmation did not match - aborting. Nothing was deleted.');
    process.exit(1);
  }
}

function loadSnapshotInfo() {
  if (!fs.existsSync(SNAPSHOT_INFO_PATH)) {
    throw new Error(
      `No snapshot found at ${DATA_DIR}. Run "npm run export:copperwolf" first (against whichever ` +
        'database currently holds the data you want to seed from), then re-run this script.'
    );
  }
  return JSON.parse(fs.readFileSync(SNAPSHOT_INFO_PATH, 'utf-8'));
}

async function restoreMongoCollections() {
  console.log('\nRestoring Mongo snapshot ...');
  let totalDocs = 0;
  let shop = null;

  for (const { name, Model } of COLLECTIONS) {
    const file = path.join(MONGO_DIR, `${name}.json`);
    if (!fs.existsSync(file)) {
      console.log(`  ${name}: (no snapshot file, skipped)`);
      continue;
    }
    const docs = EJSON.parse(fs.readFileSync(file, 'utf-8'));
    if (docs.length === 0) {
      console.log(`  ${name}: 0 documents`);
      continue;
    }
    // lean: true inserts the documents exactly as exported, with no re-validation and no schema
    // defaults/setters re-applied - this is a restore, not a place to re-derive business rules
    // against a database that is only partially rebuilt at any given point in this loop (a
    // validator that checks another collection could easily see that collection still empty).
    // The data was valid in a live database moments ago; trust it.
    await Model.insertMany(docs, { ordered: true, lean: true });
    console.log(`  ${name}: ${docs.length} document(s) restored`);
    totalDocs += docs.length;
    if (name === 'Shop' && docs.length === 1) {
      [shop] = docs;
    }
  }
  return { totalDocs, shop };
}

async function restoreStorageFiles(bucket) {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log('\nNo Storage manifest in snapshot - nothing to restore.');
    return 0;
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`\nRestoring ${manifest.length} Storage file(s) ...`);
  for (const entry of manifest) {
    const localPath = path.join(STORAGE_FILES_DIR, entry.objectPath);
    const buffer = fs.readFileSync(localPath);
    const file = bucket.file(entry.objectPath);
    // Same shape utils/firebase-admin.js's uploadPublicFile() saves with - same content type, and
    // critically the SAME firebaseStorageDownloadTokens value the original upload had (captured
    // by the export script by parsing it back out of the document's own download URL). That is
    // what makes the untouched URLs already sitting in the just-restored Mongo documents valid
    // again, with no rewriting needed anywhere.
    await file.save(buffer, {
      metadata: {
        contentType: entry.contentType,
        metadata: { firebaseStorageDownloadTokens: entry.token },
      },
    });
  }
  console.log(`  restored ${manifest.length} file(s).`);
  return manifest.length;
}

async function seed() {
  const snapshotInfo = loadSnapshotInfo();

  console.log(`Connecting to ${redactedUri} ${targetIsLocal ? '(local)' : '(NOT local)'} ...`);
  await mongoose.connect(mongoUri);

  const bucket = initFirebaseBucket();

  console.log('\n==========================================================');
  console.log('This will PERMANENTLY DELETE:');
  console.log(`  - every document in every collection at ${redactedUri}`);
  console.log(`  - every file in Firebase Storage bucket "${bucket.name}"`);
  console.log(`\nand then restore the snapshot exported ${snapshotInfo.exportedAt}`);
  console.log(`from ${snapshotInfo.sourceUri}:`);
  console.log(
    `  - ${snapshotInfo.totalDocuments} document(s) across ` +
      `${Object.keys(snapshotInfo.collectionCounts).length} collection(s)`
  );
  console.log(`  - ${snapshotInfo.storageFilesExported} Storage file(s)`);
  console.log('==========================================================\n');

  if (!process.argv.includes('--yes')) {
    const phrase = targetIsLocal ? 'yes' : 'DELETE PRODUCTION DATA';
    await confirmOrExit(`Type "${phrase}" to continue: `, phrase);
  }

  console.log('\nWiping Mongo collections ...');
  await Promise.all(COLLECTIONS.map(({ Model }) => Model.deleteMany({})));

  // See scripts/seed.js's own comment on why this runs after the wipe, on empty collections -
  // deleteMany leaves stale indexes behind (e.g. a unique index on a field a schema no longer
  // declares), and syncIndexes() is what actually reconciles the database to the current schema.
  console.log('Syncing indexes ...');
  await Promise.all(COLLECTIONS.map(({ Model }) => Model.syncIndexes()));

  await wipeFirebaseStorage(bucket);

  const { totalDocs, shop } = await restoreMongoCollections();
  const fileCount = await restoreStorageFiles(bucket);

  // Defensive backstop only, not core to the restore: ClientFlagType's platform-wide defaults
  // (NO_SHOWED/MOVED_APPOINTMENT/NO_TIP - see models/ClientFlagType.js) are almost certainly
  // already part of the snapshot's ClientFlagType.json if the source database was ever used
  // through the real app. ensureSeeded() is idempotent ($setOnInsert-only), so calling it again
  // here only does anything for the edge case of a snapshot taken before that ever ran.
  await ClientFlagType.ensureSeeded();

  console.log('\nDone. Restored from the snapshot:');
  console.log(`  ${totalDocs} document(s), ${fileCount} Storage file(s).`);
  if (shop) {
    console.log(`  Shop: ${shop.name} (${shop._id})`);
  }

  await mongoose.disconnect();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nSeed failed:', err);
    process.exit(1);
  });
