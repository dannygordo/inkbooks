const { UserInputError } = require('./errors');

/**
 * Offset pagination, in one place.
 *
 * Offset rather than cursors, deliberately. Cursors suit feeds: you only ever go forwards, items
 * shift under you, and nobody asks "how many are there". Every list in this app is a directory -
 * an alphabetical client list, an artist's session history - where people want a total, want to
 * jump to a page, and where the sort is stable enough that offset drift is a non-event. Cursors
 * would cost more and deliver none of the three things these screens actually need.
 *
 * The other half of why this exists: before it, no list query had any bound at all.
 * getAppointmentsByShop returned every appointment a shop had ever had so the browser could filter
 * down to the thirty days on screen, and the artist dashboard downloaded an artist's entire career
 * to render two lists of five. Those aren't slow-someday problems - they grow by one row per
 * session, forever.
 */

// A page nobody asked to size. Big enough that no current screen notices, small enough that a
// forgotten `page` argument can't ship the whole collection.
const DEFAULT_LIMIT = 50;

// The ceiling a caller can ask for. Exists so `limit: 100000` is a bounded request rather than an
// accidental table scan - a client can always page, and a client that wants everything at once is
// usually a client that hasn't thought about how big "everything" gets.
const MAX_LIMIT = 200;

/**
 * Normalises a PageInput into { limit, offset }, refusing nonsense loudly.
 *
 * Refuses rather than silently clamping a negative or absurd value: a request for `limit: -5`
 * means the caller computed something wrong, and quietly returning 50 rows hides the bug at the
 * exact moment it would be cheapest to notice. An OVER-large limit is clamped rather than refused,
 * because "give me everything" is a reasonable thing to mean and a bounded answer is a reasonable
 * thing to give back - `pageInfo.hasMore` then says the rest exists.
 */
function normalizePage(page) {
  const requestedLimit = page && page.limit !== undefined && page.limit !== null ? page.limit : DEFAULT_LIMIT;
  const requestedOffset = page && page.offset !== undefined && page.offset !== null ? page.offset : 0;

  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new UserInputError('Errors', {
      errors: { limit: 'limit must be a positive whole number.' },
    });
  }
  if (!Number.isInteger(requestedOffset) || requestedOffset < 0) {
    throw new UserInputError('Errors', {
      errors: { offset: 'offset must be zero or a positive whole number.' },
    });
  }

  return { limit: Math.min(requestedLimit, MAX_LIMIT), offset: requestedOffset };
}

/**
 * Runs a filter as one page plus a count, and returns the shape every *Page type in the schema
 * shares.
 *
 * countDocuments runs alongside the find rather than after it - they're independent, and a
 * directory that needs a total shouldn't pay two round trips to get one.
 *
 * @param {import('mongoose').Model} model
 * @param {object} filter - a plain Mongo filter
 * @param {object} options
 * @param {object} [options.sort]
 * @param {object} [options.page] - raw PageInput from the caller
 * @param {string} [options.select]
 */
async function paginate(model, filter, { sort, page, select } = {}) {
  const { limit, offset } = normalizePage(page);

  let query = model.find(filter).sort(sort).skip(offset).limit(limit);
  if (select) {
    query = query.select(select);
  }

  const [items, totalCount] = await Promise.all([query, model.countDocuments(filter)]);

  return {
    items,
    pageInfo: {
      totalCount,
      // Computed from the count rather than by asking for one extra row: the count is already
      // being fetched for the total, so this is free, and "items.length === limit" would claim
      // there's more on an exactly-full final page.
      hasMore: offset + items.length < totalCount,
      limit,
      offset,
    },
  };
}

/**
 * The same shape for a list that's already in memory.
 *
 * For the handful of places where the rows can't be produced by one Mongo filter - a set built by
 * joining across collections, say - so those still return a Page rather than inventing a second
 * response shape for the client to special-case.
 */
function paginateArray(allItems, page) {
  const { limit, offset } = normalizePage(page);
  const items = allItems.slice(offset, offset + limit);
  return {
    items,
    pageInfo: {
      totalCount: allItems.length,
      hasMore: offset + items.length < allItems.length,
      limit,
      offset,
    },
  };
}

module.exports = { normalizePage, paginate, paginateArray, DEFAULT_LIMIT, MAX_LIMIT };
