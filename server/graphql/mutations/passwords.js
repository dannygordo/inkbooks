const User = require('../../models/User');
const { UserInputError, rethrow } = require('../../utils/errors');
const { issuePasswordToken, consumePasswordToken } = require('../../utils/password-tokens');
const { sendPasswordResetEmail } = require('../../utils/email');
const { checkRateLimit, getClientIp } = require('../../utils/rate-limit');

/**
 * The logged-out half of password management. Both mutations here are deliberately public - the
 * whole point is serving someone who cannot log in.
 *
 * This is the flow ResetPassword.jsx has been apologising for not having. The previous attempt at
 * it reset any account given only a username, with no token and no proof of ownership; it was
 * removed rather than patched. Rebuilding it means being careful about the two things that made
 * the old one dangerous: proof that the requester controls the address, and no way to learn
 * anything about accounts you don't own.
 */
module.exports = {
  /**
   * Emails a reset link if the address belongs to an account.
   *
   * ALWAYS RETURNS THE SAME RESPONSE. Not when the email is unknown, not when the account exists,
   * not when the send fails - identical every time. Anything else turns this into an oracle for
   * "does this person have an account here", which for a tattoo shop's client list is a genuinely
   * sensitive question. That's also why there's no "no account found" error: the honest-looking
   * version of this mutation is the leaky one.
   *
   * Rate limited by IP. Without it, this is a free email-sending endpoint pointed at any address
   * the caller likes, which is both a way to spam a person and a way to burn the shop's sending
   * reputation.
   */
  requestPasswordReset: async (_, { email }, context) => {
    const ip = getClientIp(context.req);
    const { allowed } = checkRateLimit(`${ip}:requestPasswordReset`, {
      windowMs: 15 * 60 * 1000,
      max: 5,
    });
    // Even the rate-limit rejection returns the success shape. A 429 here would tell an attacker
    // their requests are landing, and legitimate users don't hit five resets in fifteen minutes.
    if (!allowed) {
      return true;
    }

    try {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized) {
        return true;
      }
      // Case-insensitive: people type their email with whatever capitalisation their phone
      // decided on, and "no account found" because of a capital letter is indistinguishable from
      // a real failure to the person it happens to.
      const user = await User.findOne({
        email: { $regex: `^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      });
      if (user) {
        const { rawToken } = await issuePasswordToken({ userId: user.id, purpose: 'reset' });
        await sendPasswordResetEmail({ to: user.email, firstName: user.firstName, rawToken });
      }
    } catch (err) {
      // Swallowed on purpose. A failure here (email provider down, database hiccup) must not
      // change what the caller sees, or the error itself becomes the oracle this whole design
      // avoids. Logged so it's visible to whoever runs the server.
      console.error('[passwords] requestPasswordReset failed:', err.message);
    }
    return true;
  },

  /**
   * Redeems a token and sets the password. Used by both the invite link and the reset link - the
   * token knows which it is; this doesn't need to.
   *
   * Returns a plain boolean rather than a session. Setting a password is not proof of intent to
   * log in, and auto-authenticating whoever redeems a link would mean an intercepted email grants
   * a session directly rather than merely a password the real owner can immediately reset. They
   * log in afterwards, like anyone else.
   */
  setPasswordWithToken: async (_, { token, newPassword }, context) => {
    const ip = getClientIp(context.req);
    const { allowed } = checkRateLimit(`${ip}:setPasswordWithToken`, {
      windowMs: 15 * 60 * 1000,
      max: 10,
    });
    if (!allowed) {
      throw new UserInputError('Errors', {
        errors: { token: 'Too many attempts. Try again shortly.' },
      });
    }

    try {
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new UserInputError('Errors', {
          errors: { newPassword: 'Password must be at least 8 characters' },
        });
      }

      const result = await consumePasswordToken({ rawToken: token, newPassword });
      if (!result.ok) {
        // One message for expired, already-used and fabricated alike - see
        // consumePasswordToken's own comment. The differences only help someone probing, and the
        // advice to a real user is identical in all three cases.
        throw new UserInputError('Errors', {
          errors: {
            token: 'This link is no longer valid. Ask for a new one.',
          },
        });
      }
      return true;
    } catch (err) {
      rethrow(err);
    }
  },
};
