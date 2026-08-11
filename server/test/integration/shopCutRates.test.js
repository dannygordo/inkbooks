// The shop cut rate history: who may set it, who may read it, and the rule that a change never
// reaches backwards.
//
// describe/it/expect come from Vitest's `globals: true` config.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	connectArtistToShop,
} = require('../helpers/factories');
const ShopCutRate = require('../../models/ShopCutRate');
const { resolveShopCutPercentAt, setShopCutRate } = require('../../utils/shop-cut');

// Same one-liner the other integration suites use - helpers/auth.js exports the signer, and each
// suite wraps it. Duplicated rather than hoisted because hoisting it is a change to every suite,
// which is not this commit's business.
const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

const SET_RATE = `
	mutation SetShopCutRate($artistId: ID!, $shopId: ID!, $percent: Int!, $effectiveFrom: DateTime) {
		setShopCutRate(artistId: $artistId, shopId: $shopId, percent: $percent, effectiveFrom: $effectiveFrom) {
			id
			percent
			effectiveFrom
		}
	}
`;

const GET_RATES = `
	query GetShopCutRates($artistId: ID!, $shopId: ID!) {
		getShopCutRates(artistId: $artistId, shopId: $shopId) {
			percent
			effectiveFrom
		}
	}
`;

const JAN = new Date('2026-01-01T08:00:00Z');
const JUN = new Date('2026-06-01T08:00:00Z');
const MARCH_SESSION = new Date('2026-03-10T20:00:00Z');
const JULY_SESSION = new Date('2026-07-10T20:00:00Z');

describe('a rate change applies forward only', () => {
	// THE rule (DECISIONS.md M7). It is enforced by the data being append-only rather than by any
	// check, so the test that matters is: record a second rate, and go back and ask about the first
	// period again.

	it('leaves an earlier session on the rate that applied when it happened', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);

		await setShopCutRate({
			artistUserId: artist._id,
			shopId: shop._id,
			percent: 40,
			setByUserId: admin._id,
			effectiveFrom: JAN,
		});
		expect(await resolveShopCutPercentAt(artist._id, shop._id, MARCH_SESSION)).toBe(40);

		// Renegotiated down in June - with no reconnect, which is why the rate cannot live on the
		// membership interval.
		await setShopCutRate({
			artistUserId: artist._id,
			shopId: shop._id,
			percent: 35,
			setByUserId: admin._id,
			effectiveFrom: JUN,
		});

		// March is untouched. July gets the new one.
		expect(await resolveShopCutPercentAt(artist._id, shop._id, MARCH_SESSION)).toBe(40);
		expect(await resolveShopCutPercentAt(artist._id, shop._id, JULY_SESSION)).toBe(35);
	});

	it('treats effectiveFrom as inclusive', async () => {
		// The change day itself uses the new rate. Half-open the other way would leave a one-day
		// hole nobody would find until they reconciled a payout by hand.
		const { user: artist } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await setShopCutRate({
			artistUserId: artist._id,
			shopId: shop._id,
			percent: 35,
			setByUserId: admin._id,
			effectiveFrom: JUN,
		});

		expect(await resolveShopCutPercentAt(artist._id, shop._id, JUN)).toBe(35);
	});

	it('falls back rather than forward for work predating every recorded rate', async () => {
		// A session in May when the history starts in June. May predates anything anyone agreed, so
		// the honest answer is the connection's or the shop's value - NOT the June rate, which had
		// not been agreed yet.
		const { user: artist } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser({ shop: { shopCutPercent: 50 } });
		await connectArtistToShop(artist._id, shop._id);
		await setShopCutRate({
			artistUserId: artist._id,
			shopId: shop._id,
			percent: 35,
			setByUserId: admin._id,
			effectiveFrom: JUN,
		});

		const may = new Date('2026-05-10T20:00:00Z');
		expect(await resolveShopCutPercentAt(artist._id, shop._id, may)).toBe(50);
	});

	it('refuses two rates at the same instant', async () => {
		// Otherwise "the rate that applied" is decided by whichever the index happens to return -
		// silently, and possibly differently on a different day.
		const { user: artist } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		const args = {
			artistUserId: artist._id,
			shopId: shop._id,
			setByUserId: admin._id,
			effectiveFrom: JUN,
		};
		await setShopCutRate({ ...args, percent: 40 });

		await expect(setShopCutRate({ ...args, percent: 35 })).rejects.toThrow(/already exists/i);
	});

	it('refuses a rate change with no author', async () => {
		// A rate is money. The tempting default - the artist it applies to - would be a lie
		// whenever an admin made the change, so this throws rather than defaulting.
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await expect(
			setShopCutRate({ artistUserId: artist._id, shopId: shop._id, percent: 40 }),
		).rejects.toThrow(/auditable/i);
	});
});

describe('who may set a rate', () => {
	it('lets a shop admin at that shop set one', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: SET_RATE,
				variables: { artistId: String(artist._id), shopId: String(shop._id), percent: 40 },
			},
			asUser(admin),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.setShopCutRate.percent).toBe(40);
	});

	it('refuses an artist setting their own cut', async () => {
		// THE case this exists to block. assertCanManageArtist passes an artist for themselves by
		// design, so gating on it alone would have let an artist set their own cut to zero - a
		// party setting the number they owe is not a rate.
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: SET_RATE,
				variables: { artistId: String(artist._id), shopId: String(shop._id), percent: 0 },
			},
			asUser(artist),
		);

		expect(res.body.singleResult.errors).toBeDefined();
		expect(await ShopCutRate.countDocuments({ artistId: artist._id })).toBe(0);
	});

	it('refuses shop staff, who are not admins', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const { user: staff } = await createStaffUser(shop._id);
		await connectArtistToShop(artist._id, shop._id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: SET_RATE,
				variables: { artistId: String(artist._id), shopId: String(shop._id), percent: 10 },
			},
			asUser(staff),
		);

		expect(res.body.singleResult.errors).toBeDefined();
	});

	it('refuses an unauthenticated caller', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: SET_RATE,
				variables: { artistId: String(artist._id), shopId: String(shop._id), percent: 10 },
			},
			{ contextValue: contextWithToken() },
		);

		expect(res.body.singleResult.errors).toBeDefined();
	});
});

describe('who may read a rate', () => {
	it('lets the artist read their own history', async () => {
		// Being charged a percentage you cannot see is worse than the percentage being wrong. The
		// read is deliberately wider than the write.
		const { user: artist } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await setShopCutRate({
			artistUserId: artist._id,
			shopId: shop._id,
			percent: 40,
			setByUserId: admin._id,
			effectiveFrom: JAN,
		});
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_RATES, variables: { artistId: String(artist._id), shopId: String(shop._id) } },
			asUser(artist),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.getShopCutRates).toHaveLength(1);
		expect(res.body.singleResult.data.getShopCutRates[0].percent).toBe(40);
	});

	it('does not let one artist read another artist rate', async () => {
		const { user: artist } = await createArtistUser();
		const { user: other } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await connectArtistToShop(other._id, shop._id);
		await setShopCutRate({
			artistUserId: artist._id,
			shopId: shop._id,
			percent: 40,
			setByUserId: admin._id,
			effectiveFrom: JAN,
		});
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_RATES, variables: { artistId: String(artist._id), shopId: String(shop._id) } },
			asUser(other),
		);

		expect(res.body.singleResult.errors).toBeDefined();
	});

	it('returns newest first', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		for (const [percent, effectiveFrom] of [[40, JAN], [35, JUN]]) {
			await setShopCutRate({
				artistUserId: artist._id,
				shopId: shop._id,
				percent,
				setByUserId: admin._id,
				effectiveFrom,
			});
		}
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_RATES, variables: { artistId: String(artist._id), shopId: String(shop._id) } },
			asUser(admin),
		);

		const rates = res.body.singleResult.data.getShopCutRates;
		expect(rates.map((r) => r.percent)).toEqual([35, 40]);
	});
});
