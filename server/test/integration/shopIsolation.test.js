// The tenancy boundary, tested from one place.
//
// Every other test file checks a rule about one resolver. This one checks the single rule the
// whole app now rests on: NOBODY reaches a shop they aren't assigned to. Not a role, not a
// support account, not the person who wrote the code. There is no global admin any more (see
// utils/shop-membership.js for the history - `role <= SHOP_ADMIN` appeared ~50 times and in every
// case guarding shop-scoped data it meant "skip the shop check", which for a shop admin is
// precisely backwards).
//
// The shape below is deliberate and worth keeping if these are ever rewritten: two complete,
// realistic shops, and a shop admin at B who is fully legitimate - real account, real role, real
// shop - trying to read and write A's records one surface at a time. That's the actual threat.
// It isn't an attacker with a stolen token; it's a paying customer of the same product passing a
// different id. A test that checks an anonymous caller is refused proves much less, because
// authentication was never the part that was broken.
//
// Money and client PII are the two things worth being loudest about, so they come first.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const mongoose = require('mongoose');
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createClientUser,
	connectArtistToShop,
	createProject,
	createAppointment,
	createBookingRequest,
} = require('../helpers/factories');
const Appointment = require('../../models/Appointment');
const Project = require('../../models/Project');
const Shop = require('../../models/Shop');
const { Constants } = require('../../utils/constants');

// getShopAnalytics/getArtistAnalytics take a required window (see typeDefs.js) and reject anything
// over ten years (assertValidRange in resolvers/analytics.js). These tests care about who is
// asking, not about what falls inside the window, so this is simply the widest legal range that
// still contains the fixtures - whose appointmentDate is `new Date()`. A 2000-2100 span was the
// obvious thing to reach for and fails the range check, which surfaces as a BAD_USER_INPUT
// "Errors" rather than anything to do with authorization.
const RANGE = {
	start: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
	end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

/**
 * Two fully-populated shops. Shop A is the victim; the caller is always shop B's admin.
 *
 * Everything A has is real and connected the way the app actually connects it - the artist has an
 * ArtistShopConnection, the appointment carries a shopId and money, the project has a client with
 * a booking request behind it. A half-built fixture would let a resolver pass this suite by
 * failing to find anything rather than by refusing.
 */
async function twoShops() {
	// shopCutPercent is set explicitly: Shop's schema default is 0, and the cross-shop updateShop
	// test below tries to write 0, so a defaulted fixture would make "the value didn't change"
	// pass whether or not the write was refused.
	const { user: adminA, shop: shopA } = await createShopAdminUser({ shop: { shopCutPercent: 20 } });
	const { user: adminB, shop: shopB } = await createShopAdminUser();

	const { user: artistA, artist: artistProfileA } = await createArtistUser({
		artist: { shopId: shopA._id },
	});
	await connectArtistToShop(artistA.id, shopA.id);

	const { user: clientUserA, client: clientA } = await createClientUser();
	const projectA = await createProject(artistA.id, clientA.id);
	const bookingRequestA = await createBookingRequest(artistA.id, clientA.id);

	const appointmentA = await createAppointment(artistA.id, {
		shopId: shopA._id,
		projectId: projectA._id,
		appointmentStatus: 'completed',
		totalCents: 40000,
		subtotalCents: 35000,
		tipCents: 5000,
		shopCutCents: 7000,
		shopCutStatus: 'pending_confirmation',
		shopCutMarkedPaidBy: artistA.id,
		shopCutMarkedPaidAt: new Date(),
	});

	return {
		shopA,
		shopB,
		adminA,
		adminB,
		artistA,
		artistProfileA,
		clientUserA,
		clientA,
		projectA,
		bookingRequestA,
		appointmentA,
	};
}

// Shop B's admin, who is a real, legitimate, paying user - just not of shop A.
const asOutsideAdmin = (adminB) => ({ contextValue: contextWithToken(signTestToken(adminB)) });

/**
 * Asserts a GraphQL response refused the caller.
 *
 * `data` itself is null for a non-null field (GraphQL propagates a null from a non-null field up
 * to its parent, which for a root field means the whole `data`) and `data[field]` is null for a
 * nullable one - so this accepts either rather than making every call site know which. Four
 * assertions were written the wrong way round the first time this distinction came up; see
 * accounts.test.js.
 */
function expectRefused(response, field) {
	const { errors, data } = response.body.singleResult;
	expect(errors).toBeDefined();
	expect(errors[0].message).toMatch(/Action not allowed/);
	if (data !== null) {
		expect(data[field]).toBeNull();
	}
}

describe('money is not visible across shops', () => {
	it("refuses another shop's analytics", async () => {
		const { shopA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($shopId: ID!, $start: DateTime!, $end: DateTime!) {
					getShopAnalytics(shopId: $shopId, start: $start, end: $end) { revenueCents tipsCents }
				}`,
				variables: { shopId: shopA.id, ...RANGE },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'getShopAnalytics');
	});

	it("refuses another shop's artist's earnings", async () => {
		const { artistA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($userId: ID!, $start: DateTime!, $end: DateTime!) {
					getArtistAnalytics(userId: $userId, start: $start, end: $end) { revenueCents tipsCents }
				}`,
				variables: { userId: artistA.id, ...RANGE },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'getArtistAnalytics');
	});

	it("refuses another shop's calendar, which carries per-session totals", async () => {
		const { shopA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($shopId: ID!) { getAppointmentsByShop(shopId: $shopId) { items { id totalCents tipCents } } }`,
				variables: { shopId: shopA.id },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'getAppointmentsByShop');
	});

	it("refuses a single appointment at another shop", async () => {
		const { appointmentA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($appointmentId: ID!) { getAppointment(appointmentId: $appointmentId) { id totalCents } }`,
				variables: { appointmentId: appointmentA.id },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'getAppointment');
	});

	it("refuses another shop's pending shop-cut confirmations", async () => {
		// Each row here names an artist and the amount they say they've paid their shop. The
		// resolver had a SHOP_ADMIN minRole and no shop check at all, so this was one argument
		// away from being readable by any shop admin on the platform.
		const { shopA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($shopId: ID!) { getPendingShopCutConfirmations(shopId: $shopId) { id shopCutCents } }`,
				variables: { shopId: shopA.id },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'getPendingShopCutConfirmations');
	});

	it("refuses confirming another shop's cut as paid", async () => {
		// A write, not a read: confirming marks the shop as having received money it hasn't.
		const { appointmentA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation A($appointmentId: ID!) { confirmShopCutPaid(appointmentId: $appointmentId) { id shopCutStatus } }`,
				variables: { appointmentId: appointmentA.id },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'confirmShopCutPaid');
		const stored = await Appointment.findById(appointmentA.id);
		expect(stored.shopCutStatus).toBe('pending_confirmation');
	});
});

describe('client records are not visible across shops', () => {
	it("does not list another shop's clients", async () => {
		const { clientA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: `{ getClients { items { id email } } }` },
			asOutsideAdmin(adminB),
		);

		// Not an error - a scoped list. Shop B genuinely has no clients, so the honest answer is
		// an empty list rather than a refusal.
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getClients.items.map((c) => c.id)).not.toContain(clientA.id);
	});

	it("refuses a single client at another shop", async () => {
		const { clientA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($clientId: ID!) { getClient(clientId: $clientId) { id email phone } }`,
				variables: { clientId: clientA.id },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'getClient');
	});

	it("refuses writing internal notes on another shop's client", async () => {
		const { clientA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `
					mutation A($clientId: ID!, $notes: [IBNoteInput]) {
						updateClientNotes(clientId: $clientId, notes: $notes) { id }
					}
				`,
				variables: {
					clientId: clientA.id,
					notes: [
						{
							// IBNoteInput requires id and author - see typeDefs.js.
							id: new mongoose.Types.ObjectId().toString(),
							author: 'Outside Admin',
							note: 'Planted by another shop.',
							createdAt: new Date().toISOString(),
						},
					],
				},
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'updateClientNotes');
	});
});

describe('work and schedule are not visible across shops', () => {
	it("does not list another shop's projects", async () => {
		const { projectA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: `{ getProjects { items { id } } }` },
			asOutsideAdmin(adminB),
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getProjects.items.map((p) => p.id)).not.toContain(projectA.id);
	});

	it("refuses a single project at another shop", async () => {
		const { projectA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($projectId: ID!) { getProject(projectId: $projectId) { id description } }`,
				variables: { projectId: projectA.id },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'getProject');
	});

	it("refuses editing a project at another shop", async () => {
		const { projectA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation A($project: ProjectInput) { updateProject(project: $project) { id title } }`,
				// ProjectInput's non-null fields all have to be present or the request fails
				// variable coercion before any resolver runs - which would pass expectRefused for
				// entirely the wrong reason.
				variables: {
					project: {
						id: projectA.id,
						title: 'Renamed by an outsider',
						description: projectA.description,
						artistId: String(projectA.artistId),
						clientId: String(projectA.clientId),
						status: projectA.status,
					},
				},
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'updateProject');
		const stored = await Project.findById(projectA.id);
		expect(stored.title).not.toBe('Renamed by an outsider');
	});

	it("refuses another artist's booking-request inbox", async () => {
		// Every request carries a prospective client's name, email and the work they want.
		const { artistA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($artistId: ID!) { getBookingRequests(artistId: $artistId) { id description } }`,
				variables: { artistId: artistA.id },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'getBookingRequests');
	});

	it("refuses another shop's artist roster", async () => {
		const { shopA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($shopId: ID!) { getArtistsByShop(shopId: $shopId) { id } }`,
				variables: { shopId: shopA.id },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'getArtistsByShop');
	});
});

describe('shop records themselves are not reachable across shops', () => {
	it("does not list another shop", async () => {
		const { shopA, shopB, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: `{ getShops { id } }` },
			asOutsideAdmin(adminB),
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getShops.map((s) => s.id)).toEqual([shopB.id]);
		expect(data.getShops.map((s) => s.id)).not.toContain(shopA.id);
	});

	it("refuses reading another shop's record", async () => {
		const { shopA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($shopId: ID!) { getShop(shopId: $shopId) { id email squareConnected } }`,
				variables: { shopId: shopA.id },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'getShop');
	});

	it("refuses editing another shop - including its shop-cut percentage", async () => {
		// The shop cut is the shop's whole revenue model. Being able to set another shop's to zero
		// is a financial write, not a cosmetic one.
		const { shopA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation A($shop: ShopInput) { updateShop(shop: $shop) { id shopCutPercent } }`,
				variables: { shop: { id: shopA.id, shopCutPercent: 0 } },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'updateShop');
		const stored = await Shop.findById(shopA.id);
		expect(stored.shopCutPercent).not.toBe(0);
	});

	// "refuses deleting another shop" used to sit here. deleteShop no longer exists - see the note
	// on the Mutation type in typeDefs.js for why all eight delete* mutations were removed rather
	// than re-gated. updateShop above covers the same boundary with a mutation that still exists.

	it("refuses planting an account on another shop", async () => {
		// The nastiest of the write cases: createArtistAccount returns an invite link, so a
		// successful call would hand the caller a working login inside somebody else's shop.
		const { shopA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `
					mutation A($input: CreateArtistAccountInput!) {
						createArtistAccount(input: $input) { inviteLink artist { id } }
					}
				`,
				variables: {
					input: {
						firstName: 'Planted',
						lastName: 'Account',
						email: 'planted@example.com',
						shopId: shopA.id,
					},
				},
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'createArtistAccount');
	});

	it("refuses disconnecting another shop's Square account", async () => {
		// Not a data leak - a denial of service. Success here stops another business taking card
		// payments.
		const { shopA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation A($shopId: ID!) { disconnectShopSquare(shopId: $shopId) { id squareConnected } }`,
				variables: { shopId: shopA.id },
			},
			asOutsideAdmin(adminB),
		);

		expectRefused(response, 'disconnectShopSquare');
	});
});

describe('the shop admin still has full reach inside their own shop', () => {
	// The counterweight. Everything above is a refusal, and a resolver that refused everyone would
	// pass all of it - these are what prove the boundary is drawn in the right place rather than
	// simply drawn everywhere. A shop admin is meant to see all of their own shop, money included.
	it("reads their own shop's analytics with the money intact", async () => {
		const { shopA, adminA } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($shopId: ID!, $start: DateTime!, $end: DateTime!) {
					getShopAnalytics(shopId: $shopId, start: $start, end: $end) { revenueCents tipsCents }
				}`,
				variables: { shopId: shopA.id, ...RANGE },
			},
			{ contextValue: contextWithToken(signTestToken(adminA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		// The one completed appointment in the fixture: $400 total, $50 of it tip.
		expect(data.getShopAnalytics.revenueCents).toBe(40000);
		expect(data.getShopAnalytics.tipsCents).toBe(5000);
	});

	it("reads an appointment belonging to their own shop's artist", async () => {
		const { appointmentA, adminA } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($appointmentId: ID!) { getAppointment(appointmentId: $appointmentId) { id totalCents } }`,
				variables: { appointmentId: appointmentA.id },
			},
			{ contextValue: contextWithToken(signTestToken(adminA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointment.totalCents).toBe(40000);
	});

	it("reads a client their own shop has a project with", async () => {
		const { clientA, adminA } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($clientId: ID!) { getClient(clientId: $clientId) { id } }`,
				variables: { clientId: clientA.id },
			},
			{ contextValue: contextWithToken(signTestToken(adminA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getClient.id).toBe(clientA.id);
	});

	it("confirms their own shop's cut as paid", async () => {
		const { appointmentA, adminA } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation A($appointmentId: ID!) { confirmShopCutPaid(appointmentId: $appointmentId) { id shopCutStatus } }`,
				variables: { appointmentId: appointmentA.id },
			},
			{ contextValue: contextWithToken(signTestToken(adminA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.confirmShopCutPaid.shopCutStatus).toBe('paid');
	});
});

describe('there is no role that reaches across shops', () => {
	// ROLES.ADMIN used to be a global role that read every shop on the platform. It is kept as a
	// reserved number so existing role-1 rows don't silently become some other role, but it grants
	// nothing. These two are what stop it quietly becoming a bypass again - a future
	// `role <= ROLES.ADMIN` shortcut anywhere in the authorization path fails here rather than in
	// production.
	//
	// The token is signed by hand rather than via a factory because the point is a role the
	// factories deliberately no longer produce.
	const asRoleOne = (user) => ({
		contextValue: contextWithToken(
			signTestToken({
				id: String(user._id),
				email: user.email,
				role: Constants.ROLES.ADMIN,
			}),
		),
	});

	it('refuses a role-1 account with no shop assignment', async () => {
		const { shopA } = await twoShops();
		const { user: unaffiliated } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($shopId: ID!, $start: DateTime!, $end: DateTime!) {
					getShopAnalytics(shopId: $shopId, start: $start, end: $end) { revenueCents }
				}`,
				variables: { shopId: shopA.id, ...RANGE },
			},
			asRoleOne(unaffiliated),
		);

		expectRefused(response, 'getShopAnalytics');
	});

	it('refuses a role-1 account assigned to a different shop', async () => {
		// The subtler case: a real assignment, just not to this shop. Role must not rescue it.
		const { shopA, adminB } = await twoShops();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `query A($shopId: ID!, $start: DateTime!, $end: DateTime!) {
					getShopAnalytics(shopId: $shopId, start: $start, end: $end) { revenueCents }
				}`,
				variables: { shopId: shopA.id, ...RANGE },
			},
			asRoleOne(adminB),
		);

		expectRefused(response, 'getShopAnalytics');
	});
});
