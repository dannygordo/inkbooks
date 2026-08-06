const ArtistShopConnection = require('../models/ArtistShopConnection');

/**
 * Per-request batching for the lookups that field resolvers do once per row.
 *
 * `Artist.shop` and `Artist.shopId` resolve from the artist's active ArtistShopConnection (see
 * utils/artist-shop.js - having that fact in two places cost a shop its cut on every appointment
 * an affected artist booked). Correct, but it turned one query into one-per-artist: a roster of
 * twenty artists became twenty-one round trips, and `getArtists { shop { name } }` doubled that
 * again.
 *
 * This is deliberately NOT the `dataloader` package. The behaviour needed here is a few lines,
 * and adding a dependency I can't install or exercise in this environment is a worse trade than
 * writing it out. If loader use spreads beyond this, swap to the real thing - the call shape
 * (`.load(key)` returning a promise) is the same on purpose.
 *
 * Request-scoped, always. A loader that outlives a request is a cache, and a cache of "which shop
 * does this artist work at" would serve a stale answer the moment somebody moves shops - see
 * connectArtistToShop. Built fresh in index.js's `context` for every operation.
 */

/**
 * Collects every key requested in the current tick, runs one batch query, and hands each caller
 * back their own result.
 *
 * @param {function} batchFn - (keys[]) => Promise<Map<string, any>>
 */
function createLoader(batchFn) {
  // Keyed by String(key) - callers pass ObjectIds and strings interchangeably, and two references
  // to the same id must be one batch entry, not two.
  const cache = new Map();
  let pending = [];
  let scheduled = false;

  const flush = async () => {
    const batch = pending;
    pending = [];
    scheduled = false;
    try {
      const results = await batchFn(batch.map((entry) => entry.key));
      batch.forEach((entry) => entry.resolve(results.get(entry.key)));
    } catch (err) {
      // One failed batch fails every caller in it, rather than hanging them - a promise nobody
      // settles is a request that never returns.
      batch.forEach((entry) => entry.reject(err));
    }
  };

  return {
    load(rawKey) {
      if (rawKey === undefined || rawKey === null) {
        return Promise.resolve(undefined);
      }
      const key = String(rawKey);
      if (cache.has(key)) {
        return cache.get(key);
      }
      const promise = new Promise((resolve, reject) => {
        pending.push({ key, resolve, reject });
      });
      cache.set(key, promise);
      if (!scheduled) {
        scheduled = true;
        // process.nextTick, not setTimeout: it runs after the current synchronous work but before
        // I/O, which is exactly the window in which GraphQL kicks off every sibling field
        // resolver. A longer delay would still batch, but would add latency for nothing.
        process.nextTick(flush);
      }
      return promise;
    },
  };
}

/**
 * artistUserId -> the shopId of their active connection (or undefined when independent).
 *
 * `.sort({ updatedAt: -1 })` mirrors getActiveConnection: exactly one active connection per artist
 * is enforced on the write (see connectArtistToShop), and the sort only decides the answer for
 * data that predates that rule - deterministically rather than by natural order. Building the map
 * in ascending order and overwriting means the last write wins, which is the most recent.
 */
function createArtistShopIdLoader() {
  return createLoader(async (artistUserIds) => {
    const connections = await ArtistShopConnection.find({
      artistId: { $in: artistUserIds },
      status: 'active',
    })
      .select('artistId shopId')
      .sort({ updatedAt: 1 });

    const byArtist = new Map();
    connections.forEach((connection) => {
      byArtist.set(String(connection.artistId), connection.shopId);
    });
    return byArtist;
  });
}

/**
 * Unread counts for the caller, computed at most once per request.
 *
 * Not a batching loader like the one above - a memoiser. Conversation.unreadCount is a field
 * resolver, so rendering a list of a dozen threads calls it a dozen times, and each call
 * independently would be a separate count query against the message collection. The underlying
 * unreadSummaryForUser already answers for every conversation at once, so the right shape here is
 * to run it once and let each field read its own entry out of the result.
 *
 * Keyed by userId even though there's only ever one caller per request, so a future resolver that
 * asks about somebody else can't silently get the first user's answer back.
 */
function createUnreadLoader() {
  const { unreadSummaryForUser } = require('./conversation-reads');
  const { bookingInboxConversationIds } = require('./conversation-routing');
  const cache = new Map();

  // Resolved once per request. This was shared by two scoped summaries; the 'bookingInbox' one is
  // gone (the Booking Requests badge counts pending REQUESTS now - see utils/booking-inbox.js), so
  // today it has a single reader. Kept memoised anyway: it is the same lookup either way, and the
  // reason it exists is that this runs on a component mounted on every page.
  let routingPromise = null;
  function bookingInboxIds(userId) {
    if (!routingPromise) {
      routingPromise = bookingInboxConversationIds(userId);
    }
    return routingPromise;
  }

  return {
    /**
     * @param {string} userId
     * @param {'messages'|'all'} scope
     *
     * 'messages' excludes threads sitting in this viewer's Booking Requests inbox; 'all' counts
     * every conversation they are in.
     *
     * The scope is part of the CACHE KEY. It was previously keyed on userId alone, which was
     * correct when there was one answer; with more than one it would hand whichever scope asked
     * first to everyone after it, and the symptom would be one badge showing another badge's
     * count. Silent, plausible, and wrong - so this stays keyed even though there are two scopes
     * left rather than three.
     */
    async summaryFor(userId, scope = 'all') {
      const key = `${String(userId)}:${scope}`;
      if (!cache.has(key)) {
        cache.set(
          key,
          (async () => {
            if (scope === 'all') {
              return unreadSummaryForUser(userId);
            }
            const ids = await bookingInboxIds(userId);
            return unreadSummaryForUser(userId, { excluding: ids });
          })(),
        );
      }
      return cache.get(key);
    },
  };
}

// Fresh per request - see the note above on why this must never be shared.
function createLoaders() {
  return {
    artistShopId: createArtistShopIdLoader(),
    unread: createUnreadLoader(),
  };
}

module.exports = { createLoader, createLoaders };
