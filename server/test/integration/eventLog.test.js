// utils/event-log.js (recordEvent/diffFields) backs the audit trail behind 14 real call sites
// (mutations/deposits.js, mutations/appointments.js, mutations/clients.js, resolvers/boothRent.js,
// resolvers/expenses.js, and more - see that file's own header comment) and had ZERO test coverage
// anywhere in the suite, direct or resolver-level, despite being exactly the kind of "who changed
// this, and when" logic a real audit feature depends on getting right.
//
// describe/it/expect come from Vitest's `globals: true` config.
const EventLog = require('../../models/EventLog');
const { recordEvent, diffFields } = require('../../utils/event-log');
const { createArtistUser, createShopAdminUser } = require('../helpers/factories');

describe('diffFields', () => {
	it('reports nothing for fields whose values are identical', () => {
		const before = { amountCents: 5000, note: 'hi' };
		const after = { amountCents: 5000, note: 'hi' };

		expect(diffFields(before, after, ['amountCents', 'note'])).toEqual([]);
	});

	it('reports a change with the raw from/to values, unconverted', () => {
		const before = { amountCents: 5000 };
		const after = { amountCents: 7500 };

		expect(diffFields(before, after, ['amountCents'])).toEqual([
			{ field: 'amountCents', from: 5000, to: 7500 },
		]);
	});

	// The whole reason this compares via String() rather than === - see the function's own
	// header comment: an ObjectId instance compared against "the same id" via === is a different
	// object reference even though it is the same underlying value.
	it('does not report a change for two different ObjectId instances of the same id', () => {
		const id = '507f1f77bcf86cd799439011';
		const before = { artistUserId: id };
		const after = { artistUserId: { toString: () => id } }; // stands in for a Mongoose ObjectId instance

		expect(diffFields(before, after, ['artistUserId'])).toEqual([]);
	});

	it('does not report a change for two equal Date instances representing the same moment', () => {
		const before = { dueDate: new Date('2026-06-01T00:00:00.000Z') };
		const after = { dueDate: new Date('2026-06-01T00:00:00.000Z') }; // a different object, same instant

		expect(diffFields(before, after, ['dueDate'])).toEqual([]);
	});

	// "undefined and null are treated as the same 'not set' state" per the function's own header
	// comment - a partial-update mutation's own upstream handling already distinguishes "field not
	// sent" from "field sent as null" before this function ever sees it.
	it('treats undefined and null as the same unset state in either direction', () => {
		expect(diffFields({ note: undefined }, { note: null }, ['note'])).toEqual([]);
		expect(diffFields({ note: null }, { note: undefined }, ['note'])).toEqual([]);
		expect(diffFields({}, {}, ['note'])).toEqual([]);
	});

	it('only compares the fields listed, ignoring every other field present on the objects', () => {
		const before = { amountCents: 100, secret: 'a' };
		const after = { amountCents: 100, secret: 'b' };

		expect(diffFields(before, after, ['amountCents'])).toEqual([]);
	});

	it('treats a null or undefined before/after object as though every field were unset', () => {
		expect(diffFields(null, { amountCents: 100 }, ['amountCents'])).toEqual([
			{ field: 'amountCents', from: null, to: 100 },
		]);
		expect(diffFields({ amountCents: 100 }, null, ['amountCents'])).toEqual([
			{ field: 'amountCents', from: 100, to: null },
		]);
	});

	it('reports multiple changed fields in one call, each with its own from/to pair', () => {
		const before = { amountCents: 100, status: 'due' };
		const after = { amountCents: 200, status: 'confirmed' };

		expect(diffFields(before, after, ['amountCents', 'status'])).toEqual([
			{ field: 'amountCents', from: 100, to: 200 },
			{ field: 'status', from: 'due', to: 'confirmed' },
		]);
	});
});

describe('recordEvent', () => {
	it('writes a real EventLog row with the actor name resolved and denormalized at write time', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();

		const result = await recordEvent({
			entityType: 'Appointment',
			entityId: artist._id,
			action: 'update',
			actorUserId: shopAdmin._id,
			shopId: shop._id,
			summary: 'Rescheduled the appointment',
			changes: [{ field: 'appointmentDate', from: 'a', to: 'b' }],
		});

		expect(result).toEqual({ ok: true });
		const row = await EventLog.findOne({ entityId: artist._id });
		expect(row).not.toBeNull();
		expect(row.entityType).toBe('Appointment');
		expect(row.action).toBe('update');
		expect(String(row.actorUserId)).toBe(String(shopAdmin._id));
		expect(row.actorName).toBe(`${shopAdmin.firstName} ${shopAdmin.lastName}`.trim());
		expect(String(row.shopId)).toBe(String(shop._id));
		expect(row.summary).toBe('Rescheduled the appointment');
		expect(row.changes).toHaveLength(1);
	});

	it('refuses to write, without throwing, when actorUserId is missing', async () => {
		const result = await recordEvent({
			entityType: 'Client',
			entityId: '507f1f77bcf86cd799439011',
			action: 'update',
			actorUserId: undefined,
			summary: 'Should never be written',
		});

		expect(result).toEqual({ ok: false, error: 'missing actorUserId' });
		expect(await EventLog.countDocuments({})).toBe(0);
	});

	it('falls back to "Unknown user" when actorUserId does not resolve to a real User', async () => {
		const result = await recordEvent({
			entityType: 'Client',
			entityId: '507f1f77bcf86cd799439011',
			action: 'update',
			actorUserId: '507f1f77bcf86cd799439099', // a valid ObjectId, but nobody by that id
			summary: 'Orphaned actor',
		});

		expect(result).toEqual({ ok: true });
		const row = await EventLog.findOne({ entityId: '507f1f77bcf86cd799439011' });
		expect(row.actorName).toBe('Unknown user');
	});

	it('omits shopId entirely for an independent artist\'s own data, rather than storing it as null', async () => {
		const { user: artist } = await createArtistUser();

		await recordEvent({
			entityType: 'Client',
			entityId: artist._id,
			action: 'create',
			actorUserId: artist._id,
			summary: 'Created a new client',
		});

		const row = await EventLog.findOne({ entityId: artist._id });
		expect(row.shopId).toBeUndefined();
	});

	it('defaults changes to [] when none are given, for a create/delete with no field diff', async () => {
		const { user: artist } = await createArtistUser();

		await recordEvent({
			entityType: 'Client',
			entityId: artist._id,
			action: 'delete',
			actorUserId: artist._id,
			summary: 'Deleted the client',
		});

		const row = await EventLog.findOne({ entityId: artist._id });
		expect(row.changes).toEqual([]);
	});

	// "A failure here NEVER fails the action that caused it" per the function's own header comment
	// - an invalid `action` (outside the model's own enum) is the simplest real way to force
	// EventLog.create() itself to reject without reaching for a network/DB-level fault.
	it('reports failed rather than throwing when the EventLog write itself is rejected', async () => {
		const { user: artist } = await createArtistUser();

		const result = await recordEvent({
			entityType: 'Client',
			entityId: artist._id,
			action: 'archive', // not in EventLog's own action enum (create/update/delete)
			actorUserId: artist._id,
			summary: 'Should fail validation, not throw',
		});

		expect(result.ok).toBe(false);
		expect(typeof result.error).toBe('string');
		expect(await EventLog.countDocuments({ entityId: artist._id })).toBe(0);
	});
});
