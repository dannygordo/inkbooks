/**
 * One-time migration: Square connection fields from Shop into SquareAccount. See DECISIONS.md M9.
 *
 *   Shop.squareConnected            -> SquareAccount.connected
 *   Shop.squareMerchantId           -> SquareAccount.merchantId
 *   Shop.squareLocationId           -> SquareAccount.locationId
 *   Shop.squareAccessTokenEncrypted -> SquareAccount.accessTokenEncrypted
 *   Shop.squareRefreshTokenEncrypted-> SquareAccount.refreshTokenEncrypted
 *   Shop.squareTokenExpiresAt       -> SquareAccount.tokenExpiresAt
 *   Shop.squareConnectedAt          -> SquareAccount.connectedAt
 *
 * with ownerType 'SHOP' and ownerId the shop's own _id.
 *
 * WHAT THIS DOES NOT DO: create anything for artists. An independent artist gets a SquareAccount
 * the first time they complete the OAuth handshake, and not before - there is nothing to migrate,
 * because until now they had no way to connect one at all. Pre-creating empty rows would mean
 * every artist in the database carries a row saying "no Square account", which is what the absence
 * of a row already says.
 *
 * THE TOKENS ARE COPIED, NOT RE-ENCRYPTED. They are already ciphertext under the same
 * SECRET_KEY-derived key (see utils/token-crypto.js) and this migration never decrypts them.
 * Copying the ciphertext verbatim means a failure here cannot leak a plaintext token into a log,
 * and it means the migration does not need the key to be correct to run - only the eventual read
 * does.
 *
 * WHY THE SHOP FIELDS ARE LEFT IN PLACE. Unlike migrate-money-to-cents.js, this does NOT $unset the
 * source fields. Two fields in different units invite a 100x error; two copies of an opaque
 * ciphertext do not, and the cost of being wrong here is a shop that cannot take payment until
 * someone reconnects by hand. Leave them for one deploy, confirm charges still work, then drop
 * them in a follow-up. The application no longer reads them - only this script does.
 *
 * IDEMPOTENCY: a shop that already has a SquareAccount row is skipped, never overwritten. Running
 * this twice will not clobber a token refreshed since the first run - which is the exact way a
 * re-run would otherwise brick a live connection.
 *
 * Usage (from server/):
 *   node scripts/migrate-square-accounts.js --dry-run   # report only
 *   node scripts/migrate-square-accounts.js             # apply
 *
 * Take a database backup first.
 */
const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const SquareAccount = require('../models/SquareAccount');

const DRY_RUN = process.argv.includes('--dry-run');

// Reads a field straight off the raw document. models/Shop.js no longer declares these, so
// `shop.squareMerchantId` is undefined even when the stored document has one - the value is only
// reachable through _doc / toObject(). Same technique, and same reason, as
// migrate-money-to-cents.js's legacyValue.
function legacyField(doc, field) {
  const raw = doc._doc || doc.toObject();
  return raw[field];
}

async function main() {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('MONGODB is not set - export it before running this script.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected.${DRY_RUN ? ' DRY RUN - nothing will be written.' : ''}`);

  const shops = await Shop.find({});
  let migrated = 0;
  let skipped = 0;
  let nothingToMove = 0;

  for (const shop of shops) {
    const merchantId = legacyField(shop, 'squareMerchantId');
    const accessTokenEncrypted = legacyField(shop, 'squareAccessTokenEncrypted');

    // A shop that never connected has nothing to carry over. Judged on the credential rather than
    // on squareConnected: a half-failed callback can leave the boolean true with no token, and
    // that row is not worth migrating - it cannot authorize anything either way.
    if (!merchantId && !accessTokenEncrypted) {
      nothingToMove += 1;
      continue;
    }

    const existing = await SquareAccount.findOne({ ownerType: 'SHOP', ownerId: shop._id });
    if (existing) {
      console.log(`  ${shop.id} (${shop.name}): already has a SquareAccount - skipped.`);
      skipped += 1;
      continue;
    }

    const expiresAt = legacyField(shop, 'squareTokenExpiresAt');
    console.log(
      `  ${shop.id} (${shop.name}): merchant ${merchantId || 'none'}, ` +
        `token ${accessTokenEncrypted ? 'present' : 'absent'}, ` +
        `expires ${expiresAt ? new Date(expiresAt).toISOString() : 'unknown'}`,
    );

    if (!DRY_RUN) {
      await new SquareAccount({
        ownerType: 'SHOP',
        ownerId: shop._id,
        connected: Boolean(legacyField(shop, 'squareConnected')),
        merchantId,
        locationId: legacyField(shop, 'squareLocationId'),
        accessTokenEncrypted,
        refreshTokenEncrypted: legacyField(shop, 'squareRefreshTokenEncrypted'),
        tokenExpiresAt: expiresAt,
        connectedAt: legacyField(shop, 'squareConnectedAt'),
      }).save();
      migrated += 1;
    }
  }

  const wouldMigrate = shops.length - skipped - nothingToMove;
  console.log(
    DRY_RUN
      ? `Dry run complete - ${wouldMigrate} would be migrated, ${skipped} already done, ` +
          `${nothingToMove} never connected Square.`
      : `Done. ${migrated} migrated, ${skipped} already had an account, ` +
          `${nothingToMove} never connected Square.`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
