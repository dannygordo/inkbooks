const mongoose = require('mongoose');

// A connected Square account, belonging to an OWNER rather than to a shop. See DECISIONS.md M9.
//
// These six fields used to live inline on models/Shop.js, which made "who can take a card" and
// "who is a shop" the same question. They are not. Under S2 an independent artist is their own
// admin, and under M8 they already carry taxRateBasisPoints and squareFeeOffsetCents on
// models/Artist.js - pricing configuration with no account to charge against. An artist with no
// shop could set a tax rate and then had no way to take a payment at all.
//
// ownerType/ownerId rather than two nullable foreign keys (shopId, artistId) with a check that
// exactly one is set. Two nullable columns make "neither" and "both" representable, and every
// reader then has to handle states the writer never intended. One discriminated pair cannot express
// either.
//
// ownerId for an ARTIST is the artist's own User._id, NOT the Artist collection's _id - matching
// the convention Project.artistId, BookingRequest.artistId and ArtistShopConnection.artistId
// already use. Getting this wrong produces a row that looks fine and never resolves.
const SquareAccountSchema = new mongoose.Schema(
  {
    ownerType: { type: String, required: true, enum: ['SHOP', 'ARTIST'] },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Tokens are encrypted at rest (see utils/token-crypto.js) per Square's
    // Move-OAuth-to-Production token-handling requirements - "guarded like passwords".
    // merchantId/locationId are identifiers, not credentials, and stay plaintext.
    connected: { type: Boolean, default: false },
    merchantId: { type: String },
    locationId: { type: String },
    accessTokenEncrypted: { type: String },
    refreshTokenEncrypted: { type: String },
    // Square OAuth access tokens expire every 30 days. Checked before each use and proactively
    // refreshed within 7 days of expiry, per Square's own recommendation - see
    // utils/square.js's getValidAccessToken.
    tokenExpiresAt: { type: Date },
    connectedAt: { type: Date },
  },
  { timestamps: true }
);

// ONE ACCOUNT PER OWNER, enforced by the database.
//
// Not partial, unlike ArtistShopConnection's index. A membership is an interval and needs its
// closed rows kept (A2); a Square connection is not - disconnecting CLEARS the credentials on this
// row rather than closing it and opening another, which is exactly what disconnectShopSquare
// already did to the inline fields. There is no history here to preserve, so there is no state in
// which a second row for one owner is legitimate.
SquareAccountSchema.index({ ownerType: 1, ownerId: 1 }, { unique: true });

const SquareAccount = mongoose.model('SquareAccount', SquareAccountSchema);

/**
 * Is this account usable for a charge right now?
 *
 * Deliberately a method rather than a stored field: `connected` says a seller completed the OAuth
 * handshake at some point, which is not the same as "we hold credentials we can use". A row with
 * connected: true and no access token is what a half-failed callback leaves behind, and every
 * caller that treats the boolean as sufficient will throw somewhere less obvious.
 */
SquareAccount.isUsable = (account) =>
  Boolean(account && account.connected && account.accessTokenEncrypted);

module.exports = SquareAccount;
