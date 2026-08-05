const Artist = require('../models/Artist');
const ArtistShopConnection = require('../models/ArtistShopConnection');

/**
 * Which shop an artist works at - answered in one place, from one source.
 *
 * The app used to have two answers. `Artist.shopId` was the original foreign key; then
 * ArtistShopConnection was introduced as the real membership model, and authorization moved onto
 * it - but the directories (getArtists, getArtistsByShop, getUserTagColors, the Artist.shop field
 * resolver) were never moved and kept reading the old field. They agreed only because
 * createArtistAccount and the seed happened to write both.
 *
 * connectArtistToShop - the mutation that actually exists for connecting an artist to a shop -
 * writes only the connection. So an artist connected that way was authorized at the shop, but
 * absent from its directory AND had a null Artist.shop, which the client reads as "independent
 * artist". The client sets Appointment.shopId from that field, so every appointment they booked
 * was written with no shop: no shop cut computed, and the session missing from the shop's
 * revenue entirely. Silently. That is what having two sources of truth cost.
 *
 * `Artist.shopId` is no longer read or written anywhere. The field remains on the schema for now
 * so old documents don't lose data before the backfill has run everywhere (see
 * scripts/backfill-artist-connections.js), but nothing consults it.
 */

// Exactly one active connection per artist is an invariant enforced on the write side - see
// connectArtistToShop in graphql/mutations/artistShopConnections.js, which disconnects any other
// active connection as part of connecting. `.sort({ updatedAt: -1 })` is belt-and-braces for data
// that predates that rule: it makes this deterministic rather than dependent on natural order.
async function getActiveConnection(artistUserId) {
  if (!artistUserId) {
    return null;
  }
  return ArtistShopConnection.findOne({ artistId: artistUserId, status: 'active' }).sort({
    updatedAt: -1,
  });
}

// The artist's current shopId, or null when they're independent. Independence is a first-class
// state here, not a failure - an artist gets the whole product with no shop attached.
async function getActiveShopIdForArtist(artistUserId) {
  const connection = await getActiveConnection(artistUserId);
  return connection ? connection.shopId : null;
}

// Every artist User._id currently connected to any of these shops.
async function getConnectedArtistUserIds(shopIds) {
  if (!shopIds || shopIds.length === 0) {
    return [];
  }
  const connections = await ArtistShopConnection.find({
    shopId: { $in: shopIds },
    status: 'active',
  }).select('artistId');
  return Array.from(new Set(connections.map((c) => String(c.artistId))));
}

/**
 * The Artist documents for a shop's roster, resolved through connections.
 *
 * Takes an extra filter so callers can layer on their own conditions - archiving passes
 * excludeArchived() through here rather than filtering the results in JS, which would page the
 * whole roster into memory to throw half of it away.
 */
async function findArtistsForShops(shopIds, extraFilter = {}) {
  const artistUserIds = await getConnectedArtistUserIds(shopIds);
  if (artistUserIds.length === 0) {
    return [];
  }
  return Artist.find({ ...extraFilter, userId: { $in: artistUserIds } });
}

module.exports = {
  getActiveConnection,
  getActiveShopIdForArtist,
  getConnectedArtistUserIds,
  findArtistsForShops,
};
