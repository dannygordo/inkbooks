/**
 * One-time migration: Appointment money fields from whole dollars to integer cents.
 *
 *   total         -> subtotalCents  (x100)
 *   tip           -> tipCents       (x100)
 *   shopCutAmount -> shopCutCents   (x100)
 *   totalCents    =  subtotalCents + tipCents
 *   taxCents / feeCents -> 0
 *
 * WHY total BECOMES subtotalCents, NOT totalCents
 *
 * The old `total` never included the tip. ArtistPerformancePanel computed revenue as
 * `total + tip`, which only makes sense if they're disjoint, and SessionDetail's total field was
 * filled from computeSessionTotal(elapsed x rate) - the price of the work, with no tip component.
 * So the old `total` is semantically the new `subtotalCents`: the tattoo work by itself. Mapping
 * it to `totalCents` instead would double-count every tip the moment the new totalCents
 * (subtotal + tax + fee + tip) started being read.
 *
 * taxCents and feeCents are zero rather than guessed. There is no historical record of either -
 * they were never captured anywhere - and inventing a plausible tax rate would put fabricated
 * numbers into financial records. Zero is wrong-but-honest and visibly so; a made-up 8.25% is
 * wrong and looks right, which is worse.
 *
 * shopCutPercentApplied is backfilled where it can be derived exactly (shopCutCents /
 * subtotalCents, when both are non-zero and the result is a clean percentage) and left unset
 * otherwise. Historical cuts were entered by hand rather than computed, so for most rows there is
 * no percentage that was "applied" - claiming one would be fiction.
 *
 * IDEMPOTENCY: a document that already has subtotalCents set is skipped. Running this twice will
 * not multiply anything by 10,000.
 *
 * Usage (from server/):
 *   node scripts/migrate-money-to-cents.js --dry-run   # report only
 *   node scripts/migrate-money-to-cents.js             # apply
 *
 * Take a database backup first. This rewrites financial records and has no automatic reverse.
 */
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');

const DRY_RUN = process.argv.includes('--dry-run');

// Reads a legacy field straight off the raw document. The Mongoose schema no longer declares
// total/tip/shopCutAmount, so `doc.total` is undefined even when the stored document has one -
// the value is only reachable through _doc / toObject().
function legacyValue(doc, field) {
  const raw = doc._doc || doc.toObject();
  const value = raw[field];
  return typeof value === 'number' ? value : 0;
}

async function main() {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('MONGODB is not set - export it before running this script.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected.${DRY_RUN ? ' DRY RUN - nothing will be written.' : ''}`);

  const appointments = await Appointment.find({});
  let migrated = 0;
  let skipped = 0;

  for (const appt of appointments) {
    if (appt.subtotalCents) {
      skipped += 1;
      continue;
    }

    const oldTotal = legacyValue(appt, 'total');
    const oldTip = legacyValue(appt, 'tip');
    const oldShopCut = legacyValue(appt, 'shopCutAmount');

    const subtotalCents = Math.round(oldTotal * 100);
    const tipCents = Math.round(oldTip * 100);
    const shopCutCents = Math.round(oldShopCut * 100);

    // Only claim a percentage when it divides out exactly to a whole one. A hand-entered $90 cut
    // against a $300 session is genuinely 30%; a $87 cut against $300 is 29%, which nobody
    // configured and which would be misleading to record as though they had.
    let percentApplied;
    if (subtotalCents > 0 && shopCutCents > 0) {
      const derived = (shopCutCents / subtotalCents) * 100;
      if (Number.isInteger(derived)) {
        percentApplied = derived;
      }
    }

    console.log(
      `  ${appt.id}: total $${oldTotal} -> subtotalCents ${subtotalCents}; ` +
        `tip $${oldTip} -> tipCents ${tipCents}; ` +
        `shopCut $${oldShopCut} -> shopCutCents ${shopCutCents}` +
        (percentApplied === undefined ? '' : ` (${percentApplied}%)`),
    );

    if (!DRY_RUN) {
      appt.subtotalCents = subtotalCents;
      appt.tipCents = tipCents;
      appt.taxCents = 0;
      appt.feeCents = 0;
      appt.totalCents = subtotalCents + tipCents;
      appt.shopCutCents = shopCutCents;
      if (percentApplied !== undefined) {
        appt.shopCutPercentApplied = percentApplied;
      }
      // $unset rather than leaving them in place: two fields meaning almost the same thing, in
      // different units, is precisely the situation that produces a 100x error later.
      appt.set('total', undefined, { strict: false });
      appt.set('tip', undefined, { strict: false });
      appt.set('shopCutAmount', undefined, { strict: false });
      await appt.save();
      migrated += 1;
    }
  }

  console.log(
    DRY_RUN
      ? `Dry run complete - ${appointments.length - skipped} would be migrated, ${skipped} already done.`
      : `Done. ${migrated} migrated, ${skipped} already had cents values.`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
