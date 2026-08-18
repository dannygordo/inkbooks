// Integration tests for Appointment mutations, focused on the shopId tenancy/immutability logic
// added in the Phase 2 "Fix Appointment shopId authorization + immutability gap" fix (see
// mutations/appointments.js's assertHasShopConnection and updateAppointment's shopId-change
// guard). This is real business logic, not boilerplate CRUD, so it gets the most thorough
// coverage of the resources in this file.
// describe/it/expect/vi/etc. come from Vitest's `globals: true` config (see vitest.config.js) -
// no `require('vitest')` here. Vitest's own package is ESM-only and throws if you try to
// `require()` it directly; globals mode exists precisely so a CommonJS project like this one
// doesn't have to fight that (test/setup.js already relies on the same mechanism for
// beforeAll/afterEach/afterAll).
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createUser,
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	createClientUser,
	connectArtistToShop,
	createAppointment,
} = require('../helpers/factories');
const { Constants } = require('../../utils/constants');
const Appointment = require('../../models/Appointment');

const GET_APPOINTMENTS_BY_ARTIST = `
	query GetAppointmentsByArtist($userId: ID!) {
		getAppointmentsByArtist(userId: $userId) { items {
			id
		} }
	}
`;

const GET_APPOINTMENTS_BY_SHOP = `
	query GetAppointmentsByShop($shopId: ID!) {
		getAppointmentsByShop(shopId: $shopId) { items {
			id
		} }
	}
`;

const GET_APPOINTMENT = `
	query GetAppointment($appointmentId: ID!) {
		getAppointment(appointmentId: $appointmentId) {
			id
		}
	}
`;

const CREATE_APPOINTMENT = `
	mutation CreateAppointment($appointmentInput: AppointmentInput) {
		createAppointment(appointmentInput: $appointmentInput) {
			id
			shopId
			appointmentType
		}
	}
`;

const UPDATE_APPOINTMENT = `
	mutation UpdateAppointment($appointmentInput: AppointmentInput) {
		updateAppointment(appointmentInput: $appointmentInput) {
			id
			shopId
			title
		}
	}
`;

function baseAppointmentInput(overrides = {}) {
	const now = new Date().toISOString();
	return {
		appointmentDate: now,
		appointmentType: 'session',
		appointmentStatus: 'scheduled',
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

describe('createAppointment: shopId tenancy', () => {
	it('allows an independent artist to create an appointment with no shopId at all', async () => {
		const { user } = await createArtistUser();
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_APPOINTMENT, variables: { appointmentInput: baseAppointmentInput({ userId: user.id }) } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createAppointment.shopId).toBeNull();
	});

	it('rejects attributing an appointment to a shop the artist has no connection with', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_APPOINTMENT,
				variables: { appointmentInput: baseAppointmentInput({ userId: user.id, shopId: shop.id }) },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.createAppointment).toBeNull();
		expect(errors[0].message).toMatch(/No connection exists between you and this shop/);
	});

	it('allows attributing an appointment to a shop the artist IS connected to', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_APPOINTMENT,
				variables: { appointmentInput: baseAppointmentInput({ userId: user.id, shopId: shop.id }) },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createAppointment.shopId).toBe(shop.id);
	});

	// The connection's status doesn't have to be 'active' - assertHasShopConnection only checks
	// existence, since a disconnected connection was still real at some point (see the resolver's
	// own comment on "current or historical").
	it('still allows it even if the connection has since been disconnected', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id, { status: 'disconnected', disconnectedAt: new Date() });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_APPOINTMENT,
				variables: { appointmentInput: baseAppointmentInput({ userId: user.id, shopId: shop.id }) },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createAppointment.shopId).toBe(shop.id);
	});
});

describe('updateAppointment: shopId immutability + first-time attribution', () => {
	it('rejects changing shopId once an appointment already has one', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const { shop: otherShop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await connectArtistToShop(user.id, otherShop.id);
		const appointment = await createAppointment(user.id, { shopId: shop.id });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_APPOINTMENT,
				variables: {
					appointmentInput: baseAppointmentInput({
						id: appointment.id,
						userId: user.id,
						shopId: otherShop.id,
						title: 'Trying to re-tie this to a different shop',
					}),
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.updateAppointment).toBeNull();
		expect(errors[0].message).toMatch(/shopId cannot be changed/);
	});

	it('rejects un-tying shopId from an appointment that already has one', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, { shopId: shop.id });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_APPOINTMENT,
				variables: {
					appointmentInput: baseAppointmentInput({
						id: appointment.id,
						userId: user.id,
						shopId: null,
						title: 'Trying to strip the shopId',
					}),
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.updateAppointment).toBeNull();
		expect(errors[0].message).toMatch(/shopId cannot be changed/);
	});

	// Regression: SessionDetail.jsx's minimal-payload save (see
	// AppointmentService.UPDATE_SESSION_DETAILS - only ever sends id/appointmentDate/the money
	// components/sessionNotes/appointmentStatus, deliberately never shopId) started throwing "shopId cannot
	// be changed" the instant convertBookingRequest began correctly setting shopId on
	// session/consult appointments - previously this never fired since shopId was never set to
	// begin with, so the bug existed but had no way to surface. Omitting shopId from a partial
	// update must leave it untouched, not be treated as an attempt to null it out.
	it('allows a partial update that omits shopId entirely on a shop-attributed appointment', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, { shopId: shop.id, subtotalCents: 0 });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_APPOINTMENT,
				variables: {
					// No shopId key at all here - matches SessionDetail.jsx's real minimal payload
					// shape, not just an "explicit null" case (already covered above).
					appointmentInput: {
						id: appointment.id,
						appointmentDate: new Date().toISOString(),
						subtotalCents: 25000,
					},
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateAppointment.shopId).toBe(shop.id);
	});

	it('allows updating other fields on a shop-attributed appointment as long as shopId is unchanged', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, { shopId: shop.id });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_APPOINTMENT,
				variables: {
					appointmentInput: baseAppointmentInput({
						id: appointment.id,
						userId: user.id,
						shopId: shop.id,
						title: 'Updated title, same shop',
					}),
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateAppointment.title).toBe('Updated title, same shop');
	});

	it('requires a real shop connection when attributing shopId for the first time via update', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		// Deliberately no connectArtistToShop call - this artist has never connected to this shop.
		const appointment = await createAppointment(user.id); // no shopId yet
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_APPOINTMENT,
				variables: {
					appointmentInput: baseAppointmentInput({
						id: appointment.id,
						userId: user.id,
						shopId: shop.id,
						title: 'First-time shop attribution attempt',
					}),
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.updateAppointment).toBeNull();
		expect(errors[0].message).toMatch(/No connection exists between you and this shop/);
	});

	it('rejects an update from a user who is neither the appointment owner nor SHOP_ADMIN-or-better', async () => {
		const { user: owner } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const appointment = await createAppointment(owner.id);
		const token = signTestToken(otherArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_APPOINTMENT,
				variables: {
					appointmentInput: baseAppointmentInput({ id: appointment.id, userId: owner.id, title: 'Hijacked' }),
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.updateAppointment).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

// Regression coverage for a real gap found while building the artist dashboard (see
// PRODUCTION_ROADMAP.md): getAppointmentsByArtist/getAppointmentsByShop were withAuth-wrapped
// with no ownership check at all - any authenticated user could pass an arbitrary userId/shopId
// and read that artist's or shop's full appointment/financial history.
const DELETE_APPOINTMENT = `
	mutation DeleteAppointment($appointmentId: ID) {
		deleteAppointment(appointmentId: $appointmentId)
	}
`;

// deleteAppointment is the one delete* mutation that survived the cull, and the guard is the
// reason it could. An empty scheduled slot holds nothing and removing it is a normal thing to
// want; a completed one holds the session total, the tip, the shop's cut and any deposit applied
// to it, and deleting that removes a transaction rather than a calendar entry. The artist's
// earnings and the shop's ledger would both move, silently, with nothing left to reconcile.
describe('deleteAppointment: only when nothing is attached', () => {
	it('deletes an empty scheduled slot', async () => {
		const { user: owner } = await createArtistUser();
		const appointment = await createAppointment(owner.id, { appointmentStatus: 'scheduled' });
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(signTestToken(owner)) },
		);

		expect(response.body.singleResult.errors).toBeUndefined();
		expect(response.body.singleResult.data.deleteAppointment).toMatch(/deleted successfully/);
		expect(await Appointment.findById(appointment.id)).toBeNull();
	});

	it('refuses a completed appointment and says what to do instead', async () => {
		const { user: owner } = await createArtistUser();
		const appointment = await createAppointment(owner.id, {
			appointmentStatus: 'completed',
			totalCents: 40000,
		});
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(signTestToken(owner)) },
		);

		const { errors } = response.body.singleResult;
		// Thrown via UserInputError('Errors', { errors: {...} }) - the detail is in
		// extensions.errors.appointmentId, not message (which is literally "Errors").
		expect(errors[0].extensions.errors.appointmentId).toMatch(/cancelled or no-show/);
		expect(await Appointment.findById(appointment.id)).not.toBeNull();
	});

	it('refuses a scheduled consult that is holding a deposit', async () => {
		// Status alone isn't enough: a consult can be 'scheduled' and still hold real money.
		const { user: owner } = await createArtistUser();
		const appointment = await createAppointment(owner.id, {
			appointmentStatus: 'scheduled',
			appointmentType: 'consult',
			depositCents: 10000,
			depositStatus: 'available',
		});
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(signTestToken(owner)) },
		);

		expect(response.body.singleResult.errors[0].extensions.errors.appointmentId).toMatch(
			/deposit was taken/,
		);
		expect(await Appointment.findById(appointment.id)).not.toBeNull();
	});

	it('refuses one whose shop cut is already in flight', async () => {
		const { user: owner } = await createArtistUser();
		const appointment = await createAppointment(owner.id, {
			appointmentStatus: 'scheduled',
			shopCutStatus: 'pending_confirmation',
		});
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(signTestToken(owner)) },
		);

		expect(response.body.singleResult.errors[0].extensions.errors.appointmentId).toMatch(
			/shop cut/,
		);
		expect(await Appointment.findById(appointment.id)).not.toBeNull();
	});

	it('refuses an artist deleting somebody else\'s empty slot', async () => {
		const { user: owner } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const appointment = await createAppointment(owner.id, { appointmentStatus: 'scheduled' });
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(signTestToken(otherArtist)) },
		);

		expect(response.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
		expect(await Appointment.findById(appointment.id)).not.toBeNull();
	});
});

describe('getAppointmentsByArtist: ownership', () => {
	it('allows an artist to read their own appointments', async () => {
		const { user } = await createArtistUser();
		await createAppointment(user.id);
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_ARTIST, variables: { userId: user.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointmentsByArtist.items).toHaveLength(1);
	});

	it("rejects a different artist reading someone else's appointments", async () => {
		const { user: owner } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		await createAppointment(owner.id);
		const token = signTestToken(otherArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_ARTIST, variables: { userId: owner.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		// AppointmentPage! is non-null, so the thrown error nulls all of `data`.
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it("rejects a Client reading an artist's appointments", async () => {
		const { user: owner } = await createArtistUser();
		const { user: client } = await createClientUser();
		await createAppointment(owner.id);
		const token = signTestToken(client);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_ARTIST, variables: { userId: owner.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		// AppointmentPage! is non-null, so the thrown error nulls all of `data`.
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	// Was "any artist's appointments" - a shop admin passed on role alone. A shop admin is the
	// admin of one shop, so this now takes the connection that makes the artist theirs; the
	// unconnected case is the next test.
	it('allows a Shop Admin to read the appointments of an artist at their own shop', async () => {
		const { user: owner } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await connectArtistToShop(owner.id, shop.id);
		await createAppointment(owner.id);
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_ARTIST, variables: { userId: owner.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointmentsByArtist.items).toHaveLength(1);
	});

	it("refuses a Shop Admin the appointments of an artist at a different shop", async () => {
		const { user: owner } = await createArtistUser();
		const { shop: shopA } = await createShopAdminUser();
		const { user: adminB } = await createShopAdminUser();
		await connectArtistToShop(owner.id, shopA.id);
		await createAppointment(owner.id);
		const token = signTestToken(adminB);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_ARTIST, variables: { userId: owner.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		// AppointmentPage! is non-null, so the thrown error nulls all of `data`.
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('getAppointmentsByShop: ownership', () => {
	it("allows that shop's own Shop Admin to read its calendar", async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await createAppointment(shopAdmin.id, { shopId: shop.id });
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_SHOP, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointmentsByShop.items).toHaveLength(1);
	});

	// This is the real regression case: client/src/components/ibCalendar/IBCalendar.jsx calls
	// getAppointmentsByShop(user.userInfo.shop.id) for a genuine SHOP_STAFF-role staff member
	// viewing their own shop's calendar, not just a Shop Admin - a flat SHOP_ADMIN role gate would
	// have broken that real, already-shipped usage.
	it('allows a genuine SHOP_STAFF staff member of that shop to read its calendar', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: staffMember } = await createStaffUser(shop.id);
		await createAppointment(shopAdmin.id, { shopId: shop.id });
		const token = signTestToken(staffMember);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_SHOP, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointmentsByShop.items).toHaveLength(1);
	});

	it('allows an artist connected to that shop to read its calendar', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop.id);
		await createAppointment(shopAdmin.id, { shopId: shop.id });
		const token = signTestToken(artist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_SHOP, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointmentsByShop.items).toHaveLength(1);
	});

	it('rejects an artist with no connection to that shop', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: unconnectedArtist } = await createArtistUser();
		await createAppointment(shopAdmin.id, { shopId: shop.id });
		const token = signTestToken(unconnectedArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_SHOP, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		// AppointmentPage! is non-null, so the thrown error nulls all of `data`.
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('rejects a Client with no relationship to that shop at all', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: client } = await createClientUser();
		await createAppointment(shopAdmin.id, { shopId: shop.id });
		const token = signTestToken(client);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_SHOP, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		// AppointmentPage! is non-null, so the thrown error nulls all of `data`.
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('getAppointment: ownership', () => {
	it('allows the assigned artist to read their own appointment', async () => {
		const { user: artistUser } = await createArtistUser();
		const appointment = await createAppointment(artistUser.id);
		const token = signTestToken(artistUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointment.id).toBe(appointment.id);
	});

	it('allows a Staff member of the appointment\'s shop', async () => {
		const { shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const { user: staffUser } = await createStaffUser(shop.id);
		const appointment = await createAppointment(artistUser.id, { shopId: shop.id });
		const token = signTestToken(staffUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointment.id).toBe(appointment.id);
	});

	it('rejects a different artist with no connection to this appointment\'s shop', async () => {
		const { shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const appointment = await createAppointment(artistUser.id, { shopId: shop.id });
		const token = signTestToken(otherArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getAppointment).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('rejects a Client with no relationship to this appointment', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const appointment = await createAppointment(artistUser.id);
		const token = signTestToken(clientUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getAppointment).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	// Was "a Shop Admin regardless of connection", called with the global ADMIN role. Both halves
	// of that are gone: the connection is now exactly what grants access.
	it('allows a shop admin connected to the appointment\'s shop', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const appointment = await createAppointment(artistUser.id, { shopId: shop.id });
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointment.id).toBe(appointment.id);
	});
});

// --- isPersonal (personal calendar) coverage ------------------------------------------------
//
// Added in the same session as the rest of this file's existing tests, but flagged separately
// because of it: this sandbox's MongoMemoryServer can't download a Mongo binary here
// (fastdl.mongodb.org returns 403 for this platform - the same caveat already on
// clientFlags.test.js/expenses.test.js/analytics.test.js, see HANDOFF.md's Known Gaps), so NONE
// of the tests in this file - the ones above that predate this feature included - actually
// execute in this environment. Everything below is written to the same structure and passing
// conventions as the createAppointment/updateAppointment/getAppointmentsBy*/getAppointment blocks
// above it; someone with real network access to fastdl.mongodb.org (or a local `mongod`) needs to
// be the first to actually run it. Covers mutations/appointments.js's isPersonal exclusivity/
// immutability guards and resolvers/appointments.js's three-deep privacy check
// (getAppointmentsByShop, getAppointmentsByArtist, getAppointment).

const GET_APPOINTMENTS_BY_ARTIST_FILTERED = `
	query GetAppointmentsByArtist($userId: ID!, $filter: AppointmentFilter) {
		getAppointmentsByArtist(userId: $userId, filter: $filter) { items {
			id
			isPersonal
		} }
	}
`;

const CREATE_PERSONAL_APPOINTMENT = `
	mutation CreateAppointment($appointmentInput: AppointmentInput) {
		createAppointment(appointmentInput: $appointmentInput) {
			id
			userId
			shopId
			projectId
			isPersonal
		}
	}
`;

const UPDATE_APPOINTMENT_ISPERSONAL = `
	mutation UpdateAppointment($appointmentInput: AppointmentInput) {
		updateAppointment(appointmentInput: $appointmentInput) {
			id
			isPersonal
			title
		}
	}
`;

function basePersonalInput(overrides = {}) {
	const now = new Date().toISOString();
	return {
		appointmentDate: now,
		// 'other' - the same internal bucket AppointmentWizard.jsx sends for every personal entry
		// (see that file's own comment on why: the chip never reads this field for a personal
		// appointment, so the exact value doesn't matter beyond satisfying the required enum).
		appointmentType: 'other',
		appointmentStatus: 'scheduled',
		createdAt: now,
		updatedAt: now,
		isPersonal: true,
		...overrides,
	};
}

// A document with BOTH isPersonal and a real shopId can only exist as corrupted/legacy data -
// createAppointment refuses that combination outright (see the exclusivity tests below), so the
// only way to construct one for a test is directly against the model, bypassing the mutation
// entirely. That's deliberate here: it's what actually proves the resolver-level exclusions in
// getAppointmentsByShop/getAppointment are real, load-bearing checks rather than just happening to
// pass because a personal appointment never has a shopId in ordinary use - see those two
// resolvers' own "defense-in-depth" comments.
function saveCorruptedShopPersonalAppointment({ userId, shopId, title }) {
	const now = new Date();
	return new Appointment({
		appointmentDate: now,
		userId,
		shopId,
		isPersonal: true,
		title,
		appointmentType: 'other',
		appointmentStatus: 'scheduled',
		shopCutStatus: 'none',
		createdAt: now,
		updatedAt: now,
	}).save();
}

describe('createAppointment: isPersonal exclusivity + forced ownership', () => {
	it('rejects a personal appointment that also carries a shopId', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_PERSONAL_APPOINTMENT,
				variables: { appointmentInput: basePersonalInput({ shopId: shop.id }) },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.createAppointment).toBeNull();
		expect(errors[0].extensions.errors.isPersonal).toMatch(
			/cannot be attributed to a shop or a project/,
		);
	});

	it('rejects a personal appointment that also carries a projectId', async () => {
		const { user } = await createArtistUser();
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_PERSONAL_APPOINTMENT,
				// A real ObjectId-shaped string - objectIdSchema validates shape, not existence, and
				// this request is rejected before anything would try to look the project up.
				variables: {
					appointmentInput: basePersonalInput({ projectId: '507f1f77bcf86cd799439011' }),
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.createAppointment).toBeNull();
		expect(errors[0].extensions.errors.isPersonal).toMatch(
			/cannot be attributed to a shop or a project/,
		);
	});

	it("forces the appointment to the caller's own userId, ignoring a different userId in the input", async () => {
		const { user: caller } = await createArtistUser();
		const { user: someoneElse } = await createArtistUser();
		const token = signTestToken(caller);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_PERSONAL_APPOINTMENT,
				variables: { appointmentInput: basePersonalInput({ userId: someoneElse.id }) },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createAppointment.userId).toBe(caller.id);
		expect(data.createAppointment.isPersonal).toBe(true);
		expect(data.createAppointment.shopId).toBeNull();
	});

	it('creates a personal appointment with no shop or project attached', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		// Connected to a real shop - proves isPersonal isn't just "what happens when there's no
		// shop to attribute to" but an explicit, honored choice even for a shop-connected artist.
		await connectArtistToShop(user.id, shop.id);
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_PERSONAL_APPOINTMENT, variables: { appointmentInput: basePersonalInput() } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createAppointment.isPersonal).toBe(true);
		expect(data.createAppointment.shopId).toBeNull();
		expect(data.createAppointment.projectId).toBeNull();
	});
});

describe('updateAppointment: isPersonal immutability', () => {
	it('rejects turning an existing shop appointment into a personal one', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, { shopId: shop.id, isPersonal: false });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_APPOINTMENT_ISPERSONAL,
				variables: {
					appointmentInput: baseAppointmentInput({
						id: appointment.id,
						userId: user.id,
						isPersonal: true,
						title: 'Trying to go private',
					}),
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.updateAppointment).toBeNull();
		expect(errors[0].message).toMatch(/calendar \(shop or personal\) cannot be changed/);
	});

	it('rejects turning an existing personal appointment into a shop one', async () => {
		const { user } = await createArtistUser();
		const appointment = await createAppointment(user.id, { isPersonal: true });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_APPOINTMENT_ISPERSONAL,
				variables: {
					appointmentInput: baseAppointmentInput({
						id: appointment.id,
						userId: user.id,
						isPersonal: false,
						title: 'Trying to go public',
					}),
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.updateAppointment).toBeNull();
		expect(errors[0].message).toMatch(/calendar \(shop or personal\) cannot be changed/);
	});

	// Mirrors the shopId "partial update that omits the key entirely" case in the
	// updateAppointment describe block above (see that test's own comment on the real regression
	// it caught) - a save that never mentions isPersonal at all must not be read as an attempt to
	// flip it.
	it('allows a partial update that omits isPersonal entirely on a personal appointment', async () => {
		const { user } = await createArtistUser();
		const appointment = await createAppointment(user.id, { isPersonal: true });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_APPOINTMENT_ISPERSONAL,
				variables: {
					appointmentInput: {
						id: appointment.id,
						appointmentDate: new Date().toISOString(),
						title: 'Updated title only',
					},
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateAppointment.isPersonal).toBe(true);
		expect(data.updateAppointment.title).toBe('Updated title only');
	});
});

describe('getAppointmentsByShop: never surfaces a personal appointment', () => {
	it("excludes a personal appointment even if it somehow carries the shop's own shopId", async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await saveCorruptedShopPersonalAppointment({
			userId: shopAdmin.id,
			shopId: shop.id,
			title: 'Should never appear on the shop calendar',
		});
		await createAppointment(shopAdmin.id, { shopId: shop.id }); // an ordinary shop appointment
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_SHOP, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointmentsByShop.items).toHaveLength(1);
	});
});

describe('getAppointmentsByArtist: isPersonal visibility', () => {
	it("includes the caller's own personal appointments alongside shop ones when no isPersonal filter is given", async () => {
		const { user } = await createArtistUser();
		await createAppointment(user.id, { isPersonal: true });
		await createAppointment(user.id, { isPersonal: false });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_ARTIST_FILTERED, variables: { userId: user.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointmentsByArtist.items).toHaveLength(2);
	});

	it('lets the caller narrow to just their own personal appointments via filter.isPersonal', async () => {
		const { user } = await createArtistUser();
		await createAppointment(user.id, { isPersonal: true });
		await createAppointment(user.id, { isPersonal: false });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: GET_APPOINTMENTS_BY_ARTIST_FILTERED,
				variables: { userId: user.id, filter: { isPersonal: true } },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointmentsByArtist.items).toHaveLength(1);
		expect(data.getAppointmentsByArtist.items[0].isPersonal).toBe(true);
	});

	// The privacy-critical case: a Shop Admin is otherwise fully entitled to browse this artist's
	// schedule (see the plain ownership describe block above), but a personal appointment must
	// stay invisible to them regardless - even when they explicitly ask for it by filter.
	it("excludes a personal appointment from a Shop Admin's view of the artist's schedule, even when filter.isPersonal is explicitly true", async () => {
		const { user: owner } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await connectArtistToShop(owner.id, shop.id);
		await createAppointment(owner.id, { isPersonal: true });
		await createAppointment(owner.id, { shopId: shop.id });
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: GET_APPOINTMENTS_BY_ARTIST_FILTERED,
				variables: { userId: owner.id, filter: { isPersonal: true } },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		// NOT empty - the isPersonal:true this admin asked for is force-overridden to $ne:true
		// (applied LAST, after the filter spread - see resolvers/appointments.js's own comment on
		// why), which doesn't make the query unsatisfiable, it OVERWRITES the caller's isPersonal
		// value entirely. So this still matches the shop's own non-personal appointment - the
		// privacy guarantee is "you can never see the personal one", not "asking for isPersonal:true
		// as a non-owner returns nothing".
		expect(data.getAppointmentsByArtist.items).toHaveLength(1);
		expect(data.getAppointmentsByArtist.items[0].isPersonal).toBeFalsy();
	});
});

describe('getAppointment: personal-appointment privacy', () => {
	it('allows the owner to read their own personal appointment', async () => {
		const { user } = await createArtistUser();
		const appointment = await createAppointment(user.id, { isPersonal: true });
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointment.id).toBe(appointment.id);
	});

	it("denies a Shop Admin of the appointment owner's own shop, even though they'd normally be let in", async () => {
		const { user: owner } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await connectArtistToShop(owner.id, shop.id);
		const appointment = await createAppointment(owner.id, { isPersonal: true });
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getAppointment).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	// Same defense-in-depth scenario as the getAppointmentsByShop test above, applied to this
	// resolver - proves the isPersonal check really does run first and isn't just correct by
	// coincidence because a personal appointment never has a shopId to fall through to
	// callerBelongsToShop with. See resolvers/appointments.js's own comment on exactly this.
	it('denies even a Shop Admin who WOULD pass the shop-membership check, if isPersonal is set', async () => {
		const { user: owner } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await connectArtistToShop(owner.id, shop.id);
		const appointment = await saveCorruptedShopPersonalAppointment({
			userId: owner.id,
			shopId: shop.id,
			title: 'Corrupted record - should still be denied',
		});
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getAppointment).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it("denies an unrelated artist from reading someone else's personal appointment", async () => {
		const { user: owner } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const appointment = await createAppointment(owner.id, { isPersonal: true });
		const token = signTestToken(otherArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getAppointment).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});
