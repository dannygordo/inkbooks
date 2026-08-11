const SquareAccount = require('../models/SquareAccount');
const { getActiveShopIdForArtist } = require('./artist-shop');

/**
 * Whose Square account applies, and whose it is. See DECISIONS.md M9.
 *
 * ---------------------------------------------------------------------------------------------
 * DELIBERATELY THE SAME SHAPE AS resolveSquareSettings in utils/square-pricing.js: active shop
 * first, artist only when independent, and a `source` on the way out so a UI can say whose these
 * are. That is not incidental symmetry. "Whose tax rate is this" and "whose Square account is this"
 * have to be the same question, or a shop artist ends up billing the shop's tax into the artist's
 * own Square account and the books disagree with themselves.
 *
 * If one of these two resolvers ever changes, the other one changes with it.
 * ---------------------------------------------------------------------------------------------
 */

/** The owner of the Square account for this artist, without loading the account itself. */
async function resolveSquareOwnerFor(artistUserId) {
  const shopId = await getActiveShopIdForArtist(artistUserId);
  if (shopId) {
    return { ownerType: 'SHOP', ownerId: shopId, source: 'shop' };
  }
  return { ownerType: 'ARTIST', ownerId: artistUserId, source: 'artist' };
}

/**
 * The Square account this artist's charges run through, or null if that owner has never connected
 * one.
 *
 * Null is a normal state, not an error - an artist who has not connected Square still has a whole
 * working product, they just cannot take a card through it. Callers that need a usable connection
 * should say so themselves rather than have this throw, because the message differs: a shop artist
 * has to ask their admin to reconnect, an independent artist can fix it themselves.
 */
async function resolveSquareAccountFor(artistUserId) {
  const owner = await resolveSquareOwnerFor(artistUserId);
  const account = await findAccountForOwner(owner.ownerType, owner.ownerId);
  return { ...owner, account };
}

/** The account for an explicit owner. Used by the OAuth callback, which knows the owner already. */
async function findAccountForOwner(ownerType, ownerId) {
  if (!ownerType || !ownerId) {
    return null;
  }
  return SquareAccount.findOne({ ownerType, ownerId });
}

/**
 * The account row for an owner, created empty if it does not exist yet.
 *
 * Upsert rather than insert because disconnecting CLEARS this row rather than deleting it (see
 * models/SquareAccount.js), so a reconnect finds a real document waiting and the unique index would
 * reject a second one.
 */
async function getOrCreateAccountForOwner(ownerType, ownerId) {
  return SquareAccount.findOneAndUpdate(
    { ownerType, ownerId },
    { $setOnInsert: { ownerType, ownerId, connected: false } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

module.exports = {
  resolveSquareOwnerFor,
  resolveSquareAccountFor,
  findAccountForOwner,
  getOrCreateAccountForOwner,
};
