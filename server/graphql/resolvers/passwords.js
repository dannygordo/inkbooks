const { inspectPasswordToken } = require('../../utils/password-tokens');

/**
 * Public token lookup, so the set-password page can say "this link has expired" before asking
 * someone to type a password into a form that's going to reject it.
 *
 * Returns only whether the token is usable, what it's for, and a first name to greet with -
 * never an email, never a user id. A guessed token must not become a way to read an account, and
 * the greeting is the most that's useful for confirming "yes, this is your link".
 */
module.exports = {
  Query: {
    inspectPasswordToken: async (_, { token }) => {
      const result = await inspectPasswordToken(token);
      return {
        valid: result.valid,
        purpose: result.valid ? result.purpose : null,
        firstName: result.valid ? result.firstName : null,
      };
    },
  },
};
