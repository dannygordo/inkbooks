const mongoose = require('mongoose');
const Staff = require('../models/Staff');
const Client = require('../models/Client');
const Project = require('../models/Project');
const ArtistShopConnection = require('../models/ArtistShopConnection');
const { Constants } = require('./constants');
const { getConnectedArtistUserIds } = require('./artist-shop');
const { AuthenticationError } = require('./errors');

// Shared helpers for scoping the shop-wide "browse everything" list queries (getShops/getStaff/
// getArtists/getClients) to a non-admin caller's own shop(s), instead of returning every shop's
// data on the platform to any authenticated user. checkAuth's JWT payload only carries
// {id, email, username, role} - no userType - so, same as callerBelongsToShop in
// resolvers/appointments.js, this checks real DB relationships (Staff/ArtistShopConnection) rather
// than branching on a userType this code doesn't have.

// Returns the shopId(s) (as strings) this user is affiliated with - as Staff, or as an Artist via
// an active ArtistShopConnection.
async function getShopIdsForUser(userId) {
  // Artist.shopId used to be unioned in here as a second source of membership. It isn't any more -
  // ArtistShopConnection is the only answer to "which shop does this artist work at" (see
  // utils/artist-shop.js for what the two-source split cost). Staff.shopId stays: staff are shop
  // employees by definition and that relationship is a plain foreign key on purpose.
  const [staffRows, connections] = await Promise.all([
    Staff.find({ userId }).select('shopId'),
    ArtistShopConnection.find({ artistId: userId, status: 'active' }).select('shopId'),
  ]);
  const shopIds = new Set();
  staffRows.forEach((s) => shopIds.add(String(s.shopId)));
  connections.forEach((c) => shopIds.add(String(c.shopId)));
  return Array.from(shopIds);
}

// The artistIds (each one the artist's own User._id, matching the convention Project/
// BookingRequest/ArtistShopConnection all already use) connected to the given shopId(s). Kept as a
// named export because a dozen call sites read better for it, but it's now a straight alias - see
// utils/artist-shop.js.
async function getArtistIdsForShops(shopIds) {
  return getConnectedArtistUserIds(shopIds);
}

// Returns every User._id affiliated with the given shopId - both Staff and Artists (via the same
// two relationships as getArtistIdsForShops). Used to answer "which conversations belong to this
// shop" - a Conversation has no shopId of its own (see models/Conversation.js), so "belongs to
// this shop" means "at least one member is someone who works there."
async function getMemberUserIdsForShop(shopId) {
  const [staffRows, artistIds] = await Promise.all([
    Staff.find({ shopId }).select('userId'),
    getArtistIdsForShops([shopId]),
  ]);
  const memberIds = new Set(artistIds);
  staffRows.forEach((s) => {
    if (s.userId) {
      memberIds.add(String(s.userId));
    }
  });
  return Array.from(memberIds);
}

/**
 * THE ROLE RULE, in one place.
 *
 * NOBODY reaches a shop they aren't assigned to. There is no global role and no exemption - not
 * for ADMIN, not for support, not for the person who wrote this. Every question about shop-scoped
 * data is answered by a real relationship in the database (Staff.shopId,
 * ArtistShopConnection.shopId), never by a role number.
 *
 * Roles still exist, and still answer a different question: how much of their OWN shop somebody
 * sees. SHOP_ADMIN (10) sees the money; SHOP_STAFF (15) sees the schedule but not the books;
 * ARTIST (20) sees their own work. That is a "how privileged" question. "Which shop" is never a
 * role question, and a role comparison can never answer it - which is exactly how this codebase
 * spent months leaking every shop's revenue to every shop admin: `role <= SHOP_ADMIN` appeared
 * ~50 times, and in every case guarding shop-scoped data it meant "skip the shop check".
 *
 * ROLES.ADMIN (1) is kept as a reserved number so existing role-1 rows don't silently become
 * something else, but it grants no access to any shop's data. An account with role 1 and no Staff
 * row sees nothing at all, which is the intended, safe degradation.
 *
 * Cross-shop support access, if it's ever needed, is a Staff row at that shop - time-boxed,
 * revocable, and visible to the shop owner - not a role that bypasses this file.
 */

/**
 * Throws unless the caller is actually assigned to this shop.
 */
async function assertCanAccessShop(user, shopId) {
  if (!shopId) {
    throw new AuthenticationError('Action not allowed');
  }
  const shopIds = await getShopIdsForUser(user.id);
  if (!shopIds.map(String).includes(String(shopId))) {
    throw new AuthenticationError('Action not allowed');
  }
}

/**
 * "May this caller act on this artist's records?" - the artist-shaped counterpart to
 * assertCanAccessShop, for the many resolvers keyed by an artist's User._id rather than a shopId
 * (their appointments, projects, booking requests, deposits, shop connections).
 *
 * Allowed: the artist themselves, or someone at minRole-or-better who shares a shop with them.
 * No exemption above that - see the role rule above.
 *
 * minRole is per-call rather than fixed because the two sensible floors are already both in use:
 * SHOP_ADMIN for management surfaces (booking inbox, project lists, deposits) and SHOP_STAFF for
 * the front-desk surfaces a receptionist genuinely needs (the calendar, the artist page).
 */
async function canManageArtist(user, artistUserId, minRole = Constants.ROLES.SHOP_ADMIN) {
  if (artistUserId && String(user.id) === String(artistUserId)) {
    return true;
  }
  if (user.role > minRole || !artistUserId) {
    return false;
  }
  return sharesShopWith(user.id, artistUserId);
}

async function assertCanManageArtist(user, artistUserId, minRole = Constants.ROLES.SHOP_ADMIN) {
  if (!(await canManageArtist(user, artistUserId, minRole))) {
    throw new AuthenticationError('Action not allowed');
  }
}

/**
 * "May this caller read this conversation?" A Conversation has no shopId of its own (see
 * models/Conversation.js) - members is the only field that says who's in it - so "at my shop"
 * means "at least one member works where I work".
 *
 * Allowed: a member, or a shop-admin-or-better who shares a shop with a member. These are private
 * message threads between an artist and a client, so the floor stays at SHOP_ADMIN rather than
 * following the calendar's looser SHOP_STAFF rule.
 */
async function canAccessConversation(user, conversation) {
  const members = (conversation && conversation.members) || [];
  if (members.some((memberId) => String(memberId) === String(user.id))) {
    return true;
  }
  if (user.role > Constants.ROLES.SHOP_ADMIN || members.length === 0) {
    return false;
  }
  const myShopIds = new Set((await getShopIdsForUser(user.id)).map(String));
  if (myShopIds.size === 0) {
    return false;
  }
  const memberShopIds = await Promise.all(members.map((memberId) => getShopIdsForUser(memberId)));
  return memberShopIds.some((ids) => ids.some((id) => myShopIds.has(String(id))));
}

/**
 * Records that a shop has worked with a client, so "is this your client?" can be answered from
 * the moment the record exists rather than from the first project.
 *
 * $addToSet, not $push - this is called from several places in a booking flow that can legitimately
 * run more than once for the same pair, and a duplicated shopId would be noise in every later read.
 * Silently does nothing when there are no shops to add, which is the normal case for an independent
 * artist: they have no shop, their clients get no shopIds, and the shared-Project path in
 * canAccessClient is what reaches them instead.
 */
async function linkClientToShops(clientId, shopIds) {
  if (!clientId || !shopIds || shopIds.length === 0) {
    return;
  }
  await Client.updateOne(
    { _id: clientId },
    { $addToSet: { shopIds: { $each: shopIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
  );
}

// Convenience wrapper for the common case: link a client to whichever shops this user works at.
async function linkClientToUsersShops(clientId, userId) {
  const shopIds = await getShopIdsForUser(userId);
  await linkClientToShops(clientId, shopIds);
}

/**
 * "May this caller act on this client's record?"
 *
 * Three ways in, and each covers a case the others don't:
 *   - it's them (a client reading their own record)
 *   - a shop in common (Client.shopIds - true from the moment a shop adds them, which is what
 *     makes fixing a typo in a brand new client possible)
 *   - a shared Project (the only path for an INDEPENDENT artist, who has no shop at all, and the
 *     path that still works for records created before shopIds existed)
 *
 * This does NOT answer "may they write shop-internal notes about them" - see updateClientNotes in
 * mutations/clients.js, which additionally refuses the client themselves.
 */
async function canAccessClient(user, client) {
  if (!client) {
    return false;
  }
  if (String(user.id) === String(client.userId)) {
    return true;
  }
  const myShopIds = await getShopIdsForUser(user.id);
  const clientShopIds = (client.shopIds || []).map(String);
  if (myShopIds.some((id) => clientShopIds.includes(String(id)))) {
    return true;
  }
  // An ARTIST is their own "shop" for this purpose - an independent artist's clients are reached
  // through the work, since there's no shop to share.
  const artistIds =
    user.role === Constants.ROLES.ARTIST ? [user.id] : await getArtistIdsForShops(myShopIds);
  if (artistIds.length === 0) {
    return false;
  }
  return Boolean(
    await Project.exists({ artistId: { $in: artistIds }, clientId: client._id }),
  );
}

async function assertCanAccessClient(user, client) {
  if (!(await canAccessClient(user, client))) {
    throw new AuthenticationError('Action not allowed');
  }
}

// True when two users are affiliated with at least one shop in common. Used to answer "may this
// staff member look at this artist?" without a flat role gate: Staff at one shop have no business
// reading an artist's books at a different shop, and role alone can't express that.
async function sharesShopWith(userId, otherUserId) {
  const [mine, theirs] = await Promise.all([
    getShopIdsForUser(userId),
    getShopIdsForUser(otherUserId),
  ]);
  const mineSet = new Set(mine.map(String));
  return theirs.some((id) => mineSet.has(String(id)));
}

module.exports = {
  assertCanAccessShop,
  linkClientToShops,
  linkClientToUsersShops,
  canAccessClient,
  assertCanAccessClient,
  canManageArtist,
  assertCanManageArtist,
  canAccessConversation,
  getShopIdsForUser,
  getArtistIdsForShops,
  getMemberUserIdsForShop,
  sharesShopWith,
};
