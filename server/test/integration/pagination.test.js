// Pagination, and the appointment filter that replaced fetch-everything-and-slice.
//
// Before this, no list query had a bound. getAppointmentsByShop returned every appointment a shop
// had ever had so the browser could filter down to the thirty days on screen, and the artist
// dashboard downloaded an artist's entire career to render two lists of five - upcoming, recently
// completed, payout candidates, all four client-side passes over one fat array.
//
// That's why the filter takes the shapes it does rather than the queries just growing a limit:
// "the next few" and "page one of everything, sorted by date" are different questions, and only
// one of them is what a dashboard wants.
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
} = require('../helpers/factories');
const { normalizePage, paginate, paginateArray, MAX_LIMIT } = require('../../utils/pagination');
const Client = require('../../models/Client');

const GET_CLIENTS = `
	query A($page: PageInput) {
		getClients(page: $page) {
			items { id lastName }
			pageInfo { totalCount hasMore limit offset }
		}
	}
`;

const GET_APPOINTMENTS_BY_ARTIST = `
	query A($userId: ID!, $filter: AppointmentFilter, $page: PageInput) {
		getAppointmentsByArtist(userId: $userId, filter: $filter, page: $page) {
			items { id appointmentDate appointmentStatus shopCutStatus }
			pageInfo { totalCount hasMore }
		}
	}
`;

const GET_APPOINTMENTS_BY_SHOP = `
	query A($shopId: ID!, $filter: AppointmentFilter) {
		getAppointmentsByShop(shopId: $shopId, filter: $filter) {
			items { id }
			pageInfo { totalCount }
		}
	}
`;

const GET_PAYOUT_CANDIDATES = `
	query A($userId: ID!) { getShopCutPayoutCandidates(userId: $userId) { id shopCutCents } }
`;

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe('normalizePage', () => {
	it('defaults to a bounded page rather than everything', () => {
		// The whole point. A caller that forgets to page must not get the collection.
		expect(normalizePage(undefined).limit).toBe(50);
		expect(normalizePage({}).limit).toBe(50);
	});

	it('clamps an over-large limit instead of refusing it', () => {
		// "Give me everything" is a reasonable thing to mean; a bounded answer plus hasMore is a
		// reasonable thing to give back.
		expect(normalizePage({ limit: 100000 }).limit).toBe(MAX_LIMIT);
	});

	it('refuses a nonsensical limit or offset rather than quietly fixing it', () => {
		// A negative limit means the caller computed something wrong. Silently returning 50 rows
		// hides the bug at the exact moment it would be cheapest to notice.
		expect(() => normalizePage({ limit: -5 })).toThrow();
		expect(() => normalizePage({ limit: 0 })).toThrow();
		expect(() => normalizePage({ offset: -1 })).toThrow();
		expect(() => normalizePage({ limit: 2.5 })).toThrow();
	});
});

describe('paginate', () => {
	it('reports hasMore from the count, not from a full page', async () => {
		// items.length === limit would claim there's more on an exactly-full final page - the
		// off-by-one that puts a dead "next" button on every list whose size divides evenly.
		const { shop } = await createShopAdminUser();
		for (let i = 0; i < 6; i += 1) {
			await createClientUser({ client: { shopIds: [shop._id] } });
		}

		const middle = await paginate(Client, { shopIds: shop._id }, { page: { limit: 3, offset: 0 } });
		expect(middle.items).toHaveLength(3);
		expect(middle.pageInfo.totalCount).toBe(6);
		expect(middle.pageInfo.hasMore).toBe(true);

		const last = await paginate(Client, { shopIds: shop._id }, { page: { limit: 3, offset: 3 } });
		expect(last.items).toHaveLength(3);
		expect(last.pageInfo.hasMore).toBe(false);
	});

	it('gives an empty page rather than an error past the end', async () => {
		const { shop } = await createShopAdminUser();
		await createClientUser({ client: { shopIds: [shop._id] } });

		const page = await paginate(Client, { shopIds: shop._id }, { page: { limit: 10, offset: 99 } });
		expect(page.items).toEqual([]);
		expect(page.pageInfo.totalCount).toBe(1);
		expect(page.pageInfo.hasMore).toBe(false);
	});

	it('paginateArray reports the same shape', () => {
		const page = paginateArray([1, 2, 3, 4, 5], { limit: 2, offset: 2 });
		expect(page.items).toEqual([3, 4]);
		expect(page.pageInfo).toEqual({ totalCount: 5, hasMore: true, limit: 2, offset: 2 });
	});
});

describe('getClients: pages, and reports the total', () => {
	it('returns one page plus a count of everything behind it', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		for (let i = 0; i < 5; i += 1) {
			await createClientUser({ client: { shopIds: [shop._id] } });
		}
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_CLIENTS, variables: { page: { limit: 2, offset: 0 } } },
			asUser(shopAdmin),
		);

		const { items, pageInfo } = res.body.singleResult.data.getClients;
		expect(items).toHaveLength(2);
		// The count is the reason a directory can say "1,247 clients" instead of "2".
		expect(pageInfo.totalCount).toBe(5);
		expect(pageInfo.hasMore).toBe(true);
	});

	it('echoes back the limit it actually used', async () => {
		// Not the one that was asked for - an over-large request is clamped, and a caller that
		// didn't know would page wrongly forever.
		const { user: shopAdmin } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_CLIENTS, variables: { page: { limit: 100000, offset: 0 } } },
			asUser(shopAdmin),
		);

		expect(res.body.singleResult.data.getClients.pageInfo.limit).toBe(MAX_LIMIT);
	});
});

describe('the appointment filter answers the questions the dashboard actually asks', () => {
	/**
	 * One artist with a spread of history: two future, two past-completed, one past-completed and
	 * owing the shop. Enough that a filter returning the wrong set returns a visibly wrong set,
	 * rather than coincidentally the right one.
	 */
	async function artistWithHistory() {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);

		const future1 = await createAppointment(artistUser.id, {
			shopId: shop._id,
			appointmentDate: daysFromNow(3),
			appointmentStatus: 'scheduled',
		});
		const future2 = await createAppointment(artistUser.id, {
			shopId: shop._id,
			appointmentDate: daysFromNow(10),
			appointmentStatus: 'scheduled',
		});
		const past1 = await createAppointment(artistUser.id, {
			shopId: shop._id,
			appointmentDate: daysFromNow(-5),
			appointmentStatus: 'completed',
			shopCutStatus: 'paid',
		});
		const past2 = await createAppointment(artistUser.id, {
			shopId: shop._id,
			appointmentDate: daysFromNow(-30),
			appointmentStatus: 'completed',
			shopCutStatus: 'paid',
		});
		const owing = await createAppointment(artistUser.id, {
			shopId: shop._id,
			appointmentDate: daysFromNow(-2),
			appointmentStatus: 'completed',
			shopCutStatus: 'unpaid',
			shopCutCents: 5000,
		});
		return { shopAdmin, shop, artistUser, future1, future2, past1, past2, owing };
	}

	it('upcomingOnly returns what is ahead, soonest first', async () => {
		const { artistUser, future1, future2 } = await artistWithHistory();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: GET_APPOINTMENTS_BY_ARTIST,
				variables: { userId: artistUser.id, filter: { upcomingOnly: true }, page: { limit: 5 } },
			},
			asUser(artistUser),
		);

		const ids = res.body.singleResult.data.getAppointmentsByArtist.items.map((a) => a.id);
		// Soonest first: the near end is the useful end of a pending list.
		expect(ids).toEqual([future1.id, future2.id]);
	});

	it('resolves upcomingOnly against the moment the query runs', async () => {
		// Not against a timestamp the client computed when it rendered. A dashboard left open, or
		// a cached response, would otherwise keep showing an appointment that has already happened.
		const { artistUser } = await artistWithHistory();
		await createAppointment(artistUser.id, {
			appointmentDate: new Date(Date.now() - 1000),
			appointmentStatus: 'scheduled',
		});
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: GET_APPOINTMENTS_BY_ARTIST,
				variables: { userId: artistUser.id, filter: { upcomingOnly: true } },
			},
			asUser(artistUser),
		);

		const dates = res.body.singleResult.data.getAppointmentsByArtist.items.map(
			(a) => new Date(a.appointmentDate),
		);
		dates.forEach((d) => expect(d.getTime()).toBeGreaterThan(Date.now() - 60000));
	});

	it('filters to completed, most recent first', async () => {
		const { artistUser, past1, owing } = await artistWithHistory();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: GET_APPOINTMENTS_BY_ARTIST,
				variables: {
					userId: artistUser.id,
					filter: { appointmentStatus: 'completed' },
					page: { limit: 2 },
				},
			},
			asUser(artistUser),
		);

		const { items, pageInfo } = res.body.singleResult.data.getAppointmentsByArtist;
		// Newest-first, and the page is a page: three completed exist, two came back.
		expect(items.map((a) => a.id)).toEqual([owing.id, past1.id]);
		expect(pageInfo.totalCount).toBe(3);
		expect(pageInfo.hasMore).toBe(true);
	});

	it('bounds the shop calendar to a date range', async () => {
		// The change that stops a shop shipping its entire appointment history to draw one month.
		const { shopAdmin, shop, future1, future2 } = await artistWithHistory();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: GET_APPOINTMENTS_BY_SHOP,
				variables: {
					shopId: shop.id,
					filter: { from: daysFromNow(1).toISOString(), to: daysFromNow(20).toISOString() },
				},
			},
			asUser(shopAdmin),
		);

		const { items, pageInfo } = res.body.singleResult.data.getAppointmentsByShop;
		expect(items.map((a) => a.id).sort()).toEqual([future1.id, future2.id].sort());
		// Five exist for this shop; the range is what excluded the rest, not a page.
		expect(pageInfo.totalCount).toBe(2);
	});

	it('treats the range as half-open, so adjacent months do not both claim a boundary day', async () => {
		const { shopAdmin, shop, artistUser } = await artistWithHistory();
		const boundary = daysFromNow(50);
		const onBoundary = await createAppointment(artistUser.id, {
			shopId: shop._id,
			appointmentDate: boundary,
		});
		const server = createTestServer();

		const excluded = await server.executeOperation(
			{
				query: GET_APPOINTMENTS_BY_SHOP,
				variables: {
					shopId: shop.id,
					filter: { from: daysFromNow(40).toISOString(), to: boundary.toISOString() },
				},
			},
			asUser(shopAdmin),
		);
		expect(excluded.body.singleResult.data.getAppointmentsByShop.items.map((a) => a.id)).not.toContain(
			onBoundary.id,
		);

		const included = await server.executeOperation(
			{
				query: GET_APPOINTMENTS_BY_SHOP,
				variables: {
					shopId: shop.id,
					filter: { from: boundary.toISOString(), to: daysFromNow(60).toISOString() },
				},
			},
			asUser(shopAdmin),
		);
		expect(included.body.singleResult.data.getAppointmentsByShop.items.map((a) => a.id)).toContain(
			onBoundary.id,
		);
	});
});

describe('the payout list is deliberately not paginated', () => {
	it('returns everything owed, in one array', async () => {
		// The task is settling a debt, not browsing history - and a batch "invoice all" over a
		// paged list is ambiguous about what it covers, in a way that costs money.
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		for (let i = 0; i < 12; i += 1) {
			await createAppointment(artistUser.id, {
				shopId: shop._id,
				appointmentStatus: 'completed',
				shopCutStatus: 'unpaid',
				shopCutCents: 1000,
			});
		}
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_PAYOUT_CANDIDATES, variables: { userId: artistUser.id } },
			asUser(shopAdmin),
		);

		expect(res.body.singleResult.data.getShopCutPayoutCandidates).toHaveLength(12);
	});

	it('excludes cuts that already have an action in flight', async () => {
		// invoice_sent and pending_confirmation are mid-flow. Listing them here would invite
		// invoicing the same session twice.
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const unpaid = await createAppointment(artistUser.id, {
			shopId: shop._id,
			appointmentStatus: 'completed',
			shopCutStatus: 'unpaid',
		});
		await createAppointment(artistUser.id, {
			shopId: shop._id,
			appointmentStatus: 'completed',
			shopCutStatus: 'invoice_sent',
		});
		await createAppointment(artistUser.id, {
			shopId: shop._id,
			appointmentStatus: 'completed',
			shopCutStatus: 'pending_confirmation',
		});
		// Not completed yet - nothing is owed until the session happened.
		await createAppointment(artistUser.id, {
			shopId: shop._id,
			appointmentStatus: 'scheduled',
			shopCutStatus: 'unpaid',
		});
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_PAYOUT_CANDIDATES, variables: { userId: artistUser.id } },
			asUser(shopAdmin),
		);

		const ids = res.body.singleResult.data.getShopCutPayoutCandidates.map((a) => a.id);
		expect(ids).toEqual([unpaid.id]);
	});

	it("refuses a shop admin reading another shop's artist", async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { user: adminB } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shopA.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_PAYOUT_CANDIDATES, variables: { userId: artistUser.id } },
			asUser(adminB),
		);

		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});
});
