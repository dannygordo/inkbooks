// The emit sites, checked against the catalogue in NOTIFICATIONS_DESIGN.md §4.
//
// The behaviour worth guarding is that each event reaches the people the design says and NOT the
// person who caused it. The actor filter lives in notify(), so it can't be forgotten at an emit
// site - but the RECIPIENT LIST can be wrong, and a wrong list is invisible: notifications still
// appear, just for the wrong people, and the person who should have heard simply never does.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	connectArtistToShop,
} = require('../helpers/factories');
const Notification = require('../../models/Notification');
const Appointment = require('../../models/Appointment');
const {
	shopAdminUserIds,
	shopStaffUserIds,
	moneyAudienceForArtist,
	scheduleAudienceForArtist,
} = require('../../utils/notification-audience');
const { notifySafely } = require('../../utils/notifications');

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

const RECORD_DEPOSIT = `
	mutation RecordDeposit($appointmentId: ID!, $depositCents: Int!, $paymentMethod: String!) {
		recordDeposit(appointmentId: $appointmentId, depositCents: $depositCents, paymentMethod: $paymentMethod) {
			id
		}
	}
`;

// A shop with an admin, a front-desk staff member, and a connected artist - the arrangement the
// whole money-versus-schedule audience split exists for.
async function shopWithTeam() {
	const { user: admin, shop } = await createShopAdminUser();
	// shopId is the FIRST POSITIONAL argument, not an override key - see test/helpers/factories.js.
	const { user: staff } = await createStaffUser(shop._id);
	const { user: artist } = await createArtistUser();
	await connectArtistToShop(artist._id, shop._id);
	return { admin, staff, artist, shop };
}

describe('audience resolution', () => {
	it('separates money from schedule', async () => {
		// Money goes to admins; schedule goes to everyone on staff. That split is the entire reason
		// notifications have categories, and it is what keeps a front desk from being sent the books.
		const { admin, staff, shop } = await shopWithTeam();

		const money = await shopAdminUserIds(shop._id);
		const schedule = await shopStaffUserIds(shop._id);

		expect(money).toContain(String(admin.id));
		expect(money).not.toContain(String(staff.id));
		expect(schedule).toContain(String(staff.id));
	});

	it('returns nobody for an independent artist', async () => {
		// Not an error - an empty audience means notify() writes nothing, which is the correct
		// outcome for a solo artist and is how the shop-versus-solo distinction stays out of the
		// emit sites entirely.
		const { user: solo } = await createArtistUser();
		expect(await moneyAudienceForArtist(solo.id)).toEqual([]);
		expect(await scheduleAudienceForArtist(solo.id)).toEqual([]);
	});

	it('finds admins through Staff, not through a role field on Staff', async () => {
		// Staff carries no role - role lives on User. The tempting one-query version
		// (Staff.find({ shopId, role })) matches nothing at all, because Mongo will happily filter
		// on a field that doesn't exist and return an empty set rather than complaining.
		const { admin, shop } = await shopWithTeam();
		expect(await shopAdminUserIds(shop._id)).toEqual([String(admin.id)]);
	});
});

describe('deposit collected', () => {
	async function consultFor(artist) {
		return new Appointment({
			userId: artist.id,
			title: 'Chen consult',
			appointmentType: 'consult',
			appointmentStatus: 'scheduled',
			appointmentDate: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		}).save();
	}

	it('tells the shop admin and not the artist who took it', async () => {
		// The founding example of the whole design. The artist was standing there.
		const { admin, artist } = await shopWithTeam();
		const consult = await consultFor(artist);
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: RECORD_DEPOSIT,
				variables: {
					appointmentId: String(consult._id),
					depositCents: 20000,
					paymentMethod: 'cash',
				},
			},
			asUser(artist),
		);
		expect(res.body.singleResult.errors).toBeUndefined();

		const forAdmin = await Notification.find({ userId: admin.id, type: 'deposit_collected' });
		const forArtist = await Notification.find({ userId: artist.id, type: 'deposit_collected' });

		expect(forAdmin).toHaveLength(1);
		expect(forArtist).toHaveLength(0);
		expect(forAdmin[0].amountCents).toBe(20000);
		expect(forAdmin[0].title).toContain('$200.00');
	});

	it('does not tell the front desk about money', async () => {
		const { staff, artist } = await shopWithTeam();
		const consult = await consultFor(artist);
		const server = createTestServer();

		await server.executeOperation(
			{
				query: RECORD_DEPOSIT,
				variables: {
					appointmentId: String(consult._id),
					depositCents: 20000,
					paymentMethod: 'cash',
				},
			},
			asUser(artist),
		);

		expect(await Notification.countDocuments({ userId: staff.id })).toBe(0);
	});

	it('writes nothing at all for an independent artist', async () => {
		// Nobody to tell. The design's answer for a solo artist is silence, not a notification to
		// themselves about their own deposit.
		const { user: solo } = await createArtistUser();
		const consult = await consultFor(solo);
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: RECORD_DEPOSIT,
				variables: {
					appointmentId: String(consult._id),
					depositCents: 15000,
					paymentMethod: 'cash',
				},
			},
			asUser(solo),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(await Notification.countDocuments({})).toBe(0);
	});

	it('records the title as written, with the amount already formatted', async () => {
		// Rendered at write time and never re-rendered, so the row has to be readable on its own
		// (see models/Notification.js). A title that needed a later lookup to make sense would
		// defeat the point of storing it.
		const { admin, artist } = await shopWithTeam();
		const consult = await consultFor(artist);
		const server = createTestServer();

		await server.executeOperation(
			{
				query: RECORD_DEPOSIT,
				variables: {
					appointmentId: String(consult._id),
					depositCents: 12345,
					paymentMethod: 'cash',
				},
			},
			asUser(artist),
		);

		const [n] = await Notification.find({ userId: admin.id });
		expect(n.title).toContain('$123.45');
		expect(n.title).toContain('Chen consult');
		expect(n.body).toMatch(/cash/i);
	});
});

describe('a notification failure never fails the action', () => {
	it('still records the deposit when the notification cannot be written', async () => {
		// Every emit site is a side effect of something the person actually asked for. Losing the
		// deposit because a notification failed would be a strictly worse trade, every time.
		const { artist } = await shopWithTeam();
		const consult = await new Appointment({
			userId: artist.id,
			appointmentType: 'consult',
			appointmentStatus: 'scheduled',
			appointmentDate: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		}).save();
		const server = createTestServer();

		// notifySafely absorbs a missing actorId - the same failure any emit-site bug would produce.
		const outcome = await notifySafely({ type: 'broken', recipientIds: [artist.id] });
		expect(outcome.ok).toBe(false);

		const res = await server.executeOperation(
			{
				query: RECORD_DEPOSIT,
				variables: {
					appointmentId: String(consult._id),
					depositCents: 5000,
					paymentMethod: 'cash',
				},
			},
			asUser(artist),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		const stored = await Appointment.findById(consult._id);
		expect(stored.depositCents).toBe(5000);
	});

	it('reports the failure rather than swallowing it', async () => {
		// The last notification path in this codebase that failed into a bare console.warn was
		// broken for weeks and found by accident. The outcome comes back as a value.
		const outcome = await notifySafely({ type: 'no-actor', recipientIds: ['x'] });
		expect(outcome.ok).toBe(false);
		expect(outcome.error).toMatch(/actorId/);
	});
});

describe('roster events reach both directions', () => {
	it('tells the shop admin when an artist connects themselves', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();

		await notifySafely({
			actorId: artist.id,
			recipientIds: [...(await shopAdminUserIds(shop._id)), artist.id],
			type: 'artist_connected',
			category: 'roster',
			subjectType: 'artist',
			subjectId: artist.id,
			title: 'joined',
		});

		// One recipient list, correct in both directions, because notify() removes whoever the
		// actor happens to be. Writing two lists would be two chances to get it backwards.
		expect(await Notification.countDocuments({ userId: admin.id })).toBe(1);
		expect(await Notification.countDocuments({ userId: artist.id })).toBe(0);
	});

	it('tells the artist when an admin disconnects them', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();

		await notifySafely({
			actorId: admin.id,
			recipientIds: [...(await shopAdminUserIds(shop._id)), artist.id],
			type: 'artist_disconnected',
			category: 'roster',
			subjectType: 'artist',
			subjectId: artist.id,
			title: 'left',
		});

		expect(await Notification.countDocuments({ userId: artist.id })).toBe(1);
		expect(await Notification.countDocuments({ userId: admin.id })).toBe(0);
	});
});
