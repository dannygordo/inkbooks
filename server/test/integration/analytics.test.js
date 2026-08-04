// Integration tests for the dashboard analytics (utils/analytics.js, resolvers/analytics.js).
//
// Two things here are worth a test rather than a careful read:
//
//   The definitions. "Revenue" is completed appointments only, and that is a CHANGE - the artist
//   panel previously summed every appointment in the window regardless of status, so an artist's
//   revenue included work that hadn't happened yet. A test is what stops that quietly reverting
//   the next time someone "fixes" a total that looks low.
//
//   The money blackout. Staff get activity figures and null for anything denominated in currency.
//   That's enforced in the resolver rather than by the dashboard choosing what to render, so it
//   needs testing at the resolver, where it actually lives.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	createClientUser,
	connectArtistToShop,
	createAppointment,
} = require('../helpers/factories');

const GET_SHOP_ANALYTICS = `
	query GetShopAnalytics($shopId: ID!, $start: DateTime!, $end: DateTime!) {
		getShopAnalytics(shopId: $shopId, start: $start, end: $end) {
			revenueCents
			tipsCents
			averageTipCents
			tippedCount
			shopCutEarnedCents
			shopCutOutstandingCents
			shopCutAwaitingConfirmationCents
			completedSessionCount
			consultCount
			appointmentCount
			artistCount
			artists {
				userId
				artistId
				revenueCents
				completedSessionCount
			}
		}
	}
`;

const GET_ARTIST_ANALYTICS = `
	query GetArtistAnalytics($userId: ID!, $start: DateTime!, $end: DateTime!) {
		getArtistAnalytics(userId: $userId, start: $start, end: $end) {
			revenueCents
			tipsCents
			completedSessionCount
			artists { userId }
		}
	}
`;

// A fixed window well away from "now", so nothing depends on the day the suite happens to run.
const START = new Date('2026-03-01T00:00:00.000Z');
const END = new Date('2026-04-01T00:00:00.000Z');
const IN_RANGE = new Date('2026-03-15T12:00:00.000Z');

const runShop = (server, shop, caller) =>
	server.executeOperation(
		{
			query: GET_SHOP_ANALYTICS,
			variables: { shopId: String(shop.id), start: START, end: END },
		},
		{ contextValue: contextWithToken(signTestToken(caller)) },
	);

async function completedSession(artistUserId, shopId, overrides = {}) {
	return createAppointment(artistUserId, {
		shopId,
		appointmentDate: IN_RANGE,
		appointmentType: 'session',
		appointmentStatus: 'completed',
		...overrides,
	});
}

describe('getShopAnalytics: what the figures mean', () => {
	it('counts revenue on completed appointments only, not on booked ones', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop.id);
		await completedSession(artist.id, shop.id, { totalCents: 50000, tipCents: 5000 });
		// Same window, same price, but not yet worked. This must NOT be in revenue - the whole
		// distinction between a dashboard and a forecast.
		await createAppointment(artist.id, {
			shopId: shop.id,
			appointmentDate: IN_RANGE,
			appointmentStatus: 'scheduled',
			totalCents: 90000,
			tipCents: 9000,
		});

		const res = await runShop(createTestServer(), shop, shopAdmin);
		const a = res.body.singleResult.data.getShopAnalytics;

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(a.revenueCents).toBe(50000);
		expect(a.tipsCents).toBe(5000);
		// Both appointments are still counted as appointments - only the money is status-gated.
		expect(a.appointmentCount).toBe(2);
		expect(a.completedSessionCount).toBe(1);
	});

	it('excludes appointments outside the range, on both boundaries', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop.id);
		// start is inclusive, end is exclusive - so an appointment at exactly `start` counts and
		// one at exactly `end` does not. That's what lets March and April be adjacent without
		// double-counting midnight on the 1st.
		await completedSession(artist.id, shop.id, { appointmentDate: START, totalCents: 10000 });
		await completedSession(artist.id, shop.id, { appointmentDate: END, totalCents: 70000 });
		await completedSession(artist.id, shop.id, {
			appointmentDate: new Date('2026-02-28T23:59:59.000Z'),
			totalCents: 40000,
		});

		const res = await runShop(createTestServer(), shop, shopAdmin);
		expect(res.body.singleResult.data.getShopAnalytics.revenueCents).toBe(10000);
	});

	it('splits the shop cut into collected, outstanding and awaiting confirmation', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop.id);
		await completedSession(artist.id, shop.id, { shopCutCents: 9000, shopCutStatus: 'paid' });
		await completedSession(artist.id, shop.id, { shopCutCents: 4000, shopCutStatus: 'unpaid' });
		await completedSession(artist.id, shop.id, {
			shopCutCents: 3000,
			shopCutStatus: 'invoice_sent',
		});
		await completedSession(artist.id, shop.id, {
			shopCutCents: 2500,
			shopCutStatus: 'pending_confirmation',
		});

		const res = await runShop(createTestServer(), shop, shopAdmin);
		const a = res.body.singleResult.data.getShopAnalytics;

		expect(a.shopCutEarnedCents).toBe(9000);
		// unpaid + invoice_sent - both are owed, neither has been confirmed paid.
		expect(a.shopCutOutstandingCents).toBe(7000);
		// Kept apart from "outstanding" because it's the only bucket with something for the shop
		// to actually do.
		expect(a.shopCutAwaitingConfirmationCents).toBe(2500);
	});

	it('averages tips over tipped appointments only', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop.id);
		await completedSession(artist.id, shop.id, { totalCents: 20000, tipCents: 6000 });
		await completedSession(artist.id, shop.id, { totalCents: 20000, tipCents: 4000 });
		// Untipped. Including this would give an average of $33.33 instead of $50 and answer a
		// question nobody asked.
		await completedSession(artist.id, shop.id, { totalCents: 20000, tipCents: 0 });

		const res = await runShop(createTestServer(), shop, shopAdmin);
		const a = res.body.singleResult.data.getShopAnalytics;

		expect(a.tipsCents).toBe(10000);
		expect(a.tippedCount).toBe(2);
		expect(a.averageTipCents).toBe(5000);
	});

	it('breaks the totals down per artist, ranked by revenue', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: quiet } = await createArtistUser();
		const { user: busy } = await createArtistUser();
		await connectArtistToShop(quiet.id, shop.id);
		await connectArtistToShop(busy.id, shop.id);
		await completedSession(quiet.id, shop.id, { totalCents: 10000 });
		await completedSession(busy.id, shop.id, { totalCents: 60000 });
		await completedSession(busy.id, shop.id, { totalCents: 30000 });

		const res = await runShop(createTestServer(), shop, shopAdmin);
		const rows = res.body.singleResult.data.getShopAnalytics.artists;

		expect(rows).toHaveLength(2);
		expect(rows[0].userId).toBe(String(busy.id));
		expect(rows[0].revenueCents).toBe(90000);
		expect(rows[0].completedSessionCount).toBe(2);
		expect(rows[1].revenueCents).toBe(10000);
		// artistId is the Artist DOCUMENT's id, which is what /artist/:artistId routes on - not
		// the User id these rows are keyed by. Linking with the wrong one 404s every time.
		expect(rows[0].artistId).toBeTruthy();
		expect(rows[0].artistId).not.toBe(rows[0].userId);
	});

	it('returns zeroes rather than nulls for a shop with no activity', async () => {
		// An empty shop should read as "nothing happened", not as a broken payload.
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const res = await runShop(createTestServer(), shop, shopAdmin);
		const a = res.body.singleResult.data.getShopAnalytics;

		expect(a.revenueCents).toBe(0);
		expect(a.averageTipCents).toBe(0);
		expect(a.appointmentCount).toBe(0);
		expect(a.artists).toEqual([]);
	});
});

describe('getShopAnalytics: access', () => {
	it('gives Staff the activity figures but nulls every money field', async () => {
		const { shop } = await createShopAdminUser();
		const { user: staff } = await createStaffUser(shop.id);
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop.id);
		await completedSession(artist.id, shop.id, {
			totalCents: 50000,
			tipCents: 5000,
			shopCutCents: 9000,
			shopCutStatus: 'unpaid',
		});

		const res = await runShop(createTestServer(), shop, staff);
		const a = res.body.singleResult.data.getShopAnalytics;

		expect(res.body.singleResult.errors).toBeUndefined();
		// Null, not 0. Zero is a confident, specific, wrong answer to "how much did we make";
		// null renders as an em dash and says nothing, which is the truth here.
		expect(a.revenueCents).toBeNull();
		expect(a.tipsCents).toBeNull();
		expect(a.shopCutOutstandingCents).toBeNull();
		// Activity still comes through in full.
		expect(a.completedSessionCount).toBe(1);
		expect(a.appointmentCount).toBe(1);
		// The per-artist rows are blacked out too - otherwise the totals would be hidden while
		// every artist's individual earnings sat right underneath them.
		expect(a.artists[0].revenueCents).toBeNull();
		expect(a.artists[0].completedSessionCount).toBe(1);
	});

	it("refuses a shop admin reading another shop's books", async () => {
		// Role alone can't express this - a shop admin is a shop admin everywhere. Without the
		// affiliation check it's a one-argument data leak.
		const { shop: shopA } = await createShopAdminUser();
		const { user: adminB } = await createShopAdminUser();

		const res = await runShop(createTestServer(), shopA, adminB);

		expect(res.body.singleResult.data.getShopAnalytics).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});

	it('refuses an artist entirely', async () => {
		const { shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop.id);

		const res = await runShop(createTestServer(), shop, artist);

		// The field is nullable, so a throw inside the resolver nulls the FIELD and reports the
		// error alongside it - `data` itself stays an object. Same shape resourceScoping.test.js
		// already asserts against.
		expect(res.body.singleResult.data.getShopAnalytics).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});

	it('refuses a client entirely', async () => {
		const { shop } = await createShopAdminUser();
		const { user: clientUser } = await createClientUser();

		const res = await runShop(createTestServer(), shop, clientUser);

		expect(res.body.singleResult.data.getShopAnalytics).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});

	it('rejects an inverted range instead of scanning the collection', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const res = await createTestServer().executeOperation(
			{
				query: GET_SHOP_ANALYTICS,
				variables: { shopId: String(shop.id), start: END, end: START },
			},
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		expect(res.body.singleResult.errors[0].message).toMatch(/Errors/);
	});
});

describe('getArtistAnalytics', () => {
	it("gives an artist their own figures over the same definitions", async () => {
		const { shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop.id);
		await completedSession(artist.id, shop.id, { totalCents: 50000, tipCents: 5000 });
		await createAppointment(artist.id, {
			shopId: shop.id,
			appointmentDate: IN_RANGE,
			appointmentStatus: 'scheduled',
			totalCents: 90000,
		});

		const res = await createTestServer().executeOperation(
			{
				query: GET_ARTIST_ANALYTICS,
				variables: { userId: String(artist.id), start: START, end: END },
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);
		const a = res.body.singleResult.data.getArtistAnalytics;

		// The same completed-only rule the shop query applies, from the same code path - that
		// agreement is the entire reason the aggregation is one shared module.
		expect(a.revenueCents).toBe(50000);
		expect(a.tipsCents).toBe(5000);
		expect(a.completedSessionCount).toBe(1);
		// No per-artist breakdown on a single-artist query - it would just restate the totals.
		expect(a.artists).toEqual([]);
	});

	it("refuses one artist reading another artist's figures", async () => {
		const { shop } = await createShopAdminUser();
		const { user: artistA } = await createArtistUser();
		const { user: artistB } = await createArtistUser();
		await connectArtistToShop(artistA.id, shop.id);
		await connectArtistToShop(artistB.id, shop.id);

		const res = await createTestServer().executeOperation(
			{
				query: GET_ARTIST_ANALYTICS,
				variables: { userId: String(artistB.id), start: START, end: END },
			},
			{ contextValue: contextWithToken(signTestToken(artistA)) },
		);

		expect(res.body.singleResult.data.getArtistAnalytics).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});
});
