const BookingRequest = require('../../models/BookingRequest');
const User = require('../../models/User');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const { resolveGuestToken } = require('../../utils/guest-auth');

module.exports = {
  Query: {
    // Public, unauthenticated by design - lives here rather than resolvers/artists.js because
    // its only purpose is letting the public intake form (client/src/pages/booking) show "who
    // you're booking with" before the guest has any account. Deliberately returns a narrow,
    // explicit allowlist (id/firstName/lastName/avatar) via PublicArtistProfile rather than the
    // full Artist/User type - the full type carries email, phone, and other fields that have no
    // business being reachable by an unauthenticated caller who only has a User id. Returns null
    // (not a thrown error) for both "no such user" and "that id isn't an artist" - deliberately
    // not distinguishing the two, so this can't be used to probe which ids exist in the system.
    async getPublicArtistProfile(_, { artistId }) {
      const user = await User.findById(artistId).catch(() => null);
      if (!user || user.userType !== Constants.USER_TYPE.ARTIST) {
        return null;
      }
      return { id: user.id, firstName: user.firstName, lastName: user.lastName, avatar: user.avatar };
    },
    // Artist-only (withAuth) - the artist's own dashboard list, not the guest-facing side.
    getBookingRequests: withAuth(async (_, { artistId }, context, info, user) => {
      if (user.role > Constants.ROLES.SHOP_ADMIN && String(user.id) !== String(artistId)) {
        throw new AuthenticationError('Action not allowed');
      }
      return BookingRequest.find({ artistId }).sort({ createdAt: -1 });
    }),
    getBookingRequest: withAuth(async (_, { bookingRequestId }, context, info, user) => {
      const bookingRequest = await BookingRequest.findById(bookingRequestId);
      if (!bookingRequest) {
        throw new Error('Booking request not found');
      }
      if (
        user.role > Constants.ROLES.SHOP_ADMIN &&
        String(user.id) !== String(bookingRequest.artistId)
      ) {
        throw new AuthenticationError('Action not allowed');
      }
      return bookingRequest;
    }),
    // Public, token-gated (not withAuth) - resolves a guest's magic link to their own request.
    async getBookingRequestByToken(_, { token }) {
      const { bookingRequest } = await resolveGuestToken(token);
      return bookingRequest;
    },
  },
};
