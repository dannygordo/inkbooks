const Appointment = require('../models/Appointment');
const BookingRequest = require('../models/BookingRequest');
const PasswordToken = require('../models/PasswordToken');
const SquareAccount = require('../models/SquareAccount');
const User = require('../models/User');
const Staff = require('../models/Staff');
const Artist = require('../models/Artist');
const Client = require('../models/Client');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const BoothRentCharge = require('../models/BoothRentCharge');
const { Constants } = require('./constants');
const { getShopIdsForUser } = require('./shop-membership');
const { getConnectedArtistUserIds } = require('./artist-shop');
const { formatCents } = require('./money');
const {
  resolveThresholdsForArtists,
  DEFAULT_INITIAL_THRESHOLD_MINUTES,
} = require('./response-time');

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
  // Reads SquareAccount rather than the shop document (DECISIONS.md M9). One query for the whole
  // set, not one per shop - this runs on every attention fetch, and a per-shop lookup here would
  // put the dashboard's query count on the size of the admin's shop list.
  const accounts = await SquareAccount.find({
    ownerType: 'SHOP',
    ownerId: { $in: shopIds },
  }).select('ownerId merchantId tokenExpiresAt');
  const now = new Date();

  return accounts
    .filter((account) => account.merchantId && account.tokenExpiresAt)
    .filter((account) => account.tokenExpiresAt < now)
    .map((account) =>
      condition({
        key: `square-expired:${account.ownerId}`,
        type: 'square_token_expired',
        category: 'money',
        subjectType: 'shop',
        subjectId: account.ownerId,
        title: 'Square needs reconnecting',
        body: 'The connection has expired, so shop cut invoices are not being created. Nothing else will report this.',
        since: account.tokenExpiresAt,
      }),
    );
}

/**
 * Client messages nobody has answered - the shared query behind both halves of Feature 3
 * (unanswered-message nudges): the passive inbox condition below, and
 * utils/notification-jobs.js's active sendMessageNudges sweep. Kept as its own function, separate
 * from unansweredMessages, because the job needs the raw {artistUserId, clientUserId,
 * latestMessage} rows to decide WHO to notify and dedupe against - the `condition()` shape below
 * is deliberately display-only and has nowhere to put those.
 *
 * RESTRICTED TO THE SAME "CLEAN CLIENT <-> SINGLE ARTIST" THREAD SHAPE
 * sendAutoResponseForIncomingMessage (utils/auto-responses.js) already requires for its
 * MESSAGE_RECEIVED trigger - a staff-only thread (zero artist members) or a group thread (more
 * than one) has no single unambiguous artist this condition could report against, so both are
 * left alone rather than guessed at.
 *
 * `thresholdsByArtist` is a Map from utils/response-time.js's resolveThresholdsForArtists - each
 * artist's OWN resolved (already shop-ceiling-clamped) initialThresholdMinutes decides whether
 * their conversation is late, so two artists at the same shop with different personal settings
 * can disagree about the same client's conversation timing out.
 */
async function findUnansweredMessages(artistUserIds, thresholdsByArtist, { now = new Date() } = {}) {
  if (!artistUserIds || artistUserIds.length === 0) return [];

  const conversations = await Conversation.find({ members: { $in: artistUserIds } }).select(
    'members',
  );
  if (conversations.length === 0) return [];

  const memberIds = Array.from(
    new Set(conversations.flatMap((c) => (c.members || []).map(String))),
  );
  const [clientRows, artistRows] = await Promise.all([
    Client.find({ userId: { $in: memberIds } }).select('userId'),
    Artist.find({ userId: { $in: memberIds } }).select('userId'),
  ]);
  const clientUserIdSet = new Set(clientRows.map((c) => String(c.userId)));
  const ourArtistIdSet = new Set(artistUserIds.map(String));
  const artistUserIdSet = new Set(artistRows.map((a) => String(a.userId)));

  const eligible = [];
  for (const convo of conversations) {
    const members = (convo.members || []).map(String);
    const artistMembers = members.filter((m) => artistUserIdSet.has(m) && ourArtistIdSet.has(m));
    const clientMembers = members.filter((m) => clientUserIdSet.has(m));
    // Zero or more than one of either side - not a clean 1:1 client/artist thread. See this
    // function's own header comment.
    if (artistMembers.length !== 1 || clientMembers.length !== 1) {
      continue;
    }
    eligible.push({
      conversationId: convo._id,
      artistUserId: artistMembers[0],
      clientUserId: clientMembers[0],
    });
  }
  if (eligible.length === 0) return [];

  // Latest message per eligible conversation, in one aggregation rather than one query per
  // conversation.
  const conversationIds = eligible.map((e) => e.conversationId);
  const latestRows = await Message.aggregate([
    { $match: { conversationId: { $in: conversationIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$conversationId', message: { $first: '$$ROOT' } } },
  ]);
  const latestByConversation = new Map(latestRows.map((row) => [String(row._id), row.message]));

  const nowMs = now.getTime();
  const due = [];
  for (const { conversationId, artistUserId, clientUserId } of eligible) {
    const latestMessage = latestByConversation.get(String(conversationId));
    // No messages at all yet, or the ARTIST sent the most recent one - answered, or nothing was
    // ever asked in the first place.
    if (!latestMessage || String(latestMessage.senderId) !== String(clientUserId)) {
      continue;
    }
    const thresholds = (thresholdsByArtist && thresholdsByArtist.get(String(artistUserId))) || {
      initialThresholdMinutes: DEFAULT_INITIAL_THRESHOLD_MINUTES,
    };
    const cutoff = nowMs - thresholds.initialThresholdMinutes * 60 * 1000;
    if (new Date(latestMessage.createdAt).getTime() > cutoff) {
      continue;
    }
    due.push({ conversationId, artistUserId, clientUserId, latestMessage });
  }
  return due;
}

/**
 * Unanswered client messages, as a condition for the passive inbox - see findUnansweredMessages
 * above for the query itself, shared with utils/notification-jobs.js's active nudge sweep.
 */
async function unansweredMessages(artistUserIds, thresholdsByArtist) {
  const due = await findUnansweredMessages(artistUserIds, thresholdsByArtist);
  return due.map(({ conversationId, latestMessage }) =>
    condition({
      key: `unanswered-message:${conversationId}`,
      type: 'message_unanswered',
      category: 'message',
      subjectType: 'conversation',
      subjectId: conversationId,
      title: 'Client message still unanswered',
      body:
        (latestMessage.message || '').slice(0, 140) ||
        (latestMessage.imageUrls && latestMessage.imageUrls.length > 0
          ? 'They sent an image.'
          : ''),
      since: latestMessage.createdAt,
    }),
  );
}

/**
 * Booth rent past its due date and not yet marked paid - the shared query behind both halves of
 * Feature 5's escalation, the same split as findUnansweredMessages/unansweredMessages above: the
 * passive inbox condition below, and utils/notification-jobs.js's active sendBoothRentNudges
 * sweep. Kept as its own function, separate from overdueBoothRent, because the job needs the raw
 * charge rows (artistId, shopId) to decide who to notify - the `condition()` shape below is
 * deliberately display-only and has nowhere to put those.
 *
 * Deliberately does NOT check compensationModel/BoothRentPlan.active - a charge already exists
 * (utils/booth-rent.js only ever generates one for an artist genuinely on BOOTH_RENT at the time),
 * and if the artist has since switched back to PERCENTAGE the rent from before the switch is
 * still real money owed, not a stale record to hide.
 */
async function findOverdueBoothRentCharges(artistUserIds, { now = new Date() } = {}) {
  if (!artistUserIds || artistUserIds.length === 0) return [];
  return BoothRentCharge.find({
    artistId: { $in: artistUserIds },
    status: 'due',
    dueDate: { $lt: now },
  }).select('_id artistId shopId amountCents dueDate periodMonth');
}

/**
 * Overdue booth rent, as a condition for the passive inbox - see findOverdueBoothRentCharges
 * above for the query itself, shared with utils/notification-jobs.js's active nudge sweep.
 */
async function overdueBoothRent(artistUserIds) {
  const due = await findOverdueBoothRentCharges(artistUserIds);
  return due.map((c) =>
    condition({
      key: `overdue-booth-rent:${c._id}`,
      type: 'booth_rent_overdue',
      category: 'money',
      subjectType: 'boothRentCharge',
      subjectId: c._id,
      title: 'Booth rent is overdue',
      body: `${formatCents(c.amountCents)} was due ${c.dueDate.toDateString()}.`,
      amountCents: c.amountCents,
      since: c.dueDate,
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

  const [deposits, unpaid, unanswered, invites, square, unansweredMsgs, overdueRent] = await Promise.all([
    unappliedDeposits(artistUserIds),
    completedWithoutPayment(artistUserIds),
    unansweredBookingRequests(artistUserIds),
    isShopAdminOrBetter ? unredeemedInvites(shopIds) : [],
    isShopAdminOrBetter ? squareHealth(shopIds) : [],
    // Each artist's OWN resolved threshold, not one shared number - see
    // utils/response-time.js's resolveThresholdsForArtists.
    artistUserIds.length > 0
      ? resolveThresholdsForArtists(artistUserIds).then((thresholdsByArtist) =>
          unansweredMessages(artistUserIds, thresholdsByArtist),
        )
      : [],
    artistUserIds.length > 0 ? overdueBoothRent(artistUserIds) : [],
  ]);

  return [
    ...deposits,
    ...unpaid,
    ...unanswered,
    ...invites,
    ...square,
    ...unansweredMsgs,
    ...overdueRent,
  ].sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = {
  attentionForUser,
  unappliedDeposits,
  completedWithoutPayment,
  unansweredBookingRequests,
  unredeemedInvites,
  squareHealth,
  findUnansweredMessages,
  unansweredMessages,
  findOverdueBoothRentCharges,
  overdueBoothRent,
};
