const mongoose = require('mongoose');
const BookingRequest = require('../../models/BookingRequest');
const User = require('../../models/User');
const Artist = require('../../models/Artist');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { resolveGuestToken } = require('../../utils/guest-auth');
const { assertCanManageArtist } = require('../../utils/shop-membership');
const { UserInputError } = require('../../utils/errors');
const { normalizeSlug } = require('../../utils/booking-slug');

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
    //
    // Takes EITHER a bookingSlug or a raw artist ObjectId under the same `artistId` argument.
    // Slug first, because that is what a shared link contains now; the ObjectId path stays so
    // that links handed out before slugs existed keep working, and so an artist who has not
    // chosen a slug yet still has a reachable booking page.
    //
    // Slug lookup goes through Artist and then to the User, since bookingSlug lives on the
    // artist's profile rather than on their account (see utils/booking-slug.js on why).
    async getPublicArtistProfile(_, { artistId }) {
      let artist = null;
      let user = null;

      const slug = normalizeSlug(artistId);
      if (slug) {
        artist = await Artist.findOne({ bookingSlug: slug });
        if (artist) {
          user = await User.findById(artist.userId).catch(() => null);
        }
      }

      // Only fall back to an id lookup if the slug missed. isValidObjectId first, because
      // findById on a non-ObjectId string throws a CastError rather than returning null - the
      // existing .catch(() => null) already swallowed that, but checking is clearer than relying
      // on an exception for control flow on the common path (every slug is a non-ObjectId).
      if (!user && mongoose.isValidObjectId(artistId)) {
        user = await User.findById(artistId).catch(() => null);
        if (user) {
          artist = await Artist.findOne({ userId: user._id });
        }
      }

      if (!user || user.userType !== Constants.USER_TYPE.ARTIST) {
        return null;
      }
      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        bookingSlug: artist ? artist.bookingSlug || null : null,
      };
    },
    // Artist-only (withAuth) - the artist's own dashboard list, not the guest-facing side.
    // source: 'public_form' only - a real guest submission via the public intake form. Excludes
    // 'artist_created' BookingRequests, which the appointment wizard generates internally purely
    // to reuse this same find-or-create-client + convert pipeline for a consult/session the
    // artist scheduled directly from their own calendar - those were never a "booking request"
    // from the artist's own point of view and shouldn't be echoed back at them in this inbox. See
    // BookingRequest.js's own comment on the source field.
    getBookingRequests: withAuth(async (_, { artistId, statuses }, context, info, user) => {
      // The artist themselves, or a shop admin at their shop. Previously any shop admin, at any
      // shop, could read an artist's whole inbox - each request carries a client's name, email
      // and the description of the work they want.
      await assertCanManageArtist(user, artistId);

      // Validated against the enum rather than passed straight through. Mongo will happily filter
      // on a value that cannot exist and return an empty set instead of complaining, so a typo'd
      // status would look exactly like "this artist has no requests" - the same silent-empty-set
      // trap as querying Staff for a role field it doesn't have (see notification-audience.js).
      const requested = (statuses || []).filter((s) => BookingRequest.STATUSES.includes(s));
      if (statuses && requested.length !== statuses.length) {
        throw new UserInputError('Errors', {
          errors: {
            statuses: `Unknown status. Valid values: ${BookingRequest.STATUSES.join(', ')}`,
          },
        });
      }

      return BookingRequest.find({
        artistId,
        source: 'public_form',
        status: { $in: requested.length > 0 ? requested : BookingRequest.INBOX_STATUSES },
      }).sort({ createdAt: -1 });
    }),
    getBookingRequest: withAuth(async (_, { bookingRequestId }, context, info, user) => {
      const bookingRequest = await BookingRequest.findById(bookingRequestId);
      if (!bookingRequest) {
        throw new UserInputError('Errors', { errors: { bookingRequestId: 'Booking request not found.' } });
      }
      await assertCanManageArtist(user, bookingRequest.artistId);
      return bookingRequest;
    }),
    // Public, token-gated (not withAuth) - resolves a guest's magic link to their own request.
    async getBookingRequestByToken(_, { token }) {
      const { bookingRequest } = await resolveGuestToken(token);
      return bookingRequest;
    },
  },
};
