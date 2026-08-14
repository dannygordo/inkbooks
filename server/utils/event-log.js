const EventLog = require('../models/EventLog');
const User = require('../models/User');

/**
 * Recording events, in one place - the same shape as utils/notifications.js's notify()/
 * notifySafely() pair, deliberately. See models/EventLog.js for what this does and doesn't cover.
 */

/**
 * Compares a tracked set of fields between a before- and after-state and returns only the ones
 * that actually changed.
 *
 * Values are compared via String() rather than ===, which matters for exactly two shapes that
 * show up constantly in this codebase: a Mongoose ObjectId compared against another instance of
 * "the same id" (=== is false; they are different object references pointing at the same bytes),
 * and a Date compared against another Date for the same instant. Neither is a real change and
 * === would wrongly report both as one. The values actually STORED in the returned changes are
 * left as whatever was passed in, unconverted - only the comparison uses the string form.
 *
 * `undefined` and `null` are treated as the same "not set" state, so a field going from unset to
 * explicitly-null (or the reverse, which several of these mutations' partial-update shapes can
 * produce) isn't reported as a change - see mutations/appointments.js's updateAppointment on why
 * "the caller didn't send this field" and "the caller sent null" are already treated differently
 * upstream of here; this only cares whether the RESULTING values differ.
 *
 * @param {object} before - the record's state before the write (a Mongoose doc or plain object)
 * @param {object} after  - the record's state after the write
 * @param {string[]} fields - which fields to compare; anything not listed is never diffed
 */
function diffFields(before, after, fields) {
  const changes = [];
  for (const field of fields) {
    const from = before == null ? undefined : before[field];
    const to = after == null ? undefined : after[field];
    const normalize = (v) => (v === undefined || v === null ? '' : String(v));
    if (normalize(from) !== normalize(to)) {
      changes.push({ field, from: from ?? null, to: to ?? null });
    }
  }
  return changes;
}

/**
 * Writes one event-log row. A failure here NEVER fails the action that caused it - the same
 * contract as notifySafely(), and for the same reason: every call site is a side effect of
 * something the caller actually asked for (recording a deposit, closing a session), and losing
 * that work because an audit row couldn't be written would be a strictly worse trade than the
 * missing audit row, every time. The failure is warned rather than swallowed, so a broken logging
 * path doesn't go unnoticed the way a bare console.warn-free catch would let it.
 *
 * @param {object}   event
 * @param {string}   event.entityType   - the Mongoose model name, e.g. 'Appointment'
 * @param {ObjectId} event.entityId
 * @param {string}   event.action       - 'create' | 'update' | 'delete'
 * @param {ObjectId} event.actorUserId  - who did it. Required - see notify()'s own comment on why
 *                                        this is never defaulted or guessed at a call site.
 * @param {ObjectId} [event.shopId]     - omit for an independent artist's own data
 * @param {string}   event.summary      - one human-readable line describing what happened
 * @param {Array}    [event.changes]    - from diffFields(), or [] for a create/delete where the
 *                                        summary already says everything worth saying
 */
async function recordEvent({ entityType, entityId, action, actorUserId, shopId, summary, changes = [] }) {
  if (!actorUserId) {
    // Loud in dev/logs rather than silently attributing an event to nobody - same reasoning as
    // notify()'s own actorId guard, just not re-thrown, since this function's whole contract is
    // "never fail the caller's real action."
    console.warn(`[event-log] recordEvent(${entityType}.${action}) called with no actorUserId - skipped.`);
    return { ok: false, error: 'missing actorUserId' };
  }
  try {
    const actor = await User.findById(actorUserId).select('firstName lastName');
    const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'Unknown user';
    await EventLog.create({
      entityType,
      entityId,
      action,
      actorUserId,
      actorName,
      shopId: shopId || undefined,
      summary,
      changes,
    });
    return { ok: true };
  } catch (err) {
    console.warn(
      `[event-log] LOST a ${action} event for ${entityType} ${entityId}: ${err.message}. ` +
        'The action itself succeeded; only the audit record failed.',
    );
    return { ok: false, error: err.message };
  }
}

module.exports = { recordEvent, diffFields };
