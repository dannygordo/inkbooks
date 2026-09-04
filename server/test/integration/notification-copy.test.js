// notification-copy.js tests. actorName() is used across a wide set of money/business mutations
// (deposits, bookingRequests, shopCutPayments, boothRentPayments, artistShopConnections) to build
// the person's name into stored notification text - and per its own header comment, that text is
// rendered ONCE, at write time, and frozen into the row forever (models/Notification.js). A test
// grepping for its own name in a comment ("Someone") turned up nothing that actually calls it -
// this file is what closes that gap.
//
// THE rule this function exists to enforce, from its own comment: never throw, never return
// undefined. `${undefined} collected a deposit` would render the literal word "undefined" into a
// notification with no way to fix it after the fact, since the row is never re-rendered.
const { actorName } = require('../../utils/notification-copy');
const { createUser } = require('../helpers/factories');
const { toObjectId } = require('../../utils/object-id');

describe('actorName', () => {
	it("returns the person's full name for a real user", async () => {
		const user = await createUser({ firstName: 'Jordan', lastName: 'Ink' });

		expect(await actorName(user.id)).toBe('Jordan Ink');
	});

	it('trims a missing last name rather than leaving a trailing space', async () => {
		const user = await createUser({ firstName: 'Jordan', lastName: '' });

		expect(await actorName(user.id)).toBe('Jordan');
	});

	// THE failure mode this function exists to prevent: a falsy userId must never reach a template
	// literal as `undefined` - a neutral fallback instead.
	it("returns 'Someone' for a missing/falsy userId, never undefined", async () => {
		expect(await actorName(null)).toBe('Someone');
		expect(await actorName(undefined)).toBe('Someone');
		expect(await actorName('')).toBe('Someone');
	});

	it("returns 'Someone' for a userId that does not resolve to any user", async () => {
		expect(await actorName(toObjectId('507f1f77bcf86cd799439011'))).toBe('Someone');
	});

	// Both names present but empty/whitespace-only is the one case where the joined name is
	// itself falsy - must still fall back rather than storing a blank actor.
	it("returns 'Someone' when both names are blank, rather than storing an empty string", async () => {
		const user = await createUser({ firstName: '', lastName: '' });

		expect(await actorName(user.id)).toBe('Someone');
	});

	// The function's own header comment is explicit that a lookup failure must not take down the
	// mutation that was only trying to record a side effect - a malformed id is the cheapest real
	// way to force User.findById to throw rather than just return null.
	it('never throws even when the lookup itself fails', async () => {
		await expect(actorName('not-a-valid-object-id')).resolves.toBe('Someone');
	});
});
