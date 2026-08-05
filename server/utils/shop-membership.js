const Staff = require('../models/Staff');
const Artist = require('../models/Artist');
const ArtistShopConnection = require('../models/ArtistShopConnection');
const { Constants } = require('./constants');
const { AuthenticationError } = require('./errors');

// Shared helpers for scoping the shop-wide "browse everything" list queries (getShops/getStaff/
// getArtists/getClients) to a non-admin caller's own shop(s), instead of returning every shop's
// data on the platform to any authenticated user. checkAuth's JWT payload only carries
// {id, email, username, role} - no userType - so, same as callerBelongsToShop in
// resolvers/appointments.js, this checks real DB relationships (Staff/Artist/ArtistShopConnection)
// rather than branching on a userType this code doesn't have.

// Returns the shopId(s) (as strings) this user is affiliated with - either as Staff, or as an
// Artist (via the legacy single Artist.shopId field, or an active ArtistShopConnection).
async function getShopIdsForUser(userId) {
  const [staffRows, ownArtist, connections] = await Promise.all([
    Staff.find({ userId }).select('shopId'),
    Artist.findOne({ userId }).select('shopId'),
    ArtistShopConnection.find({ artistId: userId, status: 'active' }).select('shopId'),
  ]);
  const shopIds = new Set();
  staffRows.forEach((s) => shopIds.add(String(s.shopId)));
  if (ownArtist && ownArtist.shopId) {
    shopIds.add(String(ownArtist.shopId));
  }
  connections.forEach((c) => shopIds.add(String(c.shopId)));
  return Array.from(shopIds);
}

// Returns the artistIds (each one the artist's own User._id, matching the convention Project/
// BookingRequest/ArtistShopConnection all already use) affiliated with the given shopId(s), via
// the same two relationships as above. Used to scope getClients - Client has no shopId of its
// own, so the only path from "a shop" to "its clients" is through the Projects that shop's
// artists have with them.
async function getArtistIdsForShops(shopIds) {
  if (!shopIds || shopIds.length === 0) {
    return [];
  }
  const [directArtists, connections] = await Promise.all([
    Artist.find({ shopId: { $in: shopIds } }).select('userId'),
    ArtistShopConnection.find({ shopId: { $in: shopIds }, status: 'active' }).select('artistId'),
  ]);
  const artistIds = new Set();
  directArtists.forEach((a) => {
    if (a.userId) {
      artistIds.add(String(a.userId));
    }
  });
  connections.forEach((c) => artistIds.add(String(c.artistId)));
  return Array.from(artistIds);
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
 * data is answered by a real relationship in the database (Staff.shopId, Artist.shopId,
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
  canManageArtist,
  assertCanManageArtist,
  canAccessConversation,
  getShopIdsForUser,
  getArtistIdsForShops,
  getMemberUserIdsForShop,
  sharesShopWith,
};
