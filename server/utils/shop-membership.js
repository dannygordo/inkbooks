const Staff = require('../models/Staff');
const Artist = require('../models/Artist');
const ArtistShopConnection = require('../models/ArtistShopConnection');

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

module.exports = { getShopIdsForUser, getArtistIdsForShops, getMemberUserIdsForShop };
