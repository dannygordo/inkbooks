const Appointment = require('../models/Appointment');
const Project = require('../models/Project');
const Client = require('../models/Client');
const User = require('../models/User');
const Artist = require('../models/Artist');
const Expense = require('../models/Expense');
const Income = require('../models/Income');
const { getArtistIdsForShops } = require('./shop-membership');
const { toObjectId } = require('./object-id');

/**
 * The one place any dashboard figure is defined.
 *
 * Both dashboards call this - the shop-wide one and the per-artist one - with different scopes.
 * That's the whole point of it being a module rather than two resolvers with similar-looking
 * pipelines: "revenue this month" has to mean the same thing on an artist's own dashboard as it
 * does on the shop owner's, or the first conversation where those two numbers disagree is one
 * nobody can settle.
 *
 * Computed in Mongo rather than by pulling rows to the caller. ArtistPerformancePanel used to sum
 * a whole appointment history in the browser, with a standing note that it should move
 * server-side as data grew; shop-wide is that volume times every artist at the shop, so doing it
 * client-side would have meant shipping every artist's full financial history to whoever opened
 * the page. It also means the numbers can be returned without the underlying rows, which matters
 * for the Staff-sees-activity-not-money split (see resolvers/analytics.js).
 *
 * DEFINITIONS, and why each one is drawn where it is:
 *
 *   revenue      totalCents on COMPLETED appointments only. A scheduled session has a price
 *                attached but nothing has changed hands - counting it makes the dashboard a
 *                forecast wearing an accountant's clothes. NOTE this is a change from what
 *                ArtistPerformancePanel did before: it summed every appointment in the window
 *                regardless of status, so an artist's "revenue" included work not yet done.
 *   tips         tipCents on completed appointments. Separate from revenue on purpose - the
 *                artist keeps all of it and it never enters the shop cut.
 *   average tip  over appointments that ACTUALLY received a tip, not all of them. Dividing by
 *                every completed session drags the figure toward zero with untipped ones and
 *                answers a question nobody asked.
 *   deposits     counted as revenue when COLLECTED, never again when applied. recordDeposit
 *                writes the deposit into the collecting appointment's subtotal/total, so it's
 *                already inside revenue - depositsCollectedCents is a breakdown of that figure,
 *                not an addition to it. depositsOutstandingCents is deliberately separate and
 *                deliberately labelled: unapplied deposits are money held against work not yet
 *                done, which is a liability, and it's the number most easily mistaken for profit.
 *   shop cut     three separate buckets rather than one total, because they're three different
 *                situations: earned (paid/received - money the shop actually has), outstanding
 *                (unpaid/invoice_sent - money owed), and awaiting confirmation
 *                (pending_confirmation - an artist says they paid, the shop hasn't agreed yet).
 *                Summing those into one number would hide the only one that needs action.
 *   expenses     every Expense row (models/Expense.js) OWNED by this exact scope - not derived
 *                through artist membership the way revenue is. A shop's rent isn't any artist's
 *                session, so this is Expense.find({shopId}) / Expense.find({artistUserId})
 *                directly, scoped by `date` the same [start, end) way as everything else here.
 *   other income Income rows (models/Income.js) - money in that isn't a tattoo session, same
 *                direct ownership scoping as expenses. Kept OUT of revenueCents on purpose: the
 *                two answer different questions ("what did sessions bring in" vs "what did
 *                everything else bring in"), and netCents is where they're finally added
 *                together.
 *
 * Everything is scoped by appointmentDate, not createdAt: a shop owner asking "how did March go"
 * means the work done in March, not the records typed up in March.
 */

// Appointment.shopCutStatus groupings - see models/Appointment.js for the full lifecycle.
const CUT_EARNED = ['paid', 'received'];
const CUT_OUTSTANDING = ['unpaid', 'invoice_sent'];
const CUT_AWAITING = ['pending_confirmation'];

// Project.status values that mean the work is still live. Defined as "not these" rather than a
// list of active ones so a status added later defaults to counting as active - an unrecognised
// status silently vanishing from a total is a worse failure than it being counted.
const PROJECT_CLOSED_STATUSES = ['completed', 'cancelled'];

// Shared - see utils/object-id.js on why an aggregation needs this and a find() does not.

/**
 * @param {object} scope
 * @param {string} [scope.shopId] - every artist at this shop
 * @param {string} [scope.artistUserId] - one artist, across every shop they work at
 * @param {Date} scope.start - inclusive
 * @param {Date} scope.end - exclusive, so consecutive ranges neither overlap nor drop a
 *   boundary appointment. A half-open interval is the only way "January" and "February" can be
 *   adjacent without double-counting midnight on the 1st.
 */
async function computeAnalytics({ shopId, artistUserId, start, end }) {
  // Which artists are in scope, and therefore which appointments/projects/clients belong to this
  // question at all.
  let artistUserIds;
  if (artistUserId) {
    artistUserIds = [String(artistUserId)];
  } else {
    artistUserIds = await getArtistIdsForShops([shopId]);
  }

  const appointmentMatch = {
    appointmentDate: { $gte: start, $lt: end },
  };
  if (shopId) {
    appointmentMatch.shopId = toObjectId(shopId);
  } else {
    appointmentMatch.userId = toObjectId(artistUserId);
  }

  // One pass over the matched appointments producing every appointment-derived figure, rather
  // than a query per metric. $cond inside $sum is how a single $group answers several different
  // conditional totals at once.
  const completedOnly = (field) => ({
    $sum: { $cond: [{ $eq: ['$appointmentStatus', 'completed'] }, { $ifNull: [field, 0] }, 0] },
  });
  const cutIn = (statuses) => ({
    $sum: {
      $cond: [{ $in: ['$shopCutStatus', statuses] }, { $ifNull: ['$shopCutCents', 0] }, 0],
    },
  });

  const totalsAgg = {
    revenueCents: completedOnly('$totalCents'),
    tipsCents: completedOnly('$tipCents'),
    subtotalCents: completedOnly('$subtotalCents'),
    taxCents: completedOnly('$taxCents'),
    feeCents: completedOnly('$feeCents'),
    shopCutEarnedCents: cutIn(CUT_EARNED),
    shopCutOutstandingCents: cutIn(CUT_OUTSTANDING),
    shopCutAwaitingConfirmationCents: cutIn(CUT_AWAITING),
    completedSessionCount: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ['$appointmentStatus', 'completed'] },
              { $eq: ['$appointmentType', 'session'] },
            ],
          },
          1,
          0,
        ],
      },
    },
    consultCount: {
      $sum: { $cond: [{ $eq: ['$appointmentType', 'consult'] }, 1, 0] },
    },
    appointmentCount: { $sum: 1 },
    // --- Deposits ---------------------------------------------------------------------------
    // Counted when COLLECTED, not when applied. recordDeposit sets the collecting appointment's
    // subtotal/total to the deposit, so it's already inside revenueCents above - these two are
    // the breakdown, not an addition to it. Adding them to revenue would double-count.
    //
    // Not gated on appointmentStatus, unlike revenue. A consult that collected a deposit is money
    // in the till on the day it was taken regardless of whether anyone remembered to mark the
    // consult 'completed' afterwards - and unlike a booked session, there's no sense in which the
    // deposit hasn't happened yet.
    depositsCollectedCents: { $sum: { $ifNull: ['$depositCents', 0] } },
    // Credits spent against sessions in this window. Reduces what clients owed, not revenue -
    // the money was already recognised when it was taken.
    depositsAppliedCents: { $sum: { $ifNull: ['$depositCreditCents', 0] } },
    // Money held against work not yet done. This is a LIABILITY, not earnings: the shop is
    // holding it on account and owes the client the work. Kept visible precisely because it's the
    // figure most easily mistaken for profit.
    depositsOutstandingCents: {
      $sum: {
        $cond: [{ $eq: ['$depositStatus', 'available'] }, { $ifNull: ['$depositCents', 0] }, 0],
      },
    },
    // Counted separately from tipsCents because the average is over tipped appointments only -
    // see this file's header.
    tippedCount: {
      $sum: { $cond: [{ $gt: [{ $ifNull: ['$tipCents', 0] }, 0] }, 1, 0] },
    },
  };

  const [totalsRow] = await Appointment.aggregate([
    { $match: appointmentMatch },
    { $group: { _id: null, ...totalsAgg } },
  ]);

  // --- Expenses and other income ------------------------------------------------------------
  // Owned directly by this scope (shopId XOR artistUserId on the row itself - see
  // utils/shop-membership.js's resolveBusinessOwner), not resolved through artist membership the
  // way appointment-derived figures above are. date, not createdAt - matches this whole file's
  // "a window means when it happened, not when it was typed in" rule.
  const ownerMatch = shopId ? { shopId: toObjectId(shopId) } : { artistUserId: toObjectId(artistUserId) };
  const dateMatch = { date: { $gte: start, $lt: end } };
  const [[expenseRow], [incomeRow]] = await Promise.all([
    Expense.aggregate([
      { $match: { ...ownerMatch, ...dateMatch } },
      { $group: { _id: null, totalCents: { $sum: '$amountCents' } } },
    ]),
    Income.aggregate([
      { $match: { ...ownerMatch, ...dateMatch } },
      { $group: { _id: null, totalCents: { $sum: '$amountCents' } } },
    ]),
  ]);
  const expensesCents = (expenseRow && expenseRow.totalCents) || 0;
  const otherIncomeCents = (incomeRow && incomeRow.totalCents) || 0;

  // Per-artist breakdown, same figures grouped by userId instead of collapsed. Skipped entirely
  // for a single-artist query, where it would just restate the totals as a one-row table.
  let perArtist = [];
  if (!artistUserId) {
    const rows = await Appointment.aggregate([
      { $match: appointmentMatch },
      { $group: { _id: '$userId', ...totalsAgg } },
    ]);
    // Names and tag colours come from a single follow-up query rather than a $lookup - the artist
    // count at one shop is small, and keeping it out of the pipeline means the User.tagColor
    // field resolver's self-heal still applies (see resolvers/index.js), which a raw $lookup
    // would bypass entirely and hand back the stale white value this codebase spent a whole fix
    // getting rid of.
    const rowUserIds = rows.map((r) => r._id);
    const [users, artistDocs] = await Promise.all([
      User.find({ _id: { $in: rowUserIds } }).select('firstName lastName avatar tagColor'),
      // The Artist document's own _id, which is NOT the same as the User._id these rows are keyed
      // by. /artist/:artistId routes on the Artist doc id (see resolvers/artists.js's getArtist,
      // which does Artist.findById) - linking a row with the User id would 404 every time, and
      // it's the exact id mix-up that already bit RoleRoute's own-page check. Resolved here so
      // the client never has to guess.
      Artist.find({ userId: { $in: rowUserIds } }).select('userId'),
    ]);
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const artistIdByUserId = new Map(artistDocs.map((a) => [String(a.userId), String(a._id)]));
    perArtist = rows
      .map((row) => ({
        ...row,
        userId: String(row._id),
        artistId: artistIdByUserId.get(String(row._id)) || null,
        user: byId.get(String(row._id)) || null,
      }))
      // Highest revenue first - a ranked table is the shape a shop owner reads this in.
      .sort((a, b) => b.revenueCents - a.revenueCents);
  }

  // --- Projects and clients ------------------------------------------------------------------
  // Both hang off artistUserIds rather than shopId, because neither Project nor Client carries a
  // shopId of its own - the only path from a shop to either is through its artists. Same join
  // resolvers/clients.js already uses.
  const artistObjectIds = artistUserIds.map(toObjectId);

  const [activeProjectCount, newProjectCount] = await Promise.all([
    // Deliberately NOT range-scoped: "active projects" is a statement about right now, not about
    // the selected window. A range-scoped version would read as zero for any historical range,
    // which would look like data loss rather than a definition.
    Project.countDocuments({
      artistId: { $in: artistObjectIds },
      status: { $nin: PROJECT_CLOSED_STATUSES },
    }),
    Project.countDocuments({
      artistId: { $in: artistObjectIds },
      createdAt: { $gte: start, $lt: end },
    }),
  ]);

  // Upcoming is likewise not range-scoped - it means "still to come", which is relative to now
  // and not to whatever window is selected.
  const upcomingCount = await Appointment.countDocuments({
    ...(shopId ? { shopId: toObjectId(shopId) } : { userId: toObjectId(artistUserId) }),
    appointmentDate: { $gte: new Date() },
  });

  const clientIds = await Project.distinct('clientId', { artistId: { $in: artistObjectIds } });
  const [totalClientCount, newClientCount] = await Promise.all([
    Promise.resolve(clientIds.length),
    // "New" means the client record was created in the window - the first time this shop's
    // artists had any relationship with them at all.
    Client.countDocuments({ _id: { $in: clientIds }, createdAt: { $gte: start, $lt: end } }),
  ]);

  const totals = totalsRow || {};
  const tipsCents = totals.tipsCents || 0;
  const tippedCount = totals.tippedCount || 0;

  return {
    start,
    end,
    revenueCents: totals.revenueCents || 0,
    subtotalCents: totals.subtotalCents || 0,
    taxCents: totals.taxCents || 0,
    feeCents: totals.feeCents || 0,
    tipsCents,
    tippedCount,
    averageTipCents: tippedCount > 0 ? Math.round(tipsCents / tippedCount) : 0,
    shopCutEarnedCents: totals.shopCutEarnedCents || 0,
    shopCutOutstandingCents: totals.shopCutOutstandingCents || 0,
    shopCutAwaitingConfirmationCents: totals.shopCutAwaitingConfirmationCents || 0,
    depositsCollectedCents: totals.depositsCollectedCents || 0,
    depositsAppliedCents: totals.depositsAppliedCents || 0,
    depositsOutstandingCents: totals.depositsOutstandingCents || 0,
    expensesCents,
    otherIncomeCents,
    // See this file's header - computed here so the three figures on a dashboard card always
    // agree by construction.
    netCents: (totals.revenueCents || 0) + otherIncomeCents - expensesCents,
    completedSessionCount: totals.completedSessionCount || 0,
    consultCount: totals.consultCount || 0,
    appointmentCount: totals.appointmentCount || 0,
    upcomingCount,
    activeProjectCount,
    newProjectCount,
    totalClientCount,
    newClientCount,
    artistCount: artistUserIds.length,
    artists: perArtist,
  };
}

module.exports = { computeAnalytics, PROJECT_CLOSED_STATUSES };
