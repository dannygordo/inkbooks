const Client = require('../models/Client');
const { toObjectId } = require('./object-id');
const ClientFlag = require('../models/ClientFlag');
const ClientFlagType = require('../models/ClientFlagType');
const Project = require('../models/Project');

/**
 * Raising, resolving and counting client flags — in one place.
 *
 * ---------------------------------------------------------------------------------------------
 * EVERY WRITE GOES THROUGH HERE, and that is the whole design. Three things have to happen together
 * and none of them is obvious from the outside:
 *
 *   1. the type key is validated against the type table (it is a table, not an enum, so nothing
 *      else checks it — a typo'd key would otherwise write a flag nothing renders);
 *   2. a systemGenerated type refuses to be created by hand, and vice versa;
 *   3. the denormalised counter on Client is kept in step.
 *
 * That third one is the reason this file exists rather than the callers doing it. A counter that
 * drifts from the rows it counts is worse than no counter: an appointment list showing a no-show
 * badge for a client with no live no-show flag is a false accusation rendered next to their name.
 * ---------------------------------------------------------------------------------------------
 */

/**
 * Recomputes a client's unresolved flag counts FROM THE ROWS.
 *
 * Deliberately a recount, not an increment. An increment is one lost write away from being wrong
 * forever, and there is no way to notice - whereas a recount is self-healing: any drift, from a
 * crash mid-write or from a row touched outside this file, is corrected the next time anything
 * happens to that client. The cost is one grouped query per flag change, which is nothing against
 * how often flags change.
 *
 * Stored as a plain object keyed by type, so a list rendering a badge reads
 * `client.flagCounts.NO_SHOWED` with no join.
 */
async function recountClientFlags(clientId) {
  const rows = await ClientFlag.aggregate([
    // toObjectId matters: aggregate does NOT cast, unlike find. This is the standing trap in this
    // codebase and it fails as an empty result rather than an error.
    { $match: { clientId: toObjectId(clientId), resolvedAt: null } },
    { $group: { _id: '$typeKey', count: { $sum: 1 } } },
  ]);
  const flagCounts = {};
  rows.forEach((row) => {
    flagCounts[row._id] = row.count;
  });
  await Client.updateOne({ _id: clientId }, { $set: { flagCounts } });
  return flagCounts;
}

/** The type, or null. Looks for a shop's own type first, then the platform one. */
async function findFlagType(typeKey, shopId) {
  const key = String(typeKey || '').toUpperCase();
  if (shopId) {
    const shopType = await ClientFlagType.findOne({ key, shopId, active: true });
    if (shopType) {
      return shopType;
    }
  }
  return ClientFlagType.findOne({ key, shopId: null, active: true });
}

/**
 * Puts a flag on a client.
 *
 * @param {object}  input
 * @param {string}  input.clientId
 * @param {string}  input.typeKey
 * @param {string}  [input.appointmentId] - required for a system-generated flag; see below
 * @param {string}  [input.shopId]
 * @param {string}  [input.createdByUserId] - required for a manual flag
 * @param {string}  [input.note]
 * @param {boolean} [input.systemGenerated=false]
 *
 * Idempotent for system flags: raising NO_SHOWED twice for the same appointment returns the
 * existing live flag rather than writing a second. Marking a session no-show, saving something
 * else, and saving again is ordinary use, and it must not stack.
 */
async function raiseClientFlag({
  clientId,
  typeKey,
  appointmentId = null,
  shopId = null,
  createdByUserId = null,
  note = '',
  systemGenerated = false,
}) {
  if (!clientId) {
    throw new Error('raiseClientFlag needs a clientId');
  }
  const type = await findFlagType(typeKey, shopId);
  if (!type) {
    throw new Error(
      `Unknown client flag type "${typeKey}". Flag types live in the ClientFlagType table - ` +
        'add it there rather than passing a new string.',
    );
  }

  // The two directions of the same rule. A flag that claims to be automatic but was typed in by
  // hand misrepresents where the evidence came from, and these are records about a person's
  // conduct; a manual flag with no author is unattributable for the same reason a rate change with
  // no author is.
  if (type.systemGenerated && !systemGenerated) {
    throw new Error(`"${type.key}" is raised by the system and cannot be added by hand.`);
  }
  if (!type.systemGenerated && systemGenerated) {
    throw new Error(`"${type.key}" is a manual flag and cannot be raised automatically.`);
  }
  if (systemGenerated && !appointmentId) {
    throw new Error(
      `A system-generated ${type.key} flag needs the appointment it came from - a machine-made ` +
        'record with no evidence behind it is an assertion nobody can check.',
    );
  }
  if (!systemGenerated && !createdByUserId) {
    throw new Error('A manual client flag needs createdByUserId');
  }

  if (appointmentId) {
    const existing = await ClientFlag.findOne({
      appointmentId,
      typeKey: type.key,
      resolvedAt: null,
    });
    if (existing) {
      return existing;
    }
  }

  const flag = await new ClientFlag({
    clientId,
    typeKey: type.key,
    appointmentId,
    shopId,
    createdByUserId,
    systemGenerated,
    note,
  }).save();

  await recountClientFlags(clientId);
  return flag;
}

/**
 * Stops a flag applying, WITHOUT deleting it.
 *
 * Un-marking a no-show resolves the flag rather than removing the row: "we marked this and then
 * took it back" is a different fact from "this never happened", and only one of them is true
 * (DECISIONS.md C2).
 *
 * Returns the number of flags resolved, which is 0 when there was nothing live to resolve - a
 * normal outcome when a session's status changes for some other reason, not an error.
 */
async function resolveClientFlagsForAppointment({ appointmentId, typeKey, resolvedByUserId = null }) {
  if (!appointmentId) {
    return 0;
  }
  const filter = { appointmentId, resolvedAt: null };
  if (typeKey) {
    filter.typeKey = String(typeKey).toUpperCase();
  }
  const live = await ClientFlag.find(filter).select('clientId');
  if (live.length === 0) {
    return 0;
  }
  await ClientFlag.updateMany(filter, {
    $set: { resolvedAt: new Date(), resolvedByUserId },
  });

  // Recount every affected client, not just the first. One appointment has one client today, but
  // counting on that is how a counter silently stops matching its rows.
  const clientIds = [...new Set(live.map((flag) => String(flag.clientId)))];
  await Promise.all(clientIds.map((clientId) => recountClientFlags(clientId)));
  return live.length;
}

/**
 * Keeps the NO_SHOWED flag in step with an appointment's status.
 *
 * Called from the one place appointment status changes. Marking no-show raises the flag; moving off
 * no-show resolves it. Nothing else in the app raises this type, which is what makes it trustworthy
 * as an automatic record.
 *
 * Best-effort by contract: a booking must not fail because a flag could not be written. The outcome
 * is returned rather than swallowed, so a caller can report it - the same convention notifySafely
 * follows, and for the same reason.
 */
async function syncNoShowFlag({ appointment, previousStatus, actingUserId }) {
  const NO_SHOW = 'no_show';
  const wasNoShow = previousStatus === NO_SHOW;
  const isNoShow = appointment && appointment.appointmentStatus === NO_SHOW;
  if (wasNoShow === isNoShow) {
    return { ok: true, changed: false };
  }

  try {
    if (isNoShow) {
      // The client comes from the project the sitting belongs to. A consult with no project has no
      // client to flag through this path, which is correct rather than an omission - a no-showed
      // consult is flagged when its own client link exists.
      const project = appointment.projectId
        ? await Project.findById(appointment.projectId).select('clientId')
        : null;
      if (!project || !project.clientId) {
        return { ok: false, reason: 'no-client' };
      }
      await raiseClientFlag({
        clientId: project.clientId,
        typeKey: 'NO_SHOWED',
        appointmentId: appointment._id,
        shopId: appointment.shopId || null,
        systemGenerated: true,
      });
      return { ok: true, changed: true, raised: true };
    }

    const resolved = await resolveClientFlagsForAppointment({
      appointmentId: appointment._id,
      typeKey: 'NO_SHOWED',
      resolvedByUserId: actingUserId || null,
    });
    return { ok: true, changed: resolved > 0, resolved };
  } catch (err) {
    console.warn(`[client-flags] LOST a NO_SHOWED flag change: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  findFlagType,
  raiseClientFlag,
  recountClientFlags,
  resolveClientFlagsForAppointment,
  syncNoShowFlag,
};
