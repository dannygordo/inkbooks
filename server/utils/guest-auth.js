const BookingRequest = require('../models/BookingRequest');
const Client = require('../models/Client');
const User = require('../models/User');
const { AuthenticationError } = require('./errors');

// Parallel to check-auth.js/withAuth, but for the two guest-only actions (view a booking
// request's conversation, post a reply to it) that never go through a JWT at all - the token
// embedded in the guest's link stands in for a session entirely.
//
// Resolves a guest access token to its BookingRequest/Client/User, throwing if the token doesn't
// exist or if the underlying account has since set a real password. See models/User.js's
// hasSetPassword and PRODUCTION_ROADMAP.md's security rule: a magic link is a deliberate bypass
// around password auth, which is harmless for an account with no password to bypass, but must
// stop working the instant that account has a real one - otherwise anyone who intercepts the
// notification email carrying this link gets in without ever needing the password.
async function resolveGuestToken(token) {
  if (!token) {
    throw new AuthenticationError('A guest access token is required');
  }
  const bookingRequest = await BookingRequest.findOne({ guestToken: token });
  if (!bookingRequest) {
    throw new AuthenticationError('Invalid or expired link');
  }
  const client = await Client.findById(bookingRequest.clientId);
  if (!client) {
    throw new AuthenticationError('Invalid or expired link');
  }
  const user = await User.findById(client.userId);
  if (!user) {
    throw new AuthenticationError('Invalid or expired link');
  }
  if (user.hasSetPassword) {
    throw new AuthenticationError(
      'This link is no longer valid - please log in to your account to view this conversation'
    );
  }
  return { bookingRequest, client, user };
}

module.exports = { resolveGuestToken };
