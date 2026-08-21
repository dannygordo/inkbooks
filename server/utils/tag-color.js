const User = require('../models/User');
const logger = require('./logger');
const { getMemberUserIdsForShop } = require('./shop-membership');

// Mirrors client/src/constants/app.js's APP_SETTINGS_CONSTANTS.TAG_COLORS palette - the server
// only needs the hex values (to pick/validate a color), not the display labels, so this is kept
// as a flat list rather than duplicating the {value, label} shape. Keep these two lists in sync
// if the palette ever changes - nothing enforces that automatically.
const TAG_COLORS = [
  '#c69818', '#861d15', '#122152', '#2ea2dc', '#8E24AA', '#e1591f', '#e2d355',
  '#4c4b40', '#73f0b6', '#90674a', '#bdc647', '#84b100', '#f49198', '#d9a6f5', '#c57b00',
];

// '#8E24AA' - "Royal Purple" in the client palette above. The agreed default for anyone not
// currently affiliated with a shop: there's nobody else to collide with, so no uniqueness
// computation is needed, just a real color instead of the old literal white default.
const DEFAULT_NO_SHOP_TAG_COLOR = '#8E24AA';

// Every value this codebase has, at one point or another, written as a non-choice rather than a
// deliberate pick: the original hardcoded default in client/src/pages/register/Register.jsx
// ('#fff'), or simply never set at all (undefined/null/''). Treated as "still needs a real
// default assigned" - a tagColor an artist or admin actually chose is left alone even if it later
// happens to collide with a shop-mate (see pickDefaultTagColor below), since this is about fixing
// the default, not overriding someone's actual choice.
const UNSET_TAG_COLORS = new Set([undefined, null, '', '#fff', '#ffffff', '#FFF', '#FFFFFF']);

function isUnsetTagColor(tagColor) {
  return UNSET_TAG_COLORS.has(tagColor);
}

// Picks a tagColor guaranteed not already in use by anyone else currently affiliated with
// shopId - same shop-membership resolution (Staff + Artist, legacy shopId field or an active
// ArtistShopConnection) getUserTagColors already uses, via getMemberUserIdsForShop, so "unique to
// the shop" means the same thing here that it means everywhere else in this codebase. Falls back
// to DEFAULT_NO_SHOP_TAG_COLOR when there's no shop to be unique within (an independent artist, or
// a Client - who has no shop concept at all). If every color in the palette is already taken (more
// people at one shop than colors - 15 today), reuses the first color rather than throwing; an
// actual collision at that point is an acceptable, rare degradation, not a crash.
async function pickDefaultTagColor(shopId, excludeUserId) {
  if (!shopId) {
    return DEFAULT_NO_SHOP_TAG_COLOR;
  }
  const memberIds = (await getMemberUserIdsForShop(shopId)).filter(
    (id) => String(id) !== String(excludeUserId),
  );
  if (memberIds.length === 0) {
    return TAG_COLORS[0];
  }
  const members = await User.find({ _id: { $in: memberIds } }).select('tagColor');
  const usedColors = new Set(
    members.map((u) => u.tagColor).filter((c) => !isUnsetTagColor(c)),
  );
  const available = TAG_COLORS.find((c) => !usedColors.has(c));
  return available || TAG_COLORS[0];
}

// Assigns and PERSISTS a real tagColor for a user who still doesn't have one, using the same
// shop-unique logic login()'s self-heal uses. Extracted here because the login hook alone turned
// out not to be enough in practice: a shop calendar renders every shop-mate's appointments (see
// getAppointmentsByShop), so one artist looking at the calendar can be shown colored labels for
// half a dozen OTHER artists - none of whom have necessarily logged in since the tagColor default
// was fixed. Their labels rendered white-on-white and read as invisible/blank, which is exactly
// what was reported. Healing only the person who happens to be logging in can't fix that; the
// color has to be resolvable for whoever is being *displayed*.
//
// Returns the user's existing color untouched when it's already real - so this is a no-op on
// every call after the first for any given user, and never overrides a deliberate choice.
//
// Called from the User.tagColor field resolver - see graphql/resolvers/index.js.
async function ensureTagColor(user) {
  if (!user) {
    return null;
  }
  if (!isUnsetTagColor(user.tagColor)) {
    return user.tagColor;
  }
  // Not every parent object reaching this is a Mongoose document. login() (resolvers/users.js)
  // returns a plain `{...user._doc, id, accessToken, ...}` literal, and a POJO has no .save() and
  // no `id` virtual - only `_id`. Calling .save() on one would throw and take down an otherwise
  // successful login, so both are handled explicitly rather than assumed.
  const userId = user.id || user._id;
  if (!userId) {
    return DEFAULT_NO_SHOP_TAG_COLOR;
  }
  // Required lazily rather than at module load: utils/shop-membership.js pulls in the Artist and
  // Staff models, and this module is itself required by resolvers those models' own files reach
  // back into. A top-level require here creates a cycle that resolves to an empty object
  // depending on which file Node loads first.
  const { getShopIdsForUser } = require('./shop-membership');
  const shopIds = await getShopIdsForUser(userId);
  const color = await pickDefaultTagColor(shopIds[0], userId);
  if (typeof user.save === 'function') {
    user.tagColor = color;
    try {
      await user.save();
    } catch (err) {
      // Swallowed deliberately: a read path (a field resolver) must not fail an otherwise valid
      // query because an opportunistic backfill write lost a race with a concurrent one. The
      // caller still gets a usable color back, and the next read simply tries again.
      logger.error({ userId, err }, '[tag-color] Could not persist backfilled tagColor');
    }
    return color;
  }
  // POJO parent - can't persist from here. Still returns a real color so nothing renders
  // colorless; the write happens the next time this user is loaded as a document, or when
  // scripts/backfill-tag-colors.js runs.
  const persisted = await User.findById(userId);
  if (persisted && isUnsetTagColor(persisted.tagColor)) {
    persisted.tagColor = color;
    try {
      await persisted.save();
    } catch (err) {
      logger.error({ userId, err }, '[tag-color] Could not persist backfilled tagColor');
    }
  }
  return persisted && !isUnsetTagColor(persisted.tagColor) ? persisted.tagColor : color;
}

module.exports = {
  TAG_COLORS,
  DEFAULT_NO_SHOP_TAG_COLOR,
  isUnsetTagColor,
  pickDefaultTagColor,
  ensureTagColor,
};
