const { Constants } = require('./constants');

/**
 * Archiving: what "remove this person" means now that the delete mutations are gone.
 *
 * Deleting an Artist, Staff or Client row destroyed the records around it. Project.client is
 * nullable, so a deleted Client left every project silently pointing at nothing; the User row
 * survived its profile, producing a login with a role and no profile; and appointments kept their
 * totals, shop cuts and Square invoice ids with nobody attached to them. None of that announced
 * itself. Archiving is the honest version: the person stops appearing where you'd pick someone,
 * and everything they did stays exactly as it was.
 *
 * The one rule worth stating out loud, because it's the easy one to get backwards:
 *
 *   ARCHIVING NEVER TOUCHES HISTORY.
 *
 * Archived people's completed appointments still count toward shop and artist revenue, still
 * appear on the calendar, and still carry their tag colour. Revenue that changes when you archive
 * a departed artist is worse than useless - last quarter's numbers would quietly stop matching
 * what the shop actually took. utils/analytics.js therefore does not filter on status at all, and
 * that omission is deliberate: see the test in test/integration/archiving.test.js that fails if
 * anyone adds one.
 *
 * What archiving DOES affect is every "who can I pick?" surface - the artist, staff and client
 * directories - which is the whole point of it.
 */

// One number across all three collections so "4 means archived" is a single fact.
const ARCHIVED = Constants.ARTIST_STATUS.ARCHIVED;

/**
 * Mongo filter fragment for "not archived".
 *
 * `$ne` rather than an explicit list of active values, because status is absent on every row that
 * predates this field (Client had no status at all, Staff's was an unconstrained number) and
 * `{ status: { $in: [ACTIVE, ...] } }` would hide all of them. Unset reads as active, which is the
 * only safe default when the alternative is a directory that renders empty.
 */
const notArchived = { status: { $ne: ARCHIVED } };

/**
 * Merges the not-archived clause into an existing filter without clobbering an existing `status`
 * condition, which a caller could plausibly have (e.g. "show me the artists with books closed").
 */
function excludeArchived(filter = {}) {
  if (filter.status === undefined) {
    return { ...filter, ...notArchived };
  }
  return { $and: [filter, notArchived] };
}

function isArchived(doc) {
  return Boolean(doc) && doc.status === ARCHIVED;
}

module.exports = { ARCHIVED, notArchived, excludeArchived, isArchived };
