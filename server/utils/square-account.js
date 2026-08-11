const SquareAccount = require('../models/SquareAccount');

/**
 * Which Square account applies, and for what. See DECISIONS.md M9.
 *
 * ---------------------------------------------------------------------------------------------
 * THERE ARE TWO ACCOUNTS AND THEY ARE NEVER INTERCHANGEABLE.
 *
 *   - THE ARTIST'S OWN account takes money from CLIENTS. Always the artist's, whether they work at
 *     a shop or not. A client pays the artist for the work.
 *   - THE SHOP'S account receives SHOP-CUT INVOICES from its artists. The artist owes the shop a
 *     percentage afterwards, and settles it - by Square invoice or by hand, exactly as they would
 *     with cash.
 *
 * The money moves client -> artist -> shop, in two separate transactions, and the second one is
 * what utils/square.js's createAndPublishShopCutInvoice does: "billed to the artist, payable
 * directly into the shop's own connected Square account".
 *
 * THIS FILE PREVIOUSLY RESOLVED A CLIENT CHARGE TO THE SHOP when the artist was connected to one,
 * on the reasoning that the tax rate resolves that way (M8). It does not follow, and the result was
 * severe: the shop received the entire payment AND then invoiced the artist for their cut of it, so
 * the shop was paid twice and the artist not at all. Tax is destination-based - a question about
 * WHERE THE WORK HAPPENED. Which account is charged is a question about WHO IS OWED. Those have
 * different answers and the same shop attached to one of them, which is what made the mistake easy.
 * ---------------------------------------------------------------------------------------------
 */

/**
 * The account a client's card is charged into: the artist's own, always.
 *
 * Returns null when they have not connected one. Null is a normal state - an artist who has not
 * connected Square still has a working product, they simply cannot take a card through it - and it
 * must NEVER fall back to the shop's account. That fallback is the bug this replaced.
 */
async function resolveArtistChargeAccount(artistUserId) {
  if (!artistUserId) {
    return null;
  }
  return SquareAccount.findOne({ ownerType: 'ARTIST', ownerId: artistUserId });
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
  resolveArtistChargeAccount,
  findAccountForOwner,
  getOrCreateAccountForOwner,
};
