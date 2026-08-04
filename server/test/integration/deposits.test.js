// Integration tests for deposits (mutations/deposits.js, resolvers/deposits.js).
//
// The rule with teeth is single use. A deposit is real money already taken from a client, and
// crediting the same $200 to two sessions means either the client is short-changed or the shop
// eats it - so the applied-once guarantee is implemented as an atomic conditional update rather
// than a read-check-write, and these tests exist to keep it that way. The concurrency case below
// is the one that fails if anyone "simplifies" it back to reading the status first.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createClientUser,
	connectArtistToShop,
	createAppointment,
	createProject,
	createBookingRequest,
} = require('../helpers/factories');
const Appointment = require('../../models/Appointment');
const Shop = require('../../models/Shop');

const RECORD_DEPOSIT = `
	mutation RecordDeposit($appointmentId: ID!, $depositCents: Int!) {
		recordDeposit(appointmentId: $appointmentId, depositCents: $depositCents) {
			id
			depositCents
			depositStatus
			subtotalCents
			totalCents
			shopCutCents
		}
	}
`;

const APPLY_DEPOSIT = `
	mutation ApplyDeposit($depositAppointmentId: ID!, $targetAppointmentId: ID!) {
		applyDeposit(
			depositAppointmentId: $depositAppointmentId
			targetAppointmentId: $targetAppointmentId
		) {
			id
			depositCreditCents
			subtotalCents
			totalCents
			shopCutCents
		}
	}
`;

const GET_AVAILABLE_DEPOSITS = `
	query GetAvailableDeposits($appointmentId: ID!) {
		getAvailableDeposits(appointmentId: $appointmentId) {
			id
			depositCents
		}
	}
`;

// Builds an artist at a shop taking a 20% cut, a client, a project, plus a consult holding a
// deposit and a session to spend it on - the shape every test here needs.
async function setup({ shopCutPercent = 20 } = {}) {
	const { shop } = await createShopAdminUser();
	await Shop.findByIdAndUpdate(shop.id, { shopCutPercent });
	const { user: artist } = await createArtistUser();
	await connectArtistToShop(artist.id, shop.id);
	const { client } = await createClientUser();
	const project = await createProject(artist.id, client.id);

	// The consult reaches its client through a BookingRequest; the session through its Project.
	// Both paths matter - that's how applyDeposit checks the two belong to the same person.
	const bookingRequest = await createBookingRequest(artist.id, client._id, {
		description: 'Wolf forearm',
	});

	const consult = await createAppointment(artist.id, {
		shopId: shop.id,
		appointmentType: 'consult',
		bookingRequestId: bookingRequest._id,
	});
	const session = await createAppointment(artist.id, {
		shopId: shop.id,
		appointmentType: 'session',
		projectId: project._id,
		subtotalCents: 20000,
		totalCents: 20000,
	});
	return { shop, artist, client, project, consult, session };
}

const record = (server, artist, appointmentId, depositCents) =>
	server.executeOperation(
		{ query: RECORD_DEPOSIT, variables: { appointmentId: String(appointmentId), depositCents } },
		{ contextValue: contextWithToken(signTestToken(artist)) },
	);

const apply = (server, artist, depositId, targetId) =>
	server.executeOperation(
		{
			query: APPLY_DEPOSIT,
			variables: {
				depositAppointmentId: String(depositId),
				targetAppointmentId: String(targetId),
			},
		},
		{ contextValue: contextWithToken(signTestToken(artist)) },
	);

describe('recordDeposit', () => {
	it('records the deposit as that appointment\'s own revenue and charges the shop cut on it', async () => {
		const { artist, consult } = await setup({ shopCutPercent: 20 });
		const server = createTestServer();

		const res = await record(server, artist, consult.id, 10000);
		const a = res.body.singleResult.data.recordDeposit;

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(a.depositCents).toBe(10000);
		expect(a.depositStatus).toBe('available');
		// subtotal/total are set to the deposit so it lands in revenue on the day it was taken -
		// analytics sums totalCents, so leaving these at zero would make the money invisible.
		expect(a.subtotalCents).toBe(10000);
		expect(a.totalCents).toBe(10000);
		// And the cut is taken HERE. This is the half that keeps the shop whole, given the cut on
		// the final session is computed after the deposit is deducted.
		expect(a.shopCutCents).toBe(2000);
	});

	it('refuses to change a deposit that has already been spent', async () => {
		const { artist, consult, session } = await setup();
		const server = createTestServer();
		await record(server, artist, consult.id, 10000);
		await apply(server, artist, consult.id, session.id);

		const res = await record(server, artist, consult.id, 50000);

		expect(res.body.singleResult.data.recordDeposit).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Errors/);
		// The credit on the other side still says 10000 - letting this succeed would leave the
		// two halves of one transaction disagreeing.
		const target = await Appointment.findById(session.id);
		expect(target.depositCreditCents).toBe(10000);
	});

	it('rejects a zero or negative deposit', async () => {
		const { artist, consult } = await setup();
		const server = createTestServer();
		expect((await record(server, artist, consult.id, 0)).body.singleResult.data.recordDeposit).toBeNull();
		expect((await record(server, artist, consult.id, -500)).body.singleResult.data.recordDeposit).toBeNull();
	});
});

describe('applyDeposit', () => {
	it('deducts the deposit from the session total and computes the cut on the reduced figure', async () => {
		// The rule as specified: a $200 session with a $100 deposit applied is a $100 session, and
		// the shop cut follows the $100.
		const { artist, consult, session } = await setup({ shopCutPercent: 20 });
		const server = createTestServer();
		await record(server, artist, consult.id, 10000);

		const res = await apply(server, artist, consult.id, session.id);
		const a = res.body.singleResult.data.applyDeposit;

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(a.depositCreditCents).toBe(10000);
		// The work was still priced at $200 - the subtotal doesn't change, only what's owed.
		expect(a.subtotalCents).toBe(20000);
		expect(a.totalCents).toBe(10000);
		// 20% of the reduced $100, not of the $200. Combined with the $20 cut already taken at the
		// consult, the shop's total across both appointments is $40 - the same as 20% of $200.
		expect(a.shopCutCents).toBe(2000);
	});

	it('marks the deposit spent and removes it from what is available', async () => {
		const { artist, consult, session } = await setup();
		const server = createTestServer();
		await record(server, artist, consult.id, 10000);
		await apply(server, artist, consult.id, session.id);

		const stored = await Appointment.findById(consult.id);
		expect(stored.depositStatus).toBe('applied');
		expect(String(stored.depositAppliedToAppointmentId)).toBe(String(session.id));
		expect(stored.depositAppliedAt).toBeTruthy();

		const other = await createAppointment(artist.id, {
			shopId: stored.shopId,
			appointmentType: 'session',
			projectId: (await Appointment.findById(session.id)).projectId,
		});
		const res = await createTestServer().executeOperation(
			{ query: GET_AVAILABLE_DEPOSITS, variables: { appointmentId: String(other.id) } },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);
		expect(res.body.singleResult.data.getAvailableDeposits).toEqual([]);
	});

	it('refuses to apply the same deposit twice', async () => {
		const { artist, consult, session, project } = await setup();
		const server = createTestServer();
		await record(server, artist, consult.id, 10000);
		await apply(server, artist, consult.id, session.id);

		const secondSession = await createAppointment(artist.id, {
			appointmentType: 'session',
			projectId: project._id,
			subtotalCents: 30000,
		});
		const res = await apply(server, artist, consult.id, secondSession.id);

		expect(res.body.singleResult.data.applyDeposit).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Errors/);
		const second = await Appointment.findById(secondSession.id);
		expect(second.depositCreditCents).toBe(0);
	});

	it('lets only one of two concurrent applications win', async () => {
		// The reason the status flip is an atomic conditional update rather than a
		// read-check-write. Fired together on purpose: a read-then-write implementation has both
		// calls read 'available', both decide it's fine, and the same money gets credited twice.
		const { artist, consult, session, project } = await setup();
		const server = createTestServer();
		await record(server, artist, consult.id, 10000);
		const otherSession = await createAppointment(artist.id, {
			appointmentType: 'session',
			projectId: project._id,
			subtotalCents: 30000,
		});

		const [a, b] = await Promise.all([
			apply(server, artist, consult.id, session.id),
			apply(server, artist, consult.id, otherSession.id),
		]);

		const results = [a, b].map((r) => r.body.singleResult.data.applyDeposit);
		const winners = results.filter(Boolean);
		expect(winners).toHaveLength(1);

		// And exactly one session actually carries the credit.
		const [one, two] = await Promise.all([
			Appointment.findById(session.id),
			Appointment.findById(otherSession.id),
		]);
		const credited = [one, two].filter((appt) => appt.depositCreditCents > 0);
		expect(credited).toHaveLength(1);
		expect(credited[0].depositCreditCents).toBe(10000);
	});

	it("refuses a deposit belonging to a different client", async () => {
		// Without this a deposit is a transferable credit any artist could move onto any client's
		// session, which is indistinguishable from a mistake after the fact.
		const { artist, consult, shop } = await setup();
		const server = createTestServer();
		await record(server, artist, consult.id, 10000);

		const { client: otherClient } = await createClientUser();
		const otherProject = await createProject(artist.id, otherClient.id);
		const otherSession = await createAppointment(artist.id, {
			shopId: shop.id,
			appointmentType: 'session',
			projectId: otherProject._id,
			subtotalCents: 20000,
		});

		const res = await apply(server, artist, consult.id, otherSession.id);

		expect(res.body.singleResult.data.applyDeposit).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Errors/);
	});

	it('refuses a second deposit on a session that already has one', async () => {
		const { artist, consult, session, client, shop } = await setup();
		const server = createTestServer();
		await record(server, artist, consult.id, 10000);
		await apply(server, artist, consult.id, session.id);

		// A second consult for the same client, holding its own deposit.
		const secondRequest = await createBookingRequest(artist.id, client._id, {
			description: 'Second piece',
		});
		const secondConsult = await createAppointment(artist.id, {
			shopId: shop.id,
			appointmentType: 'consult',
			bookingRequestId: secondRequest._id,
		});
		await record(server, artist, secondConsult.id, 5000);

		const res = await apply(server, artist, secondConsult.id, session.id);

		expect(res.body.singleResult.data.applyDeposit).toBeNull();
		const stored = await Appointment.findById(session.id);
		expect(stored.depositCreditCents).toBe(10000);
		// The second deposit is untouched and still spendable elsewhere.
		const secondStored = await Appointment.findById(secondConsult.id);
		expect(secondStored.depositStatus).toBe('available');
	});

	it("refuses an artist applying another artist's deposit", async () => {
		const { consult, session } = await setup();
		const { user: stranger } = await createArtistUser();
		const server = createTestServer();

		const res = await apply(server, stranger, consult.id, session.id);

		expect(res.body.singleResult.data.applyDeposit).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});
});
