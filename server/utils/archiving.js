const { Constants } = require('./constants');
const { UserInputError } = require('./errors');

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

/**
 * The filter for a list query that takes an `includeArchived` flag.
 *
 * Archived records have to stay REACHABLE or unarchiving is unusable - there'd be no way to find
 * the person you wanted to bring back. So the directories hide them by default and every one of
 * them can be asked to show them.
 */
function archiveFilter(includeArchived, filter = {}) {
  return includeArchived ? filter : excludeArchived(filter);
}

/**
 * Refuses an update that would archive or unarchive a record as a side effect.
 *
 * Archiving has to have exactly one door. Artist/Staff/Client all carry `status` on their update
 * input, so `updateArtist({ status: 4 })` could archive someone without the confirmation, without
 * the archive mutation's own checks, and without anything in the UI saying it happened - and the
 * reverse, an update that quietly brings an archived person back onto the roster.
 *
 * Today no edit form picks a status at all: they load a record and echo `status` back unchanged,
 * so the value round-trips and this never fires. That's exactly why it's worth writing down. A
 * field that nothing sets deliberately is one someone will start setting deliberately later,
 * having never read this file.
 *
 * Deliberately NOT done by stripping `status` from the input. ARTIST_STATUS also has INACTIVE and
 * BOOKS_CLOSED, which are ordinary editable values an artist settings screen should be able to
 * set. Silently dropping a field the caller sent is its own trap - this refuses loudly instead,
 * and only for the one transition that has a dedicated mutation.
 *
 * @param {object} existing - the stored document
 * @param {number|undefined} nextStatus - status from the update input; absent means "don't touch"
 * @param {string} archiveMutationName - named in the error, so the caller knows where to go
 */
function assertNoArchiveTransition(existing, nextStatus, archiveMutationName) {
  if (nextStatus === undefined || nextStatus === null) {
    return;
  }
  const wasArchived = isArchived(existing);
  const willBeArchived = nextStatus === ARCHIVED;
  if (wasArchived === willBeArchived) {
    return;
  }
  throw new UserInputError('Errors', {
    errors: {
      status: willBeArchived
        ? `Use ${archiveMutationName} to archive this record, not an update.`
        : `Use un${archiveMutationName} to restore this record, not an update.`,
    },
  });
}

module.exports = {
  ARCHIVED,
  notArchived,
  excludeArchived,
  archiveFilter,
  isArchived,
  assertNoArchiveTransition,
};
