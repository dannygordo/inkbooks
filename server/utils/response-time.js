const ResponseTimeSettings = require('../models/ResponseTimeSettings');
const ArtistShopConnection = require('../models/ArtistShopConnection');
const { getActiveShopIdForArtist } = require('./artist-shop');

const {
  DEFAULT_INITIAL_THRESHOLD_MINUTES,
  DEFAULT_REPEAT_INTERVAL_MINUTES,
} = ResponseTimeSettings;

/**
 * The precedence rule itself - Decision #2 (AskUserQuestion, locked before Feature 3's plan was
 * written): a shop admin sets a POLICY FLOOR an artist can tighten but never loosen. Concretely,
 * the shop's own row - if one exists - is a CEILING on both of the artist's numbers:
 * `min(artistValue, shopValue)`, never a starting point the artist can raise past.
 *
 * This is a genuinely different shape from every other owner-precedence resolver in this codebase
 * (resolveShopCutPercentAt, resolveAutoResponseForTrigger in utils/auto-responses.js) - those are
 * "one wins outright, the other doesn't apply at all". This is "both apply, and the lower number
 * wins" - worth its own function rather than reusing either of those, and worth a dedicated unit
 * test for the clamp direction specifically.
 *
 * No shop, or a shop with no row of its own: the artist's own value if they have one, else the
 * built-in default - exactly resolveAutoResponseForTrigger's "owner's own setting, or the
 * default" shape, just without a shop in the picture at all.
 */
function clamp(artistRow, shopRow) {
  if (shopRow) {
    const ceiling = {
      initialThresholdMinutes: shopRow.initialThresholdMinutes,
      repeatIntervalMinutes: shopRow.repeatIntervalMinutes,
    };
    return {
      initialThresholdMinutes: artistRow
        ? Math.min(artistRow.initialThresholdMinutes, ceiling.initialThresholdMinutes)
        : ceiling.initialThresholdMinutes,
      repeatIntervalMinutes: artistRow
        ? Math.min(artistRow.repeatIntervalMinutes, ceiling.repeatIntervalMinutes)
        : ceiling.repeatIntervalMinutes,
      ceiling,
    };
  }
  return {
    initialThresholdMinutes: artistRow
      ? artistRow.initialThresholdMinutes
      : DEFAULT_INITIAL_THRESHOLD_MINUTES,
    repeatIntervalMinutes: artistRow
      ? artistRow.repeatIntervalMinutes
      : DEFAULT_REPEAT_INTERVAL_MINUTES,
    ceiling: null,
  };
}

/**
 * The batch form - one artist at a time is the wrong shape for utils/attention.js (answers
 * "everything wanting THIS user's attention" for a shop admin's whole connected roster in one
 * call) and for utils/notification-jobs.js's sendMessageNudges (every artist in the system, every
 * hour). Three queries total no matter how many artists are asked about, not three per artist.
 *
 * Returns a Map keyed by artistUserId (string) -> { initialThresholdMinutes, repeatIntervalMinutes,
 * ceiling }. An artist with no entry requested gets no entry back; callers fall back to the plain
 * defaults themselves (matching every other batch condition query in utils/attention.js, which
 * take an empty result as "nothing to report" rather than treating it as an error).
 */
async function resolveThresholdsForArtists(artistUserIds) {
  const result = new Map();
  if (!artistUserIds || artistUserIds.length === 0) {
    return result;
  }
  const ids = Array.from(new Set(artistUserIds.map(String)));

  const [artistRows, connections] = await Promise.all([
    ResponseTimeSettings.find({ artistUserId: { $in: ids } }),
    ArtistShopConnection.find({ artistId: { $in: ids }, status: 'active' }).select(
      'artistId shopId',
    ),
  ]);
  const artistRowByArtist = new Map(artistRows.map((row) => [String(row.artistUserId), row]));
  const shopIdByArtist = new Map(connections.map((c) => [String(c.artistId), String(c.shopId)]));
  const shopIds = Array.from(new Set(Array.from(shopIdByArtist.values())));
  const shopRows = shopIds.length
    ? await ResponseTimeSettings.find({ shopId: { $in: shopIds } })
    : [];
  const shopRowByShop = new Map(shopRows.map((row) => [String(row.shopId), row]));

  for (const artistUserId of ids) {
    const artistRow = artistRowByArtist.get(artistUserId) || null;
    const shopId = shopIdByArtist.get(artistUserId) || null;
    const shopRow = shopId ? shopRowByShop.get(shopId) || null : null;
    result.set(artistUserId, clamp(artistRow, shopRow));
  }
  return result;
}

/**
 * One artist. A thin wrapper over the batch form above (see its own comment for why that's the
 * real implementation) - used by the GraphQL resolver's shopCeiling field, where only one
 * artist's answer is ever needed at a time.
 */
async function resolveResponseTimeThresholds(artistUserId) {
  if (!artistUserId) {
    return {
      initialThresholdMinutes: DEFAULT_INITIAL_THRESHOLD_MINUTES,
      repeatIntervalMinutes: DEFAULT_REPEAT_INTERVAL_MINUTES,
      ceiling: null,
    };
  }
  const map = await resolveThresholdsForArtists([artistUserId]);
  return (
    map.get(String(artistUserId)) || {
      initialThresholdMinutes: DEFAULT_INITIAL_THRESHOLD_MINUTES,
      repeatIntervalMinutes: DEFAULT_REPEAT_INTERVAL_MINUTES,
      ceiling: null,
    }
  );
}

module.exports = {
  resolveThresholdsForArtists,
  resolveResponseTimeThresholds,
  getActiveShopIdForArtist,
  DEFAULT_INITIAL_THRESHOLD_MINUTES,
  DEFAULT_REPEAT_INTERVAL_MINUTES,
};
