const Shop = require('../models/Shop');
const ArtistShopConnection = require('../models/ArtistShopConnection');
const { percentOfCents } = require('./money');

/**
 * The shop cut - what an artist owes their shop for a session.
 *
 * This is the first implementation of it. Appointment.shopCutAmount existed before, but nothing
 * in the application ever computed or wrote it: createAppointment didn't accept the field,
 * updateAppointment only echoed back whatever was already there, and no UI set it. Every non-null
 * value in the system came from scripts/seed.js. The shop-cut payout dashboard, the Square
 * invoice flow and the pending-confirmations queue were all reading a field that, against real
 * data, was always null - which is why none of them ever appeared to do anything.
 *
 * WHAT THE CUT APPLIES TO
 *
 * subtotalCents, and nothing else. The three exclusions, in order of how firm they are:
 *
 *   Tips        - excluded, non-negotiable. The artist keeps every tip. This is the rule that
 *                 prompted the whole change, and it's why tipCents is stored separately from
 *                 totalCents rather than folded into one figure: if there's only a grand total,
 *                 "the cut excludes tips" is impossible to compute at all.
 *   Tax         - excluded. Sales tax isn't income, it's money held on behalf of the state. A
 *                 shop taking a percentage of it would be taking a percentage of someone else's
 *                 money.
 *   Processing  - excluded. Square's fee already left the building; charging the artist a share
 *   fees          of a cost neither party keeps would mean the artist pays for it twice.
 *
 * The tax and fee exclusions are my reading of standard practice, not something that was
 * specified - they're worth confirming against how the shop actually operates before this goes
 * anywhere near real money. The tip exclusion was specified explicitly.
 *
 *   Deposits    a deposit credited to a session is DEDUCTED before the cut is computed, so the
 *               cut follows what the session actually charged. Specified explicitly: "if the
 *               session cost is $200 and a $100 deposit was applied, the session total is $100
 *               and the shop cut should be based on the $100."
 *
 *               The consequence worth stating out loud: this only leaves the shop whole if the
 *               cut was taken on the deposit at the consult that collected it. It is - a consult
 *               holding a deposit gets subtotalCents set to the deposit amount, so applyShopCut
 *               charges it there (see mutations/deposits.js). Across the two appointments the
 *               shop's cut totals the same as it would on the undiscounted price. Change one of
 *               those halves without the other and the shop quietly loses its cut on every
 *               deposit ever taken.
 */

/**
 * Resolves which percentage applies to a given artist at a given shop.
 *
 * The connection-level override is checked with a null test, not a falsy test, on purpose: 0 is a
 * meaningful configured value ("this guest artist owes us nothing") and must not fall through to
 * the shop's rate the way `||` would make it.
 *
 * @returns {Promise<number>} percentage, e.g. 40 for 40%. 0 when nothing is configured.
 */
async function resolveShopCutPercent(artistUserId, shopId) {
  if (!shopId) {
    // Independent artist - no shop, nothing owed. Not an error case.
    return 0;
  }
  const connection = await ArtistShopConnection.findOne({
    artistId: artistUserId,
    shopId,
    status: 'active',
  }).select('shopCutPercent');
  if (connection && connection.shopCutPercent !== null && connection.shopCutPercent !== undefined) {
    return connection.shopCutPercent;
  }
  const shop = await Shop.findById(shopId).select('shopCutPercent');
  return shop?.shopCutPercent || 0;
}

/**
 * Computes and assigns shopCutCents on an appointment document, in place. Does not save.
 *
 * shopCutStatus is moved to 'unpaid' only when there is actually something to pay and the ledger
 * hasn't already moved past that point. Deliberately never touches an appointment already at
 * invoice_sent/pending_confirmation/paid - recomputing a cut whose invoice is already out with
 * the artist would put the ledger out of sync with a real Square invoice, which is far worse than
 * a stale number.
 *
 * @param {object} appointment - a Mongoose Appointment document
 * @returns {Promise<object>} the same appointment, mutated
 */
async function applyShopCut(appointment) {
  if (!appointment.shopId) {
    appointment.shopCutCents = 0;
    appointment.shopCutPercentApplied = 0;
    appointment.shopCutStatus = 'none';
    return appointment;
  }
  const settledStatuses = ['invoice_sent', 'pending_confirmation', 'paid', 'received'];
  if (settledStatuses.includes(appointment.shopCutStatus)) {
    return appointment;
  }
  const percent = await resolveShopCutPercent(appointment.userId, appointment.shopId);
  // subtotalCents ONLY, minus any deposit credited to this appointment.
  //
  // The deposit deduction is a deliberate rule, and it's the one place the cut is computed on
  // less than the work was priced at: a $200 session with a $100 deposit applied is a $100
  // session for shop-cut purposes. That isn't the shop giving up half its cut - the deposit was
  // itself a payment when it was collected at the consult, and the cut was taken on it there.
  // Taking it again here would charge the artist twice on the same $100.
  //
  // Clamped at zero because a deposit larger than the session it's applied to is a real case
  // (a $500 deposit against a $300 final sitting), and a negative shop cut would read as the
  // shop owing the artist money.
  const cuttableCents = Math.max(
    0,
    (appointment.subtotalCents || 0) - (appointment.depositCreditCents || 0),
  );
  const cut = percentOfCents(cuttableCents, percent);
  appointment.shopCutCents = cut;
  appointment.shopCutPercentApplied = percent;
  appointment.shopCutStatus = cut > 0 ? 'unpaid' : 'none';
  return appointment;
}

module.exports = { resolveShopCutPercent, applyShopCut };
