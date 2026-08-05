const Staff = require('../models/Staff');
const User = require('../models/User');
const { Constants } = require('./constants');
const { getActiveShopIdForArtist } = require('./artist-shop');

/**
 * Who hears about an event.
 *
 * One place, for the same reason `notify()` is one place: every emit site needs the answer, and
 * twenty call sites each working out "the shop admins at this artist's shop" is twenty chances to
 * get shop scoping wrong. Shop scoping is the thing this codebase has already had to fix once,
 * across roughly fifty `role <= SHOP_ADMIN` checks that each meant "skip the shop check" and
 * together leaked every shop's revenue to every shop admin (see utils/shop-membership.js).
 *
 * Everything here resolves membership through real database relationships - Staff rows and
 * ArtistShopConnection - never by a role number alone. Role answers "how much do they see"; it has
 * never answered "which shop", and it cannot.
 */

/**
 * Shop admins at a shop.
 *
 * Staff carries no role - role lives on User - so this is a two-step lookup rather than one query.
 * Worth stating because the tempting single query (`Staff.find({ shopId, role: ... })`) silently
 * matches nothing, since the field doesn't exist and Mongo is happy to filter on a field that
 * isn't there.
 */
async function shopAdminUserIds(shopId) {
  if (!shopId) return [];
  const staffRows = await Staff.find({ shopId }).select('userId');
  if (staffRows.length === 0) return [];
  const admins = await User.find({
    _id: { $in: staffRows.map((s) => s.userId) },
    role: { $lte: Constants.ROLES.SHOP_ADMIN },
  }).select('_id');
  return admins.map((u) => String(u._id));
}

/**
 * Everyone on a shop's staff, admin or not.
 *
 * The audience for schedule events. A front desk manages the calendar, so a cancellation is their
 * business in a way a deposit is not - which is exactly why money and schedule are separate
 * categories with separate defaults (NOTIFICATIONS_DESIGN.md §7).
 */
async function shopStaffUserIds(shopId) {
  if (!shopId) return [];
  const staffRows = await Staff.find({ shopId }).select('userId');
  return staffRows.map((s) => String(s.userId));
}

/**
 * The money audience for something an artist did.
 *
 * Returns the shop admins at the artist's active shop, and nobody else. An independent artist has
 * no shop, so this is legitimately empty - and an empty audience means `notify()` writes nothing,
 * which is the correct outcome rather than an error. That is the whole shop-versus-solo
 * distinction, falling out of the data rather than out of a branch somebody has to remember.
 */
async function moneyAudienceForArtist(artistUserId) {
  const shopId = await getActiveShopIdForArtist(artistUserId);
  if (!shopId) return [];
  return shopAdminUserIds(shopId);
}

/**
 * The schedule audience for something an artist did: their shop's staff and admins.
 */
async function scheduleAudienceForArtist(artistUserId) {
  const shopId = await getActiveShopIdForArtist(artistUserId);
  if (!shopId) return [];
  return shopStaffUserIds(shopId);
}

module.exports = {
  shopAdminUserIds,
  shopStaffUserIds,
  moneyAudienceForArtist,
  scheduleAudienceForArtist,
};
