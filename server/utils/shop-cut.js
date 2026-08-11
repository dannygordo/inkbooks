const Shop = require('../models/Shop');
const ShopCutRate = require('../models/ShopCutRate');
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
 * All three exclusions are now CONFIRMED rather than assumed - see DECISIONS.md M2. The tax and fee
 * ones used to carry a note here saying they were my reading of standard practice and wanted
 * checking; they were checked. Worked example on the record: one hour at $180 with a 40% cut is
 * $180 x 0.4 = $72 to the shop.
 *
 * The Square_Fee_Offset (DECISIONS.md M5) is deliberately NOT in the cuttable base either. It exists
 * to recover a processing fee the artist pays, so the artist keeps it - folding it in would have the
 * shop take 40% of the artist's fee reimbursement.
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
 * Resolves which percentage applied to a given artist at a given shop, AS OF A DATE.
 *
 * THE RATE IS PER ARTIST. A shop has different artists at different rates, so the artist's own rate
 * wins and the shop's is only a default for artists who have none - the shop-level field is a
 * default, not the authority (DECISIONS.md M1).
 *
 * THE DATE IS THE POINT. A rate change applies forward only and never reprices work already
 * performed (DECISIONS.md M7). Passing the APPOINTMENT's date rather than "now" is what makes that
 * true by construction: an appointment's date doesn't move, so the rate it resolves cannot move
 * either. Editing a mistyped subtotal on last week's session re-derives the cut at LAST WEEK'S rate,
 * which is both correct and the reason this isn't solved by freezing the cut once written.
 *
 * Resolution order, all three steps unchanged in spirit from the version that had no date:
 *
 *   1. ShopCutRate - the newest row for this pair with effectiveFrom <= at. Append-only history.
 *   2. ArtistShopConnection.shopCutPercent - the pre-history fallback, for connections that existed
 *      before rates were dated. Checked with a NULL test, not a falsy one: 0 is a meaningful
 *      configured value ("this guest artist owes us nothing") and `||` would silently fall it
 *      through to the shop's rate.
 *   3. Shop.shopCutPercent - the shop's default.
 *
 * @param {string|ObjectId} artistUserId
 * @param {string|ObjectId} shopId
 * @param {Date} [at] - the date the WORK happened. Defaults to now, which is only right for work
 *                      happening now; every caller with an appointment should pass its date.
 * @returns {Promise<number>} percentage, e.g. 40 for 40%. 0 when nothing is configured.
 */
async function resolveShopCutPercentAt(artistUserId, shopId, at = new Date()) {
  if (!shopId) {
    // Independent artist - no shop, nothing owed. Not an error case.
    return 0;
  }

  const dated = await ShopCutRate.findOne({
    artistId: artistUserId,
    shopId,
    effectiveFrom: { $lte: at },
  })
    .sort({ effectiveFrom: -1 })
    .select('percent');
  if (dated) {
    return dated.percent;
  }

  // No dated rate at or before this moment. Note this deliberately does NOT fall forward to the
  // earliest rate row: if the history starts in June and the session is in May, May predates every
  // rate anyone recorded, and the honest answer is whatever the connection or shop says rather than
  // a rate that had not been agreed yet.
  //
  // Any membership for this pair, not just the current one - a session performed during a closed
  // interval still needs the rate that interval carried.
  const connection = await ArtistShopConnection.findOne({
    artistId: artistUserId,
    shopId,
  })
    .sort({ startedAt: -1 })
    .select('shopCutPercent');
  if (connection && connection.shopCutPercent !== null && connection.shopCutPercent !== undefined) {
    return connection.shopCutPercent;
  }

  const shop = await Shop.findById(shopId).select('shopCutPercent');
  return shop?.shopCutPercent || 0;
}

/**
 * The undated form, kept for callers that genuinely mean "right now".
 *
 * Deliberately a thin wrapper rather than a second implementation. It exists so the rename doesn't
 * force every call site to decide about dates in one commit, and so "now" stays an explicit choice
 * at each site rather than a default nobody noticed.
 */
async function resolveShopCutPercent(artistUserId, shopId) {
  return resolveShopCutPercentAt(artistUserId, shopId, new Date());
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
  // THE APPOINTMENT'S OWN DATE, not now. This is the line that makes a rate change forward-only:
  // recomputing this cut after a rate change re-derives it at the rate that applied when the work
  // happened, because appointmentDate does not move. Falls back to now only for an appointment with
  // no date, which the schema forbids - belt and braces rather than a real case.
  const percent = await resolveShopCutPercentAt(
    appointment.userId,
    appointment.shopId,
    appointment.appointmentDate || new Date(),
  );
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


/**
 * Records a new rate for an artist at a shop, from a date forward.
 *
 * APPEND-ONLY. This never edits an existing row, and that is the entire mechanism behind "a rate
 * change applies forward only" (DECISIONS.md M7) - there is no code path that can reprice past work,
 * because there is no code path that rewrites history.
 *
 * `effectiveFrom` defaults to now but is settable, because back-dating a renegotiation to the start
 * of the month is an ordinary thing to want and is a different fact from when somebody typed it in
 * (which is createdAt). Both are stored.
 *
 * Two rates for the same pair at the same instant would make "the rate that applied" ambiguous, and
 * the tie would be broken by whichever the index happened to return. The unique index rejects it;
 * this turns that into a readable error rather than a duplicate-key stack trace.
 *
 * @returns {Promise<object>} the created ShopCutRate document
 */
async function setShopCutRate({ artistUserId, shopId, percent, setByUserId, effectiveFrom, note }) {
  if (!artistUserId || !shopId) {
    throw new Error('setShopCutRate needs both an artist and a shop');
  }
  if (typeof percent !== 'number' || Number.isNaN(percent) || percent < 0 || percent > 100) {
    throw new Error(`setShopCutRate: percent must be a number between 0 and 100, got ${percent}`);
  }
  if (!setByUserId) {
    // A rate is money. A change with no author is not auditable, and the tempting default - the
    // artist it applies to - would be a lie whenever an admin made the change.
    throw new Error('setShopCutRate needs setByUserId - a rate change with no author is not auditable');
  }
  try {
    return await new ShopCutRate({
      artistId: artistUserId,
      shopId,
      percent,
      setByUserId,
      effectiveFrom: effectiveFrom || new Date(),
      note: note || '',
    }).save();
  } catch (err) {
    if (err && err.code === 11000) {
      throw new Error(
        'A shop cut rate already exists for this artist and shop at that exact moment. ' +
          'Pick a different effective date, or change the existing one.',
      );
    }
    throw err;
  }
}

module.exports = {
  resolveShopCutPercent,
  resolveShopCutPercentAt,
  setShopCutRate,
  applyShopCut,
};
