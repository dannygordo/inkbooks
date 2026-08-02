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

const GET_APPOINTMENTS_BY_ARTIST = `
	query GetAppointmentsByArtist($userId: ID!) {
		getAppointmentsByArtist(userId: $userId) {
			id
		}
	}
`;

const GET_APPOINTMENTS_BY_SHOP = `
	query GetAppointmentsByShop($shopId: ID!) {
		getAppointmentsByShop(shopId: $shopId) {
			id
		}
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

const DELETE_APPOINTMENT = `
	mutation DeleteAppointment($appointmentId: ID) {
		deleteAppointment(appointmentId: $appointmentId)
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

describe('deleteAppointment: ownership', () => {
	it('allows the appointment owner to delete it', async () => {
		const { user } = await createArtistUser();
		const appointment = await createAppointment(user.id);
		const token = signTestToken(user);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.deleteAppointment).toMatch(/deleted successfully/);
	});

	it('rejects deletion by a user who is neither the owner nor an Admin', async () => {
		const { user: owner } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const appointment = await createAppointment(owner.id);
		const token = signTestToken(otherArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.deleteAppointment).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('allows an Admin to delete any appointment regardless of ownership', async () => {
		const { user: owner } = await createArtistUser();
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const appointment = await createAppointment(owner.id);
		const token = signTestToken(admin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_APPOINTMENT, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.deleteAppointment).toMatch(/deleted successfully/);
	});
});

// Regression coverage for a real gap found while building the artist dashboard (see
// PRODUCTION_ROADMAP.md): getAppointmentsByArtist/getAppointmentsByShop were withAuth-wrapped
// with no ownership check at all - any authenticated user could pass an arbitrary userId/shopId
// and read that artist's or shop's full appointment/financial history.
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
		expect(data.getAppointmentsByArtist).toHaveLength(1);
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
		expect(data.getAppointmentsByArtist).toBeNull();
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
		expect(data.getAppointmentsByArtist).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('allows a Shop Admin to read any artist\'s appointments', async () => {
		const { user: owner } = await createArtistUser();
		const { user: shopAdmin } = await createShopAdminUser();
		await createAppointment(owner.id);
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_ARTIST, variables: { userId: owner.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointmentsByArtist).toHaveLength(1);
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
		expect(data.getAppointmentsByShop).toHaveLength(1);
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
		expect(data.getAppointmentsByShop).toHaveLength(1);
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
		expect(data.getAppointmentsByShop).toHaveLength(1);
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
		expect(data.getAppointmentsByShop).toBeNull();
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
		expect(data.getAppointmentsByShop).toBeNull();
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

	it('allows a Shop Admin regardless of connection', async () => {
		const { user: artistUser } = await createArtistUser();
		const appointment = await createAppointment(artistUser.id);
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const token = signTestToken(admin);
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
