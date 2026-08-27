/**
 * One-time cleanup: drop the seven legacy Square connection fields from Shop documents.
 *
 *   squareConnected, squareMerchantId, squareLocationId, squareAccessTokenEncrypted,
 *   squareRefreshTokenEncrypted, squareTokenExpiresAt, squareConnectedAt
 *
 * These moved to SquareAccount (DECISIONS.md M9, scripts/migrate-square-accounts.js) and models/
 * Shop.js has not declared them for a while - nothing reads them, not the schema, not the
 * resolvers, only migrate-square-accounts.js itself. They were deliberately left ON EXISTING
 * DOCUMENTS at the time (see that script's own header) until real charges were confirmed working
 * against the migrated SquareAccount rows. Per Danny's confirmation 2026-08-27 that real sandbox
 * deposit and session charges have been working through the app for a while, that condition is
 * met - this is the "drop them in a follow-up" from Shop.js's own comment.
 *
 * WHY THIS IS SEPARATE FROM migrate-square-accounts.js, NOT FOLDED INTO IT. That script copies
 * ciphertext and is safe to run before anything downstream is trusted - the worst case is an
 * extra copy sitting unread. This script deletes data. Keeping the destructive step as its own
 * script, run deliberately after the copy is proven, means a bad migrate-square-accounts.js run
 * never costs the source data - the legacy fields are still there to retry from.
 *
 * IDEMPOTENCY: a Shop document with none of the seven fields present is skipped. Running this
 * twice unsets nothing the second time.
 *
 * Usage (from server/):
 *   node scripts/drop-legacy-square-shop-fields.js --dry-run   # report only
 *   node scripts/drop-legacy-square-shop-fields.js             # apply
 *
 * Take a database backup first. This deletes data and has no automatic reverse - the source of
 * truth for a shop's Square connection after this point is exclusively SquareAccount.
 */
const mongoose = require('mongoose');
const Shop = require('../models/Shop');

const DRY_RUN = process.argv.includes('--dry-run');

const LEGACY_FIELDS = [
	'squareConnected',
	'squareMerchantId',
	'squareLocationId',
	'squareAccessTokenEncrypted',
	'squareRefreshTokenEncrypted',
	'squareTokenExpiresAt',
	'squareConnectedAt',
];

// Reads a field straight off the raw document - same technique, and same reason, as
// migrate-square-accounts.js's legacyField and migrate-money-to-cents.js's legacyValue: the
// Mongoose schema no longer declares these, so `shop.squareMerchantId` is undefined even when the
// stored document has one.
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
	let cleaned = 0;
	let nothingToDrop = 0;

	for (const shop of shops) {
		const present = LEGACY_FIELDS.filter((field) => legacyField(shop, field) !== undefined);
		if (present.length === 0) {
			nothingToDrop += 1;
			continue;
		}

		console.log(`  ${shop.id} (${shop.name || 'unnamed shop'}): dropping ${present.join(', ')}`);

		if (!DRY_RUN) {
			for (const field of present) {
				shop.set(field, undefined, { strict: false });
			}
			await shop.save();
			cleaned += 1;
		}
	}

	console.log(
		DRY_RUN
			? `Dry run complete - ${shops.length - nothingToDrop} shop(s) would be cleaned, ` +
					`${nothingToDrop} already clean.`
			: `Done. ${cleaned} shop(s) cleaned, ${nothingToDrop} already clean.`,
	);
	await mongoose.disconnect();
}

main().catch(async (err) => {
	console.error('Cleanup failed:', err);
	await mongoose.disconnect().catch(() => {});
	process.exit(1);
});
