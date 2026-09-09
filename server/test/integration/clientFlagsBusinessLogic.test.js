// Integration tests for utils/client-flags.js's own functions, called directly rather than
// through GraphQL. clientFlags.test.js's own header comment claims this business logic -
// "idempotency, counter recompute, systemGenerated enforcement" - is "already covered by whatever
// exercises utils/client-flags.js directly", but nothing does: there is no test/unit file for it
// (client-flags.js needs real Client/ClientFlag/ClientFlagType/Project documents, so it can't be a
// test/unit file at all - see test/unit's own pure-function-only convention), and grepping the
// whole suite for a direct require of utils/client-flags turns up nothing before this file. That
// comment describes intent, not reality - this file is what makes it true.
//
// Three functions had ZERO coverage anywhere, at any level, before this: resolveClientFlag,
// resolveClientFlagsForAppointment, and syncNoShowFlag - the automatic no-show flag that
// mutations/appointments.js's updateAppointment calls on every appointmentStatus change. A broken
// syncNoShowFlag would mean either a client never gets flagged for a genuine no-show, or a flag
// never clears when a mis-marked appointment gets corrected - both silent, since it's called
// best-effort and never fails the appointment save (see its own header comment).
const { toObjectId } = require('../../utils/object-id');
const {
	raiseClientFlag,
	recountClientFlags,
	resolveClientFlag,
	resolveClientFlagsForAppointment,
	syncNoShowFlag,
} = require('../../utils/client-flags');
const { createArtistUser, createClientUser, createProject, createAppointment } = require('../helpers/factories');
const ClientFlagType = require('../../models/ClientFlagType');
const ClientFlag = require('../../models/ClientFlag');
const Client = require('../../models/Client');

async function seedType(overrides = {}) {
	return new ClientFlagType({
		key: 'NO_SHOWED',
		label: 'No showed',
		description: 'Missed a scheduled sitting without notice.',
		systemGenerated: true,
		...overrides,
	}).save();
}

async function seedManualType(overrides = {}) {
	return new ClientFlagType({
		key: 'MOVED_APPOINTMENT',
		label: 'Moved appointment',
		description: 'Rescheduled a booked session.',
		systemGenerated: false,
		...overrides,
	}).save();
}

describe('raiseClientFlag', () => {
	it('throws for a typeKey with no row in ClientFlagType, rather than writing an unrenderable flag', async () => {
		const { client } = await createClientUser();

		await expect(
			raiseClientFlag({ clientId: client.id, typeKey: 'NOT_A_REAL_TYPE', createdByUserId: client.userId }),
		).rejects.toThrow(/Unknown client flag type/);
	});

	it('refuses a systemGenerated type raised by hand', async () => {
		await seedType();
		const { client } = await createClientUser();

		await expect(
			raiseClientFlag({ clientId: client.id, typeKey: 'NO_SHOWED', createdByUserId: client.userId }),
		).rejects.toThrow(/raised by the system and cannot be added by hand/);
	});

	it('refuses a manual type raised as systemGenerated', async () => {
		await seedManualType();
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const appointment = await createAppointment(artistUser.id, { projectId: project.id });

		await expect(
			raiseClientFlag({
				clientId: client.id,
				typeKey: 'MOVED_APPOINTMENT',
				systemGenerated: true,
				appointmentId: appointment.id,
			}),
		).rejects.toThrow(/is a manual flag and cannot be raised automatically/);
	});

	it('refuses a system-generated flag with no appointmentId - unattributed automatic evidence', async () => {
		await seedType();
		const { client } = await createClientUser();

		await expect(
			raiseClientFlag({ clientId: client.id, typeKey: 'NO_SHOWED', systemGenerated: true }),
		).rejects.toThrow(/needs the appointment it came from/);
	});

	it('refuses a manual flag with no createdByUserId - unattributable by the same logic', async () => {
		await seedManualType();
		const { client } = await createClientUser();

		await expect(raiseClientFlag({ clientId: client.id, typeKey: 'MOVED_APPOINTMENT' })).rejects.toThrow(
			/needs createdByUserId/,
		);
	});

	it('is idempotent for the same appointment+type: a second raise returns the existing live flag, not a new one', async () => {
		await seedType();
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const appointment = await createAppointment(artistUser.id, { projectId: project.id });

		const first = await raiseClientFlag({
			clientId: client.id,
			typeKey: 'NO_SHOWED',
			appointmentId: appointment.id,
			systemGenerated: true,
		});
		const second = await raiseClientFlag({
			clientId: client.id,
			typeKey: 'NO_SHOWED',
			appointmentId: appointment.id,
			systemGenerated: true,
		});

		expect(String(second._id)).toBe(String(first._id));
		expect(await ClientFlag.countDocuments({ appointmentId: appointment.id, typeKey: 'NO_SHOWED' })).toBe(1);
	});

	it('keeps Client.flagCounts in step with the live rows after raising', async () => {
		await seedManualType();
		const { client } = await createClientUser();

		await raiseClientFlag({ clientId: client.id, typeKey: 'MOVED_APPOINTMENT', createdByUserId: client.userId });
		await raiseClientFlag({ clientId: client.id, typeKey: 'MOVED_APPOINTMENT', createdByUserId: client.userId });

		const stored = await Client.findById(client.id);
		// Two calls with no appointmentId each write their own row (idempotency only applies when
		// there's an appointment to key on), so the counter should read 2.
		expect(stored.flagCounts.MOVED_APPOINTMENT).toBe(2);
	});
});

describe('recountClientFlags', () => {
	it('is self-healing: fixes a counter that has drifted from the actual rows', async () => {
		await seedManualType();
		const { client } = await createClientUser();
		await new ClientFlag({ clientId: client.id, typeKey: 'MOVED_APPOINTMENT', createdByUserId: client.userId }).save();
		// Simulate drift - a counter that disagrees with what's actually in the ClientFlag collection.
		await Client.updateOne({ _id: client.id }, { $set: { flagCounts: { MOVED_APPOINTMENT: 99 } } });

		const result = await recountClientFlags(client.id);

		expect(result.MOVED_APPOINTMENT).toBe(1);
		const stored = await Client.findById(client.id);
		expect(stored.flagCounts.MOVED_APPOINTMENT).toBe(1);
	});

	// The exact trap utils/object-id.js documents: aggregate's $match does not cast a string id to
	// ObjectId the way find()/findOne() do, so passing the raw string clientId (as every caller
	// here does - it comes off a Mongoose document as an ObjectId, but a resolver argument comes
	// off GraphQL as a plain string) would silently match nothing instead of erroring.
	it('counts correctly when clientId is passed as a plain string, not an ObjectId', async () => {
		await seedManualType();
		const { client } = await createClientUser();
		await new ClientFlag({ clientId: client.id, typeKey: 'MOVED_APPOINTMENT', createdByUserId: client.userId }).save();

		const result = await recountClientFlags(String(client.id));

		expect(result.MOVED_APPOINTMENT).toBe(1);
	});
});

describe('resolveClientFlagsForAppointment', () => {
	it('resolves every live flag matching the appointment and type, and recounts the client', async () => {
		await seedType();
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const appointment = await createAppointment(artistUser.id, { projectId: project.id });
		await raiseClientFlag({
			clientId: client.id,
			typeKey: 'NO_SHOWED',
			appointmentId: appointment.id,
			systemGenerated: true,
		});

		const resolvedCount = await resolveClientFlagsForAppointment({
			appointmentId: appointment.id,
			typeKey: 'NO_SHOWED',
		});

		expect(resolvedCount).toBe(1);
		const flag = await ClientFlag.findOne({ appointmentId: appointment.id });
		expect(flag.resolvedAt).not.toBeNull();
		const stored = await Client.findById(client.id);
		expect(stored.flagCounts.NO_SHOWED || 0).toBe(0);
	});

	// "0 is a normal outcome" per the function's own header comment - most status changes have no
	// flag to resolve at all, and that must not be treated as an error case.
	it('returns 0, not an error, when there is nothing live to resolve', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const appointment = await createAppointment(artistUser.id, { projectId: project.id });

		const resolvedCount = await resolveClientFlagsForAppointment({
			appointmentId: appointment.id,
			typeKey: 'NO_SHOWED',
		});

		expect(resolvedCount).toBe(0);
	});

	it('returns 0 for a missing appointmentId rather than resolving everything', async () => {
		expect(await resolveClientFlagsForAppointment({ appointmentId: null, typeKey: 'NO_SHOWED' })).toBe(0);
	});
});

describe('resolveClientFlag', () => {
	it('resolves a manual flag by its own id and recounts the client', async () => {
		await seedManualType();
		const { client } = await createClientUser();
		const flag = await raiseClientFlag({
			clientId: client.id,
			typeKey: 'MOVED_APPOINTMENT',
			createdByUserId: client.userId,
		});

		const resolved = await resolveClientFlag({ flagId: flag._id, resolvedByUserId: client.userId });

		expect(resolved.resolvedAt).not.toBeNull();
		expect(String(resolved.resolvedByUserId)).toBe(String(client.userId));
		const stored = await Client.findById(client.id);
		expect(stored.flagCounts.MOVED_APPOINTMENT || 0).toBe(0);
	});

	it('returns null for an id that does not exist, rather than throwing', async () => {
		expect(await resolveClientFlag({ flagId: toObjectId('507f1f77bcf86cd799439011') })).toBeNull();
	});

	it('returns null for a flag that was already resolved - resolving twice is a no-op, not an error', async () => {
		await seedManualType();
		const { client } = await createClientUser();
		const flag = await raiseClientFlag({
			clientId: client.id,
			typeKey: 'MOVED_APPOINTMENT',
			createdByUserId: client.userId,
		});
		await resolveClientFlag({ flagId: flag._id });

		expect(await resolveClientFlag({ flagId: flag._id })).toBeNull();
	});

	it('returns null for a missing flagId', async () => {
		expect(await resolveClientFlag({ flagId: null })).toBeNull();
	});
});

describe('syncNoShowFlag', () => {
	async function sessionWithClient() {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const appointment = await createAppointment(artistUser.id, {
			projectId: project.id,
			appointmentStatus: 'no_show',
		});
		return { artistUser, client, appointment };
	}

	it('raises NO_SHOWED when an appointment transitions INTO no_show', async () => {
		await seedType();
		const { client, appointment } = await sessionWithClient();

		const result = await syncNoShowFlag({ appointment, previousStatus: 'scheduled' });

		expect(result).toEqual({ ok: true, changed: true, raised: true });
		const flag = await ClientFlag.findOne({ appointmentId: appointment.id, typeKey: 'NO_SHOWED' });
		expect(flag).not.toBeNull();
		expect(flag.systemGenerated).toBe(true);
		expect(String(flag.clientId)).toBe(String(client.id));
	});

	it('resolves the NO_SHOWED flag when an appointment moves back OFF no_show', async () => {
		await seedType();
		const { appointment } = await sessionWithClient();
		await syncNoShowFlag({ appointment, previousStatus: 'scheduled' });
		appointment.appointmentStatus = 'completed';

		const result = await syncNoShowFlag({ appointment, previousStatus: 'no_show', actingUserId: appointment.userId });

		expect(result).toEqual({ ok: true, changed: true, resolved: 1 });
		const flag = await ClientFlag.findOne({ appointmentId: appointment.id, typeKey: 'NO_SHOWED' });
		expect(flag.resolvedAt).not.toBeNull();
	});

	it('is a no-op when the status change has nothing to do with no_show (both sides false)', async () => {
		await seedType();
		const { appointment } = await sessionWithClient();
		appointment.appointmentStatus = 'completed';

		const result = await syncNoShowFlag({ appointment, previousStatus: 'scheduled' });

		expect(result).toEqual({ ok: true, changed: false });
		expect(await ClientFlag.countDocuments({ appointmentId: appointment.id })).toBe(0);
	});

	it('is a no-op when the appointment was already no_show and stays no_show (re-saving unrelated fields)', async () => {
		await seedType();
		const { appointment } = await sessionWithClient();
		await syncNoShowFlag({ appointment, previousStatus: 'scheduled' });

		// Re-fires with previousStatus already 'no_show' - the same guard a caller re-saving an
		// unrelated field on an already-no_show appointment would hit.
		const result = await syncNoShowFlag({ appointment, previousStatus: 'no_show' });

		expect(result).toEqual({ ok: true, changed: false });
		expect(await ClientFlag.countDocuments({ appointmentId: appointment.id })).toBe(1);
	});

	// A consult with no project has no client to flag through this path - see the function's own
	// comment for why that's correct rather than an omission.
	it('reports ok:false, reason:no-client for a no_show appointment with no project behind it', async () => {
		const { user: artistUser } = await createArtistUser();
		const appointment = await createAppointment(artistUser.id, {
			projectId: null,
			appointmentType: 'consult',
			appointmentStatus: 'no_show',
		});

		const result = await syncNoShowFlag({ appointment, previousStatus: 'scheduled' });

		expect(result).toEqual({ ok: false, reason: 'no-client' });
	});

	// Best-effort by contract: the calling mutation must never fail because this couldn't write.
	it('never throws even when raiseClientFlag would (e.g. the NO_SHOWED type has not been seeded)', async () => {
		// Deliberately NOT seeding ClientFlagType here - findFlagType returns null, raiseClientFlag
		// throws "Unknown client flag type", and syncNoShowFlag's own try/catch must swallow it.
		const { appointment } = await sessionWithClient();

		const result = await syncNoShowFlag({ appointment, previousStatus: 'scheduled' });

		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/Unknown client flag type/);
	});
});
