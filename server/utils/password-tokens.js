const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PasswordToken = require('../models/PasswordToken');
const User = require('../models/User');

/**
 * Issuing and redeeming password-set tokens. See models/PasswordToken.js for why the token is
 * stored as a hash and never in the clear.
 */

// 32 bytes of CSPRNG output, base64url so it survives a URL without escaping. Deliberately not
// crypto.randomUUID(): a UUIDv4 carries 122 bits and encodes version/variant bits that are
// structurally predictable. This is 256 bits with no structure at all, which is the appropriate
// shape for something that stands in for a password.
function generateRawToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// An invite gets a week because a new hire might not open their email for days and a dead link on
// day two just means the shop admin re-sends it - annoying, not dangerous. A reset gets an hour
// because the person is sitting there waiting for the email, so a longer window buys no usability
// and only widens the window in which an intercepted message is worth something.
const TTL_MS = {
  invite: 7 * 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

/**
 * Issues a token for a user, invalidating any it already had for the same purpose.
 *
 * The invalidation matters: without it, every "resend invite" click would leave another live
 * credential in circulation, and a user who requested five resets because the first email was
 * slow would have five working links, four of which they've forgotten about. One outstanding link
 * per purpose is the only number that's easy to reason about.
 *
 * @returns {Promise<{rawToken: string, expiresAt: Date}>} the RAW token - the only moment it
 *   exists in readable form. The caller emails it and must not persist it.
 */
async function issuePasswordToken({ userId, purpose, createdBy = null }) {
  await PasswordToken.deleteMany({ userId, purpose, usedAt: null });

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + TTL_MS[purpose]);
  await new PasswordToken({
    userId,
    tokenHash: hashToken(rawToken),
    purpose,
    expiresAt,
    createdBy,
  }).save();

  return { rawToken, expiresAt };
}

/**
 * Redeems a token and sets the user's password. Returns the updated User.
 *
 * Every failure mode returns the same error string. A caller must not be able to tell an expired
 * token from an already-used one from a fabricated one - the differences are only useful to
 * someone probing, and the honest answer for a real user is the same in all three cases: this
 * link doesn't work, ask for a new one.
 *
 * The claim is atomic. findOneAndUpdate matches on `usedAt: null` and stamps it in the same
 * operation, so two requests carrying the same token can't both succeed. A read-check-write here
 * would let a double-submitted form set the password twice - harmless in the common case, but the
 * same shape of bug as the deposit double-spend, and worth not writing twice.
 */
async function consumePasswordToken({ rawToken, newPassword }) {
  const tokenHash = hashToken(rawToken);

  const claimed = await PasswordToken.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!claimed) {
    return { ok: false, reason: 'invalid' };
  }

  const user = await User.findById(claimed.userId);
  if (!user) {
    return { ok: false, reason: 'invalid' };
  }

  user.password = await bcrypt.hash(newPassword, 12);
  // The flag that turns an invited account into a real one. It's also the switch that kills any
  // guest magic-link the account may have (see utils/guest-auth.js, which refuses a guest token
  // once hasSetPassword is true) - a link that bypasses password auth is acceptable only while
  // there's no password to bypass.
  user.hasSetPassword = true;
  await user.save();

  return { ok: true, user };
}

/**
 * Looks up a token without redeeming it, so the set-password page can tell someone their link is
 * dead BEFORE they type a password into a form that's going to reject it. Returns only whether
 * it's usable and who it's for - never anything that would let a caller enumerate accounts by
 * guessing tokens.
 */
async function inspectPasswordToken(rawToken) {
  const token = await PasswordToken.findOne({
    tokenHash: hashToken(rawToken),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!token) {
    return { valid: false };
  }
  const user = await User.findById(token.userId).select('firstName email');
  if (!user) {
    return { valid: false };
  }
  return { valid: true, purpose: token.purpose, firstName: user.firstName };
}

// An account created by a shop admin needs a password field that satisfies the schema's
// `required: true` while being impossible to log in with. Random and immediately discarded - it
// is never shown to anyone, never emailed, and nobody (including the admin who created the
// account) ever knows it. The account is reached only through its invite link until the person
// sets a real one.
//
// This is the alternative to a shared default password: a fixed string like "inkbooks123" would
// mean every unclaimed account in the system is open to anyone who has ever seen it, and that
// string inevitably ends up in a group chat.
async function generateUnusablePassword() {
  return bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12);
}

module.exports = {
  issuePasswordToken,
  consumePasswordToken,
  inspectPasswordToken,
  generateUnusablePassword,
  hashToken,
};
