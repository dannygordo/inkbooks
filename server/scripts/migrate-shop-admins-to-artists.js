/**
 * One-time migration: every SHOP_ADMIN becomes an artist.
 *
 * A shop admin whose userType is STAFF gets the two records they were missing - an Artist profile
 * and an ArtistShopConnection - and their userType flipped to ARTIST. Their Staff row is KEPT: the
 * real signup path creates both deliberately (see registerAccount), because the connection is what
 * puts them on the shop's calendar and in its analytics, and the Staff row is what makes them
 * findable as an ADMIN of it. Neither substitutes for the other.
 *
 * WHY. The codebase had two shapes of shop admin from two creation paths, and nothing said which
 * was intended. registerAccount makes an owner-artist ("a shop owner tattoos until they say
 * otherwise"); scripts/seed.js made a STAFF-only admin. The difference was invisible until
 * userType started gating real surfaces - the Settings page is hidden from a STAFF-typed admin, and
 * the Square/pricing panels resolve them as an INDEPENDENT artist, so a shop admin who did not
 * tattoo could not configure their own shop's tax rate at all. One shape means one signal.
 *
 * WHAT THIS COSTS, stated plainly because it is a real trade. A migrated admin now appears in the
 * shop's artist directory, gets a calendar tag colour, and shows up in per-artist dashboards - as
 * an artist with no sessions. If a particular admin genuinely never tattoos, set their
 * Artist.status to INACTIVE (2) or ARCHIVED (4) afterwards: archived artists drop out of the
 * directory while keeping every record attached to them (see utils/archiving.js). This script does
 * NOT guess at that - it cannot know who tattoos.
 *
 * IDEMPOTENCY: an admin who already has an Artist row is left alone entirely, including their
 * userType. Running this twice creates nothing and overwrites nothing.
 *
 * Usage (from server/):
 *   node scripts/migrate-shop-admins-to-artists.js --dry-run   # report only
 *   node scripts/migrate-shop-admins-to-artists.js             # apply
 *
 * Take a database backup first.
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const Artist = require('../models/Artist');
const Staff = require('../models/Staff');
const ArtistShopConnection = require('../models/ArtistShopConnection');
const { Constants } = require('../utils/constants');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('MONGODB is not set - export it before running this script.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected.${DRY_RUN ? ' DRY RUN - nothing will be written.' : ''}`);

  const admins = await User.find({ role: Constants.ROLES.SHOP_ADMIN });
  let migrated = 0;
  let alreadyArtists = 0;
  let noShop = 0;

  for (const admin of admins) {
    const existingArtist = await Artist.findOne({ userId: admin._id });
    if (existingArtist) {
      alreadyArtists += 1;
      continue;
    }

    // Which shop they administer. Read from Staff rather than from any artist record, because by
    // definition these admins have no artist record yet - the Staff row IS their membership.
    const staff = await Staff.findOne({ userId: admin._id }).select('shopId');
    if (!staff || !staff.shopId) {
      // An admin with no shop at all is not a case this migration can invent one for. Reported
      // rather than skipped silently, since it means something else is wrong with that account.
      console.log(`  ${admin.id} (${admin.email}): SHOP_ADMIN with no Staff row - SKIPPED.`);
      noShop += 1;
      continue;
    }

    console.log(
      `  ${admin.id} (${admin.email}): creating Artist + connection at shop ${staff.shopId}` +
        `${admin.userType === Constants.USER_TYPE.ARTIST ? '' : ', userType -> artist'}`,
    );

    if (!DRY_RUN) {
      await new Artist({
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        userId: admin._id,
        status: Constants.ARTIST_STATUS.ACTIVE,
        startDate: new Date(),
      }).save();

      // Guarded, not assumed. An admin could already hold an open interval from some other path,
      // and the partial unique index on open intervals would reject a second one.
      const openInterval = await ArtistShopConnection.findOne({
        artistId: admin._id,
        endedAt: null,
      });
      if (!openInterval) {
        await new ArtistShopConnection({
          artistId: admin._id,
          shopId: staff.shopId,
          status: 'active',
          // NOT new Date(). Backdated to the account's own creation, because the shop cut resolves
          // against the membership interval by the SESSION's date (A1/M7) - an interval starting
          // today would read as "this person did not work here last month", which is false and
          // would reprice any historical work they turn out to have.
          startedAt: admin.createdAt || new Date(),
          endedAt: null,
        }).save();
      }

      admin.userType = Constants.USER_TYPE.ARTIST;
      await admin.save();
      migrated += 1;
    }
  }

  console.log(
    DRY_RUN
      ? `Dry run complete - ${admins.length - alreadyArtists - noShop} would be migrated, ` +
          `${alreadyArtists} already artists, ${noShop} skipped with no shop.`
      : `Done. ${migrated} migrated, ${alreadyArtists} already artists, ${noShop} skipped.`,
  );
  console.log(
    'Any admin who does not actually tattoo can be set to Artist.status INACTIVE or ARCHIVED - ' +
      'they keep every record and drop out of the artist directory.',
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
