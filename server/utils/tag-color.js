const User = require('../models/User');
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

module.exports = {
  TAG_COLORS,
  DEFAULT_NO_SHOP_TAG_COLOR,
  isUnsetTagColor,
  pickDefaultTagColor,
};
