const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { getShopIdsForUser, sharesShopWith } = require('../../utils/shop-membership');
const { computeAnalytics } = require('../../utils/analytics');

// Every money-denominated field on the Analytics type. Listed once, here, rather than deleted
// field-by-field at each call site - a new money field added to utils/analytics.js and forgotten
// here would silently leak to Staff, and the failure would be invisible because the value would
// simply be present rather than throwing.
const MONEY_FIELDS = [
  'revenueCents',
  'subtotalCents',
  'taxCents',
  'feeCents',
  'tipsCents',
  'averageTipCents',
  'tippedCount',
  'shopCutEarnedCents',
  'shopCutOutstandingCents',
  'shopCutAwaitingConfirmationCents',
  'depositsCollectedCents',
  'depositsAppliedCents',
  'depositsOutstandingCents',
];

const ARTIST_ROW_MONEY_FIELDS = [
  'revenueCents',
  'tipsCents',
  'shopCutEarnedCents',
  'shopCutOutstandingCents',
];

// Nulls every money field, top-level and per-artist. Null rather than 0 deliberately: 0 is a
// truthful answer to "how much did we make" and would render as $0.00 on a dashboard, which is a
// lie told confidently. Null means "not available to you", and the client renders nothing at all.
function stripMoney(analytics) {
  const stripped = { ...analytics };
  MONEY_FIELDS.forEach((field) => {
    stripped[field] = null;
  });
  stripped.artists = (analytics.artists || []).map((row) => {
    const artistRow = { ...row };
    ARTIST_ROW_MONEY_FIELDS.forEach((field) => {
      artistRow[field] = null;
    });
    return artistRow;
  });
  return stripped;
}

// A range picker is a text input's worth of trust. These bounds exist so a malformed or hostile
// range can't turn a dashboard load into an unbounded collection scan.
function assertValidRange(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start) || Number.isNaN(end)) {
    throw new UserInputError('Errors', { errors: { range: 'start and end must be valid dates' } });
  }
  if (start >= end) {
    throw new UserInputError('Errors', { errors: { range: 'start must be before end' } });
  }
  const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
  if (end - start > TEN_YEARS_MS) {
    throw new UserInputError('Errors', { errors: { range: 'range must be under ten years' } });
  }
}

module.exports = {
  Query: {
    /**
     * Shop-wide dashboard figures.
     *
     * Two separate gates, and they do different jobs:
     *
     *   Affiliation - Staff and above, at THIS shop. A role check alone can't express that; a
     *   shop admin of one shop has no business reading another shop's books, and that would
     *   otherwise be a single-argument data leak.
     *
     *   Role - money is Shop Admin only. Staff get every activity figure and null for anything
     *   denominated in currency. Every artist's earnings side by side is owner-level information;
     *   a front-desk staff member has no obvious need for it, and the difference between "can
     *   see the schedule is busy" and "can see what everyone earns" is worth encoding.
     *
     * Note this is enforced HERE, not by the dashboard choosing which cards to render. The client
     * hiding a card is presentation; this is the boundary.
     */
    getShopAnalytics: withAuth(
      async (_, { shopId, start, end }, context, info, user) => {
        assertValidRange(start, end);
        if (user.role > Constants.ROLES.SHOP_ADMIN) {
          const shopIds = await getShopIdsForUser(user.id);
          if (!shopIds.map(String).includes(String(shopId))) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        const analytics = await computeAnalytics({ shopId, start, end });
        return user.role <= Constants.ROLES.SHOP_ADMIN ? analytics : stripMoney(analytics);
      },
      Constants.ROLES.SHOP_STAFF,
    ),

    /**
     * The same figures for one artist, so an artist's own dashboard and the shop's view of them
     * agree by construction rather than by two implementations happening to match.
     *
     * Access mirrors getAppointmentsByArtist exactly: the artist themselves, shop-admin-or-better,
     * or Staff at a shop they work at. An artist always sees their own money - it's theirs.
     */
    getArtistAnalytics: withAuth(async (_, { userId, start, end }, context, info, user) => {
      assertValidRange(start, end);
      const isSelf = String(user.id) === String(userId);
      if (!isSelf && user.role > Constants.ROLES.SHOP_ADMIN) {
        const isSameShopStaff =
          user.role <= Constants.ROLES.SHOP_STAFF && (await sharesShopWith(user.id, userId));
        if (!isSameShopStaff) {
          throw new AuthenticationError('Action not allowed');
        }
      }
      const analytics = await computeAnalytics({ artistUserId: userId, start, end });
      // Staff looking at someone else's numbers get the same money blackout they get shop-wide.
      // An artist looking at their own always sees everything.
      if (!isSelf && user.role > Constants.ROLES.SHOP_ADMIN) {
        return stripMoney(analytics);
      }
      return analytics;
    }),
  },
};
