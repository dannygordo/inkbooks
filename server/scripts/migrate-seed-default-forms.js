/**
 * One-time migration: give every EXISTING shop and every EXISTING independent artist their two
 * default forms (Booking Request, Consent) - see utils/seed-default-forms.js for the full design.
 * Every shop/artist created AFTER this feature shipped already gets these at signup
 * (resolvers/users.js's registerAccount) or at creation (mutations/shops.js's createShop) - this
 * script is only for rows that predate that.
 *
 * "Independent artist" here means the exact same thing utils/shop-membership.js's
 * getShopIdsForUser already means: no active ArtistShopConnection AND no Staff row. A
 * shop-affiliated artist is deliberately skipped - see seed-default-forms.js's own header comment
 * on why they're covered by their shop's forms already and would only get a redundant copy.
 *
 * IDEMPOTENT: seedDefaultForms itself only creates a systemKey form that doesn't already exist, so
 * running this twice (or running it after some shops/artists already got seeded at signup) is
 * always safe - already-seeded owners are reported as "already had both" and touched with zero
 * writes.
 *
 * Usage (from server/):
 *   node scripts/migrate-seed-default-forms.js --dry-run   # report only
 *   node scripts/migrate-seed-default-forms.js             # apply
 *
 * Take a database backup first.
 */
const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const Artist = require('../models/Artist');
const Staff = require('../models/Staff');
const ArtistShopConnection = require('../models/ArtistShopConnection');
const Form = require('../models/Form');
const { seedDefaultForms, DEFAULT_FORM_DEFS } = require('../utils/seed-default-forms');

const DRY_RUN = process.argv.includes('--dry-run');
const SYSTEM_KEYS = DEFAULT_FORM_DEFS.map((d) => d.systemKey);

async function main() {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('MONGODB is not set - export it before running this script.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected.${DRY_RUN ? ' DRY RUN - nothing will be written.' : ''}`);

  // --- Shops -----------------------------------------------------------------------------------
  const shops = await Shop.find({});
  let shopsSeeded = 0;
  let shopsAlreadyDone = 0;

  for (const shop of shops) {
    // eslint-disable-next-line no-await-in-loop
    const existingKeys = new Set(
      (await Form.find({ shopId: shop._id, systemKey: { $ne: null } }, 'systemKey')).map((f) => f.systemKey),
    );
    const missing = SYSTEM_KEYS.filter((k) => !existingKeys.has(k));
    if (missing.length === 0) {
      shopsAlreadyDone += 1;
      continue;
    }
    console.log(`  Shop ${shop.id} (${shop.name}): missing ${missing.join(', ')}`);
    if (!DRY_RUN) {
      // createdByUserId has no real "the shop's own admin" single answer at migration time (a shop
      // can have several); there is no admin identity a system-seeded row needs to attribute to
      // itself either way - see models/Form.js, createdByUserId is required but nothing reads it
      // as "who to notify" or similar. Attributed to the shop's own first-created Staff account
      // where one exists, else left as the shop's own id - a real ObjectId, just not a User's.
      // eslint-disable-next-line no-await-in-loop
      const firstStaff = await Staff.findOne({ shopId: shop._id }).sort({ createdAt: 1 });
      // eslint-disable-next-line no-await-in-loop
      await seedDefaultForms({ shopId: shop._id }, (firstStaff && firstStaff.userId) || shop._id);
    }
    shopsSeeded += 1;
  }

  // --- Independent artists -----------------------------------------------------------------------
  const artists = await Artist.find({});
  let artistsSeeded = 0;
  let artistsAlreadyDone = 0;
  let artistsSkippedAffiliated = 0;

  for (const artist of artists) {
    // Same definition of "independent" as utils/shop-membership.js's getShopIdsForUser - no
    // active ArtistShopConnection and no Staff row.
    // eslint-disable-next-line no-await-in-loop
    const [connection, staff] = await Promise.all([
      ArtistShopConnection.findOne({ artistId: artist.userId, status: 'active' }),
      Staff.findOne({ userId: artist.userId }),
    ]);
    if (connection || staff) {
      artistsSkippedAffiliated += 1;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const existingKeys = new Set(
      (await Form.find({ artistUserId: artist.userId, systemKey: { $ne: null } }, 'systemKey')).map((f) => f.systemKey),
    );
    const missing = SYSTEM_KEYS.filter((k) => !existingKeys.has(k));
    if (missing.length === 0) {
      artistsAlreadyDone += 1;
      continue;
    }
    console.log(`  Artist ${artist.id} (${artist.firstName} ${artist.lastName}): missing ${missing.join(', ')}`);
    if (!DRY_RUN) {
      // eslint-disable-next-line no-await-in-loop
      await seedDefaultForms({ artistUserId: artist.userId }, artist.userId);
    }
    artistsSeeded += 1;
  }

  console.log(
    DRY_RUN
      ? `Dry run complete - shops: ${shopsSeeded} would be seeded, ${shopsAlreadyDone} already done. `
          + `Independent artists: ${artistsSeeded} would be seeded, ${artistsAlreadyDone} already done, `
          + `${artistsSkippedAffiliated} shop-affiliated (skipped).`
      : `Done - shops: ${shopsSeeded} seeded, ${shopsAlreadyDone} already done. `
          + `Independent artists: ${artistsSeeded} seeded, ${artistsAlreadyDone} already done, `
          + `${artistsSkippedAffiliated} shop-affiliated (skipped).`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
