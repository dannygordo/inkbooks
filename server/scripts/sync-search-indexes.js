/**
 * Rebuilds the text-search indexes on Project and SharedImage after this session's schema change -
 * NON-DESTRUCTIVE to documents, unlike seed.js/seed-large.js (which also call syncIndexes(), but
 * only as a side effect of wiping every collection first).
 *
 * WHY THIS IS NEEDED. Mongoose's default autoIndex only ADDS indexes missing by name
 * (Model.createIndexes()) - it does not detect that an index kept its name but changed its field
 * list, which is exactly what happened here: ProjectTextIndex gained
 * referenceImages.tags/designImages.tags/bodyImages.tags (see models/Project.js), and SharedImage
 * gained a brand new SharedImageTextIndex (see models/SharedImage.js) - both for "search should
 * also include tags on images." Left alone, the next server start tries to create an index with a
 * NEW field spec under an EXISTING index name, which MongoDB refuses (IndexKeySpecsConflict) -
 * depending on driver version that either fails the server's createIndexes call outright or logs
 * the error and keeps running on the STALE definition, silently making the new search behavior
 * match nothing no matter how correct the query code is.
 *
 * Model.syncIndexes() reconciles the two: drops any index on the collection that isn't in the
 * current schema, then creates whatever's missing. Safe to run any time, and safe to run more than
 * once - a no-op once the live indexes already match the schema.
 *
 * Usage (from server/):
 *   node scripts/sync-search-indexes.js
 */

// Same reasoning as merge-duplicate-conversations.js's own header comment on this exact polyfill -
// the mongodb driver bundled under mongoose reads globalThis.crypto directly, which Node only puts
// on the global object by default from v19 onward; node:crypto has exposed the same implementation
// as `webcrypto` since v16.17, just not wired onto `global` before then.
if (typeof globalThis.crypto === 'undefined') {
  const nodeCrypto = require('crypto');
  if (nodeCrypto.webcrypto) {
    globalThis.crypto = nodeCrypto.webcrypto;
  } else {
    console.error(
      `This script needs Node 16.17+ for Web Crypto support - detected ${process.version}. ` +
        'Upgrade Node (or switch to whatever Node version the rest of this project runs under, ' +
        'e.g. via nvm) and try again.',
    );
    process.exit(1);
  }
}

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env.development') });

const mongoose = require('mongoose');
const Project = require('../models/Project');
const SharedImage = require('../models/SharedImage');

const mongoUri = (process.env.MONGODB || '').replace(/,\s*$/, '');
if (!mongoUri) {
  console.error('MONGODB is not set - check server/.env.development.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(mongoUri);
  console.log(`Connected to ${mongoUri}`);

  for (const Model of [Project, SharedImage]) {
    console.log(`Syncing indexes for ${Model.modelName} ...`);
    const changes = await Model.syncIndexes();
    if (changes.length) {
      console.log(`  dropped/rebuilt: ${changes.join(', ')}`);
    } else {
      console.log('  already up to date.');
    }
  }

  await mongoose.disconnect();
  console.log('\nDone - Project and SharedImage text search now cover image tags.');
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
