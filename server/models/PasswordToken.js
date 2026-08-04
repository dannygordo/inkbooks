const mongoose = require('mongoose');

/**
 * Single-use, expiring tokens for setting a password without being logged in.
 *
 * Serves two purposes with one mechanism: the invite sent when a shop creates an artist or staff
 * account, and the self-service reset that this app has never had (see the note in
 * client/src/pages/resetPassword/ResetPassword.jsx - the previous "forgot password" reset any
 * account given only a username, which was a zero-credential takeover of every user, and was
 * removed rather than fixed). The difference between the two is a label and an expiry window, not
 * a mechanism, so building them separately would be two chances to get the same security
 * properties wrong.
 *
 * THE TOKEN ITSELF IS NEVER STORED. Only a SHA-256 hash of it is. The raw value exists exactly
 * twice - in the email that carries it, and in the request that redeems it. That matters because
 * a stored token is a live credential: anyone with read access to this collection (a leaked
 * backup, a misconfigured analytics pipeline, a support tool) could otherwise mint a session as
 * any user by copying a row. Hashing means a dump of this collection is worth nothing.
 *
 * SHA-256 rather than bcrypt, deliberately. bcrypt is slow on purpose to make guessing a
 * low-entropy human password expensive; these tokens are 32 random bytes, so guessing is already
 * off the table and the slowness would only cost the user latency on every redemption. Password
 * hashing and token hashing are different problems.
 */
const PasswordTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    // SHA-256 of the raw token. Unique so a (vanishingly unlikely) collision surfaces as a write
    // error rather than as two accounts sharing one link.
    tokenHash: { type: String, required: true, unique: true },
    // 'invite' for a newly created account, 'reset' for someone who's locked out. Only affects
    // wording and lifetime - an invite gets a long window because a new hire might not check
    // their email for days, a reset gets a short one because the person is sitting there waiting
    // for it and a long-lived reset link is a long-lived liability.
    purpose: { type: String, required: true, enum: ['invite', 'reset'] },
    expiresAt: { type: Date, required: true },
    // Set when redeemed. Kept rather than deleting the row so "was this link ever used, and
    // when" stays answerable - that question comes up precisely when someone is worried their
    // email was intercepted.
    usedAt: { type: Date },
    // Who triggered it. Null for a self-service reset (nobody is logged in to attribute it to),
    // set to the shop admin for an invite.
    createdBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

// Mongo drops documents once expiresAt passes. Belt and braces rather than the actual guard -
// consumePasswordToken checks expiry explicitly, because TTL removal runs on a background sweep
// roughly every 60 seconds and an expired-but-not-yet-swept token must not be redeemable in that
// window. This index is here so the collection doesn't grow without bound, not to enforce expiry.
PasswordTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordToken', PasswordTokenSchema);
