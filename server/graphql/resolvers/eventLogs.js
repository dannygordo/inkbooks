const EventLog = require('../../models/EventLog');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { assertAdminAuthority, getShopIdsForUser } = require('../../utils/shop-membership');
const { paginate } = require('../../utils/pagination');

/**
 * Reading the audit trail.
 *
 * No flat withAuth minRole - assertAdminAuthority is the same "shop admin at a shop, OR the sole
 * authority over your own independent practice" rule mutations/clients.js's archiveClient etc.
 * already use (see utils/shop-membership.js's own comment on why the floor has to move inside the
 * resolver for that second case to work at all). A flat SHOP_ADMIN floor here would lock every
 * independent artist out of their own history, which defeats the point for exactly the users who
 * have nobody else to check it for them.
 *
 * Scoping beyond "may this caller in at all" is NOT the filter argument - it's enforced here,
 * because a caller's own shopId filter is a request, not a grant:
 *   - True platform Admin: unrestricted, filter honored as given.
 *   - Shop admin: always scoped to their own shop(s), even if they pass a different shopId - the
 *     same "the caller's filter never overrides an ownership check" rule assertCanAccessShop
 *     enforces everywhere else a shop's own data is read.
 *   - Independent artist (no shop): scoped to events they themselves caused. There's no shop-wide
 *     view to grant - an independent artist IS the whole practice, so "their own actions" already
 *     covers everything worth seeing.
 */
module.exports = {
  Query: {
    getEventLogs: withAuth(async (_, { filter, page }, context, info, user) => {
      await assertAdminAuthority(user);

      const query = {};
      const isTrueAdmin = user.role <= Constants.ROLES.ADMIN;
      if (isTrueAdmin) {
        if (filter && filter.shopId) {
          query.shopId = filter.shopId;
        }
        if (filter && filter.actorUserId) {
          query.actorUserId = filter.actorUserId;
        }
      } else {
        const shopIds = await getShopIdsForUser(user.id);
        if (shopIds.length > 0) {
          // A shop admin scoped to more than one shop (rare, but not disallowed elsewhere) may
          // still narrow to one of THEIR OWN shops via the filter - just never to a shop they
          // aren't on.
          const requested = filter && filter.shopId ? String(filter.shopId) : null;
          query.shopId =
            requested && shopIds.map(String).includes(requested) ? requested : { $in: shopIds };
        } else {
          query.actorUserId = user.id;
        }
      }

      if (filter && filter.entityType) {
        query.entityType = filter.entityType;
      }
      if (filter && (filter.from || filter.to)) {
        query.createdAt = {};
        if (filter.from) {
          query.createdAt.$gte = new Date(filter.from);
        }
        if (filter.to) {
          query.createdAt.$lte = new Date(filter.to);
        }
      }

      return paginate(EventLog, query, { sort: { createdAt: -1 }, page });
    }),
  },
};
