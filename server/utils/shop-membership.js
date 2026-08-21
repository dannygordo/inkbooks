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
// {id, email, role} - no userType - so, same as callerBelongsToShop in
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
 * "Does this caller hold shop-admin authority for the purposes of THIS action?" - the missing half
 * of DECISIONS.md S2.
 *
 * ---------------------------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES. S2 says an unaffiliated artist is their own admin: anything gated on
 * "shop admin" applies only where a shop exists. Two gate styles existed and only one obeyed it.
 * canManageArtist above checks self FIRST, so an artist always passes for their own data.
 * `withAuth(fn, ROLES.SHOP_ADMIN)` is a bare role floor that runs BEFORE the function body, and an
 * independent artist has role ARTIST - so those refused them outright, no matter how correct the
 * ownership check inside was. archiveClient is the clearest case: its body already calls
 * assertCanAccessClient, which has an explicit "an ARTIST is their own shop for this purpose"
 * branch, and an independent artist never reached it.
 *
 * SO THE FLOOR MOVES INSIDE. A resolver using this drops the withAuth minRole argument and calls
 * this first instead. The difference is that this one can ask a question a role number cannot:
 * "is there a shop here at all?"
 *
 * NOT A BLANKET LOOSENING. This is only for authority over one's OWN data, and each call site
 * still runs its own ownership check afterwards - this replaces the floor, not the check. Gates
 * that are genuinely shop-level keep the bare floor and should: createStaffAccount, updateShop,
 * disconnectShopSquare and confirmShopCutPaid have no meaning for someone with no shop, and
 * loosening them would expose a mutation rather than grant a permission.
 * ---------------------------------------------------------------------------------------------
 */
async function hasAdminAuthority(user) {
  if (user.role <= Constants.ROLES.SHOP_ADMIN) {
    return true;
  }
  // No shop, no admin above them. The lookup is the point: "independent" is a fact about the
  // database, not something a role number or a token field can express.
  const shopIds = await getShopIdsForUser(user.id);
  return shopIds.length === 0;
}

async function assertAdminAuthority(user) {
  if (!(await hasAdminAuthority(user))) {
    throw new AuthenticationError('Action not allowed');
  }
}

/**
 * Business-record ownership - expenses, income, and their recurring/type tables (see
 * models/Expense.js, models/Income.js, models/RecurringExpense.js).
 *
 * ---------------------------------------------------------------------------------------------
 * EVERY ONE OF THESE ROWS CARRIES EXACTLY ONE OWNER: a shopId (the shop's own books) or an
 * artistUserId (an independent artist's own books - or a shop-affiliated artist's personal
 * tracking, kept separate from the shop's). This is deliberately NOT the shape Appointment uses,
 * where shopId is one artist's session attributed to a shop they're connected to - a shop's rent
 * isn't any one artist's session, and there's no membership to resolve through the way there is
 * for a booking. The owner is exactly who the row belongs to, full stop.
 *
 * resolveBusinessOwner decides which owner a NEW row gets, from what the caller asked for: a
 * shopId in the input is validated as a shop they administer (SHOP ADMIN ONLY - staff and other
 * artists at the shop do not manage its books, matching setShopCutRate/
 * updateSquarePricingSettings's existing money-config floor); a shopId left out becomes the
 * caller's own artistUserId, unconditionally - even a shop-affiliated artist may keep a personal
 * ledger here, since nothing about owning a shopId-scoped row and an artistUserId-scoped row is
 * mutually exclusive.
 *
 * assertCanManageBusinessRecord re-checks the same authority against an EXISTING row's stored
 * owner, for every read/update/delete - re-validated on every call rather than trusted from
 * create time, the same reasoning assertCanAccessShop is always called fresh rather than cached.
 * ---------------------------------------------------------------------------------------------
 */
async function resolveBusinessOwner(user, shopId) {
  if (shopId) {
    await assertCanAccessShop(user, shopId);
    if (user.role > Constants.ROLES.SHOP_ADMIN) {
      throw new AuthenticationError(
        'A shop\'s books are shop admin only - see DECISIONS.md S2 for the independent-artist case.',
      );
    }
    return { shopId, artistUserId: null };
  }
  return { shopId: null, artistUserId: user.id };
}

async function assertCanManageBusinessRecord(user, { shopId, artistUserId }) {
  if (shopId) {
    await assertCanAccessShop(user, shopId);
    if (user.role > Constants.ROLES.SHOP_ADMIN) {
      throw new AuthenticationError('Action not allowed');
    }
    return;
  }
  if (artistUserId && String(user.id) === String(artistUserId)) {
    return;
  }
  throw new AuthenticationError('Action not allowed');
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

/**
 * "Does this client actually belong to this Form's owner?" - the REVERSE direction of
 * canAccessClient above (there: does the acting staff/artist reach this client; here: does this
 * client reach this shop/artist), needed because Forms' self-service submission path
 * (resolvers/forms.js's submitFormResponse) resolves a form by bare formId for an authenticated
 * caller with no ownership check at all - a signed-in client could otherwise submit a response
 * against ANY published form on the platform, shop-owned or artist-owned, regardless of ever
 * having worked with that shop or artist. Not a data leak (the response holds only what the
 * client themselves typed), but a real integrity gap: it would let a client's response land in a
 * completely unrelated business's FormResponses list.
 *
 * Same two paths canAccessClient itself checks, just walked from the other end: a shop-owned form
 * needs this shop in the client's own shopIds; an artist-owned form needs a shared Project, the
 * only link an independent (or shop-affiliated-but-personally-owned) artist's clients are ever
 * reached through.
 */
async function clientBelongsToFormOwner(client, { shopId, artistUserId }) {
  if (!client) {
    return false;
  }
  if (shopId) {
    const clientShopIds = (client.shopIds || []).map(String);
    return clientShopIds.includes(String(shopId));
  }
  if (artistUserId) {
    return Boolean(await Project.exists({ artistId: artistUserId, clientId: client._id }));
  }
  return false;
}

/**
 * "May this caller triage this client's shared-message images?" - narrower than canAccessClient
 * above on purpose. That function also lets the client read their own record (it answers "can I
 * see this client"), and lets any shop member - including front-desk staff - in by virtue of
 * sharing a shop. This surface exists to let someone file a client-shared image onto a project's
 * References/Design/Body Images list, which is an artist-and-shop-admin action: never the client
 * themselves (this chooses what lands in their own project), and not staff, who don't manage
 * project content anywhere else in this app either.
 */
async function canManageClientSharedImages(user, client) {
  if (!client) {
    return false;
  }
  // An independent artist reached through a shared project - the same path canAccessClient's own
  // artist branch takes, since there's no shop to check shopIds against.
  if (user.role === Constants.ROLES.ARTIST) {
    return Boolean(await Project.exists({ artistId: user.id, clientId: client._id }));
  }
  if (user.role > Constants.ROLES.SHOP_ADMIN) {
    return false;
  }
  const myShopIds = await getShopIdsForUser(user.id);
  const clientShopIds = (client.shopIds || []).map(String);
  return myShopIds.some((id) => clientShopIds.includes(String(id)));
}

async function assertCanManageClientSharedImages(user, client) {
  if (!(await canManageClientSharedImages(user, client))) {
    throw new AuthenticationError('Action not allowed');
  }
}

/**
 * The Mongo filter matching every Client this caller may LIST - the exact scoping getClients
 * (resolvers/clients.js) applies, extracted so a second caller (the search resolver) reuses it
 * rather than re-deriving it. Re-deriving authorization logic a second time is exactly the failure
 * shape this file's own comments describe repeatedly (`role <= SHOP_ADMIN` used as a shop-scope
 * stand-in, ~50 times, months of cross-shop leakage) - one function, two callers, is how that class
 * of bug stops being possible rather than merely avoided this time.
 *
 * Returns null rather than `{}` when the caller can see no clients at all (no shop, no shared
 * projects) - `{}` would mean "everyone," which is the one answer that must never come from here.
 * The caller decides what null means: getClients turns it into an empty page, search skips the
 * collection.
 */
async function clientScopeFilter(user) {
  const shopIds = await getShopIdsForUser(user.id);
  const artistIds =
    user.role === Constants.ROLES.ARTIST ? [user.id] : await getArtistIdsForShops(shopIds);
  const clientIdsFromProjects = artistIds.length
    ? await Project.distinct('clientId', { artistId: { $in: artistIds } })
    : [];

  const or = [];
  if (shopIds.length) {
    or.push({ shopIds: { $in: shopIds } });
  }
  if (clientIdsFromProjects.length) {
    or.push({ _id: { $in: clientIdsFromProjects } });
  }
  return or.length ? { $or: or } : null;
}

/**
 * The Mongo filter matching every Project this caller may LIST - the exact scoping getProjects
 * (resolvers/projects.js) applies. Same reasoning as clientScopeFilter above: one function, every
 * caller that needs "which projects can this person see" goes through it.
 *
 * Returns null when the caller can see no projects (a staff/admin with no connected artists, or a
 * client with no Client record of their own) - never `{}`.
 */
async function projectScopeFilter(user) {
  if (user.role === Constants.ROLES.ARTIST) {
    return { artistId: user.id };
  }
  if (user.role <= Constants.ROLES.SHOP_STAFF) {
    const shopIds = await getShopIdsForUser(user.id);
    const artistIds = await getArtistIdsForShops(shopIds);
    return artistIds.length ? { artistId: { $in: artistIds } } : null;
  }
  const myClient = await Client.findOne({ userId: user.id }).select('_id');
  return myClient ? { clientId: myClient.id } : null;
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
  clientBelongsToFormOwner,
  canManageClientSharedImages,
  assertCanManageClientSharedImages,
  clientScopeFilter,
  projectScopeFilter,
  canManageArtist,
  assertCanManageArtist,
  hasAdminAuthority,
  assertAdminAuthority,
  canAccessConversation,
  getShopIdsForUser,
  getArtistIdsForShops,
  getMemberUserIdsForShop,
  sharesShopWith,
  resolveBusinessOwner,
  assertCanManageBusinessRecord,
};
