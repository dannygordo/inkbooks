const BookingRequest = require('../../models/BookingRequest');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const { resolveGuestToken } = require('../../utils/guest-auth');

module.exports = {
  Query: {
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
