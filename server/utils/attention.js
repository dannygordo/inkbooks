const Appointment = require('../models/Appointment');
const BookingRequest = require('../models/BookingRequest');
const PasswordToken = require('../models/PasswordToken');
const Shop = require('../models/Shop');
const User = require('../models/User');
const Staff = require('../models/Staff');
const Artist = require('../models/Artist');
const { Constants } = require('./constants');
const { getShopIdsForUser } = require('./shop-membership');
const { getConnectedArtistUserIds } = require('./artist-shop');

/**
 * Things that are currently TRUE and want attention. Never stored.
 *
 * Each function here is a query, not a record. That is the whole distinction in
 * NOTIFICATIONS_DESIGN.md §2, and it is what makes these self-resolving: a condition disappears
 * the moment it stops being true, with no reconciliation, no un-saying, and no possibility of
 * telling somebody a booking request is unanswered after they answered it.
 *
 * The stored alternative would be a second copy of a fact that already has a home. This codebase
 * has paid for that four times (Artist.shopId, Project.depositAmount, the Square app id,
 * User.username) and each one was silent until it wasn't.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS THE MOST VALUABLE FILE IN THE NOTIFICATION SYSTEM
 *
 * Everything here is a SILENT FAILURE - a case where nothing errors, nothing is logged, and
 * nobody finds out until they happen to look. An activity feed tells people what they already
 * know. These tell them what is wrong.
 *
 * Two of them are not hypothetical. Both were found by accident during development:
 *   - an email notification path that failed into a console.warn and was never seen
 *   - updateArtistRateSettings, broken from the day it was written, so no artist had ever once
 *     saved their own rate - and nothing anywhere said so
 * ---------------------------------------------------------------------------------------------
 *
 * Every function returns rows in the SAME shape a stored Notification renders as, so the inbox can
 * merge the two without knowing which is which:
 *
 *   { key, type, category, subjectType, subjectId, title, body, amountCents, createdAt, isCondition }
 *
 * `key` is stable and derived from the subject, so a client can dedupe and React can use it as a
 * list key across refetches. It is not an id: these rows have no identity, because they are not
 * things - they are the answer to a question asked just now.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// A condition's `createdAt` is when the underlying situation STARTED, not when the query ran.
// "Unanswered for 6 days" should sort as six days old in an inbox, not as new every time somebody
// refreshes - otherwise the oldest problems keep jumping to the top as if they just happened.
function condition({ key, type, category, subjectType, subjectId, title, body, amountCents, since }) {
  return {
    key,
    type,
    category,
    subjectType,
    subjectId: subjectId ? String(subjectId) : null,
    title,
    body: body || '',
    amountCents: amountCents ?? null,
    createdAt: since,
    isCondition: true,
  };
}

/**
 * Deposits collected but never applied to a session.
 *
 * Money the shop is holding on a client's behalf that nobody is tracking. It is not lost, but it is
 * owed, and the longer it sits the more likely it is to be forgotten entirely or double-counted as
 * revenue that was really a liability.
 *
 * 45 days is long enough that a normal consult-to-session gap doesn't trip it.
 */
async function unappliedDeposits(artistUserIds, { olderThanDays = 45 } = {}) {
  if (artistUserIds.length === 0) return [];
  const cutoff = new Date(Date.now() - olderThanDays * DAY_MS);
  const rows = await Appointment.find({
    userId: { $in: artistUserIds },
    depositStatus: 'available',
    depositCents: { $gt: 0 },
    depositCollectedAt: { $lt: cutoff },
  }).select('_id title depositCents depositCollectedAt');

  return rows.map((a) =>
    condition({
      key: `unapplied-deposit:${a._id}`,
      type: 'deposit_unapplied',
      category: 'money',
      subjectType: 'appointment',
      subjectId: a._id,
      title: `Deposit still unapplied${a.title ? ` — ${a.title}` : ''}`,
      body: 'Collected at a consult and never credited to a session. It is money owed to the client until it is.',
      amountCents: a.depositCents,
      since: a.depositCollectedAt,
    }),
  );
}

/**
 * Sessions marked completed with no money recorded against them.
 *
 * The clearest revenue leak in the system: work was done, the appointment says so, and the books
 * say nothing was charged. Every one of these is either an unbilled session or a data-entry miss,
 * and both want looking at.
 *
 * Excludes anything carrying a deposit credit - a session fully covered by a deposit legitimately
 * has a zero total, because the money arrived at the consult.
 */
async function completedWithoutPayment(artistUserIds, { olderThanDays = 2 } = {}) {
  if (artistUserIds.length === 0) return [];
  const cutoff = new Date(Date.now() - olderThanDays * DAY_MS);
  const rows = await Appointment.find({
    userId: { $in: artistUserIds },
    appointmentType: 'session',
    appointmentStatus: 'completed',
    appointmentDate: { $lt: cutoff },
    $or: [{ totalCents: { $lte: 0 } }, { totalCents: null }],
    // A deposit-covered session is a real zero, not a missing figure.
    $and: [{ $or: [{ depositCreditCents: { $lte: 0 } }, { depositCreditCents: null }] }],
  }).select('_id title appointmentDate');

  return rows.map((a) =>
    condition({
      key: `unpaid-session:${a._id}`,
      type: 'session_without_payment',
      category: 'money',
      subjectType: 'appointment',
      subjectId: a._id,
      title: `Completed session with nothing charged${a.title ? ` — ${a.title}` : ''}`,
      body: 'Marked completed but no payment was recorded. Either it was not billed, or the amount never got entered.',
      since: a.appointmentDate,
    }),
  );
}

/**
 * Booking requests nobody has responded to.
 *
 * A lost customer that nothing else in the app will ever mention. The request sits in an inbox
 * looking exactly like one that was handled.
 */
async function unansweredBookingRequests(artistUserIds, { olderThanHours = 48 } = {}) {
  if (artistUserIds.length === 0) return [];
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const rows = await BookingRequest.find({
    artistId: { $in: artistUserIds },
    status: 'pending',
    source: 'public_form',
    createdAt: { $lt: cutoff },
  }).select('_id createdAt description');

  return rows.map((r) =>
    condition({
      key: `unanswered-request:${r._id}`,
      type: 'booking_request_unanswered',
      category: 'schedule',
      subjectType: 'bookingRequest',
      subjectId: r._id,
      title: 'Booking request still unanswered',
      body: (r.description || '').slice(0, 140),
      since: r.createdAt,
    }),
  );
}

/**
 * Invites nobody has redeemed.
 *
 * Somebody was created an account and cannot use it. This one is on the list because it actually
 * happened here: invited artists could set a password and then had no way to sign in at all, and
 * the only signal was that they never appeared.
 */
async function unredeemedInvites(shopIds, { olderThanDays = 3 } = {}) {
  if (shopIds.length === 0) return [];
  const cutoff = new Date(Date.now() - olderThanDays * DAY_MS);

  // Everyone at these shops who still has no password.
  const [staffRows, artistIds] = await Promise.all([
    Staff.find({ shopId: { $in: shopIds } }).select('userId'),
    getConnectedArtistUserIds(shopIds),
  ]);
  const memberIds = Array.from(
    new Set([...staffRows.map((s) => String(s.userId)), ...artistIds.map(String)]),
  );
  if (memberIds.length === 0) return [];

  const stranded = await User.find({
    _id: { $in: memberIds },
    hasSetPassword: false,
  }).select('_id firstName lastName createdAt');
  if (stranded.length === 0) return [];

  // Only where an invite was actually issued and has since gone stale.
  const tokens = await PasswordToken.find({
    userId: { $in: stranded.map((u) => u._id) },
    purpose: 'invite',
    usedAt: null,
    createdAt: { $lt: cutoff },
  }).select('userId createdAt');
  const issuedAt = new Map(tokens.map((t) => [String(t.userId), t.createdAt]));

  return stranded
    .filter((u) => issuedAt.has(String(u._id)))
    .map((u) =>
      condition({
        key: `unredeemed-invite:${u._id}`,
        type: 'invite_unredeemed',
        category: 'roster',
        subjectType: 'artist',
        subjectId: u._id,
        title: `${u.firstName} ${u.lastName} has not set up their account`,
        body: 'They were invited but have never set a password, so they cannot sign in. Resend the invite.',
        since: issuedAt.get(String(u._id)),
      }),
    );
}

/**
 * Square connected but expired, or never connected while invoicing is in use.
 *
 * When a Square token expires, shop-cut invoicing stops working and nothing says so - the
 * invoices simply stop being created. This is the definitive silent failure in this system.
 */
async function squareHealth(shopIds) {
  if (shopIds.length === 0) return [];
  const shops = await Shop.find({ _id: { $in: shopIds } }).select(
    '_id name squareMerchantId squareTokenExpiresAt',
  );
  const now = new Date();

  return shops
    .filter((shop) => shop.squareMerchantId && shop.squareTokenExpiresAt)
    .filter((shop) => shop.squareTokenExpiresAt < now)
    .map((shop) =>
      condition({
        key: `square-expired:${shop._id}`,
        type: 'square_token_expired',
        category: 'money',
        subjectType: 'shop',
        subjectId: shop._id,
        title: 'Square needs reconnecting',
        body: 'The connection has expired, so shop cut invoices are not being created. Nothing else will report this.',
        since: shop.squareTokenExpiresAt,
      }),
    );
}

/**
 * Everything currently wanting this user's attention.
 *
 * Scoped by who they are, using the same shop-membership helpers as every other query in this
 * codebase - no role shortcuts. An artist sees their own work; a shop admin sees their shop's.
 */
async function attentionForUser(user) {
  const shopIds = await getShopIdsForUser(user.id);
  const isShopAdminOrBetter = user.role <= Constants.ROLES.SHOP_ADMIN;

  // Whose appointments this person is answerable for. An artist: their own. A shop admin: everyone
  // connected to their shop. Anyone else: nothing, which is the correct empty answer rather than
  // an error.
  let artistUserIds = [];
  if (isShopAdminOrBetter && shopIds.length > 0) {
    artistUserIds = (await getConnectedArtistUserIds(shopIds)).map(String);
  } else if (await Artist.exists({ userId: user.id })) {
    // "Is this person an artist" is answered by whether they HAVE an artist profile, not by
    // user.userType. withAuth hands resolvers checkAuth's decoded JWT, whose payload is
    // {id, email, role} - there is no userType on it and never has been, so the comparison would be
    // `undefined === 'artist'`, permanently false, and every artist would silently get an empty
    // list. That exact mistake shipped twice in this codebase (updateArtistRateSettings was broken
    // from the day it was written for this reason). Ask the database about a real relationship, as
    // utils/shop-membership.js has said all along.
    artistUserIds = [String(user.id)];
  }

  const [deposits, unpaid, unanswered, invites, square] = await Promise.all([
    unappliedDeposits(artistUserIds),
    completedWithoutPayment(artistUserIds),
    unansweredBookingRequests(artistUserIds),
    isShopAdminOrBetter ? unredeemedInvites(shopIds) : [],
    isShopAdminOrBetter ? squareHealth(shopIds) : [],
  ]);

  return [...deposits, ...unpaid, ...unanswered, ...invites, ...square].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

module.exports = {
  attentionForUser,
  unappliedDeposits,
  completedWithoutPayment,
  unansweredBookingRequests,
  unredeemedInvites,
  squareHealth,
};
