/**
 * One-off backfill: give every artist who has a stored Artist.shopId a real ArtistShopConnection.
 *
 * Artist.shopId was the original "which shop does this artist work at" foreign key.
 * ArtistShopConnection replaced it, but only for authorization - the directories and the
 * Artist.shop field resolver went on reading the old field, so the app had two answers to the same
 * question and they only agreed by luck. Everything now reads the connection (see
 * utils/artist-shop.js), which means any artist whose membership exists ONLY as a stored shopId
 * would silently become an independent artist the moment that change ships. This is what stops
 * that.
 *
 * Safe to run more than once: it skips anyone who already has an active connection, and creates
 * nothing for an artist with no shopId (a genuinely independent artist, which is a normal state).
 *
 *   node scripts/backfill-artist-connections.js            # report only, writes nothing
 *   node scripts/backfill-artist-connections.js --apply    # actually create the connections
 *
 * Deliberately does NOT clear Artist.shopId afterwards. Nothing reads it any more, and leaving it
 * means this can be re-run and the old value stays available if a migration needs auditing. A
 * later change can drop the column once there's confidence nothing regressed.
 */
require('dotenv').config({
  path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development',
});
const mongoose = require('mongoose');
const Artist = require('../models/Artist');
const ArtistShopConnection = require('../models/ArtistShopConnection');
const Shop = require('../models/Shop');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGODB);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

  const artists = await Artist.find({ shopId: { $ne: null } }).select('firstName lastName userId shopId');

  let created = 0;
  let alreadyConnected = 0;
  let skippedNoUser = 0;
  let skippedMissingShop = 0;
  let connectedElsewhere = 0;

  for (const artist of artists) {
    const label = `${artist.firstName} ${artist.lastName}`;

    // userId is what a connection is keyed by (the artist's own User._id, not the Artist row's
    // _id - see models/ArtistShopConnection.js). An Artist row without one can't be connected to
    // anything and is a data problem this script shouldn't paper over.
    if (!artist.userId) {
      console.log(`  SKIP  ${label} - Artist row has no userId`);
      skippedNoUser += 1;
      continue;
    }

    const shop = await Shop.findById(artist.shopId).select('name');
    if (!shop) {
      console.log(`  SKIP  ${label} - shopId ${artist.shopId} points at a shop that no longer exists`);
      skippedMissingShop += 1;
      continue;
    }

    const active = await ArtistShopConnection.findOne({ artistId: artist.userId, status: 'active' });
    if (active) {
      if (String(active.shopId) === String(artist.shopId)) {
        alreadyConnected += 1;
      } else {
        // The two sources of truth disagree for this artist. The connection wins: it's the one
        // the connect flow writes, so it reflects a deliberate action, whereas a stale shopId is
        // what a half-finished migration leaves behind. Reported rather than silently resolved,
        // because it's worth a human look.
        console.log(
          `  NOTE  ${label} - stored shopId (${artist.shopId}) differs from active connection ` +
            `(${active.shopId}). Keeping the connection.`,
        );
        connectedElsewhere += 1;
      }
      continue;
    }

    console.log(`  ${APPLY ? 'CREATE' : 'WOULD'} ${label} -> ${shop.name}`);
    if (APPLY) {
      // upsert, not insert: a disconnected row may already exist for this pair, and the model
      // reuses one document per artist/shop pair across disconnect/reconnect cycles.
      await ArtistShopConnection.findOneAndUpdate(
        { artistId: artist.userId, shopId: artist.shopId },
        { artistId: artist.userId, shopId: artist.shopId, status: 'active', disconnectedAt: null },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
    created += 1;
  }

  console.log('\n---');
  console.log(`Artists with a stored shopId:      ${artists.length}`);
  console.log(`${APPLY ? 'Connections created:' : 'Connections that would be created:'} ${created}`);
  console.log(`Already had an active connection:  ${alreadyConnected}`);
  if (connectedElsewhere) {
    console.log(`Disagreed with their connection:   ${connectedElsewhere}  <- worth reviewing`);
  }
  if (skippedNoUser) {
    console.log(`Skipped (no userId):               ${skippedNoUser}  <- data problem`);
  }
  if (skippedMissingShop) {
    console.log(`Skipped (shop gone):               ${skippedMissingShop}`);
  }
  if (!APPLY && created > 0) {
    console.log('\nRe-run with --apply to write these.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
