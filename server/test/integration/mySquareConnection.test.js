// The artist-facing half of the Square connection: getMySquareConnection,
// getMySquareAuthorizationUrl and disconnectMySquare. See DECISIONS.md M9.
//
// The account these operate on is the artist's OWN, always - the one their clients pay into. The
// thing most worth pinning is that a shop artist is treated no differently, because an earlier
// version resolved their charges to the shop's account and this file asserted that behaviour.
// The shop's account exists to RECEIVE their cut invoices afterwards, which is a separate
// transaction and a separate account.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	connectArtistToShop,
} = require('../helpers/factories');
const SquareAccount = require('../../models/SquareAccount');

const MY_SQUARE_CONNECTION = `
	query GetMySquareConnection {
		getMySquareConnection {
			source
			connected
			locationId
			connectedAt
			ownerName
		}
	}
`;

const DISCONNECT_MY_SQUARE = `
	mutation DisconnectMySquare {
		disconnectMySquare {
			source
			connected
		}
	}
`;

const MY_SQUARE_AUTHORIZATION_URL = `
	query GetMySquareAuthorizationUrl {
		getMySquareAuthorizationUrl
	}
`;

async function connectSquareFor(ownerType, ownerId, overrides = {}) {
	return new SquareAccount({
		ownerType,
		ownerId,
		connected: true,
		merchantId: 'M_TEST',
		locationId: 'L_TEST',
		accessTokenEncrypted: 'encrypted:token',
		connectedAt: new Date('2026-01-09T00:00:00.000Z'),
		...overrides,
	}).save();
}

function run(query, user) {
	return createTestServer().executeOperation(
		{ query },
		{ contextValue: contextWithToken(signTestToken(user)) },
	);
}

describe('getMySquareConnection', () => {
	it('reports an independent artist as their own owner', async () => {
		const { user } = await createArtistUser();

		const { data, errors } = (await run(MY_SQUARE_CONNECTION, user)).body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getMySquareConnection.source).toBe('artist');
		expect(data.getMySquareConnection.connected).toBe(false);
		expect(data.getMySquareConnection.ownerName).toBeNull();
	});

	it('reports their own connection once they have one', async () => {
		const { user } = await createArtistUser();
		await connectSquareFor('ARTIST', user.id);

		const { data } = (await run(MY_SQUARE_CONNECTION, user)).body.singleResult;
		expect(data.getMySquareConnection.source).toBe('artist');
		expect(data.getMySquareConnection.connected).toBe(true);
		expect(data.getMySquareConnection.locationId).toBe('L_TEST');
	});

	/**
	 * THE CORRECTION. This block asserted the opposite - that a shop artist's connection resolves
	 * to the SHOP and is reported with the shop's name. It followed from the charge routing being
	 * wrong, and the consequence was that the shop received the whole payment and then invoiced the
	 * artist for a cut of it.
	 *
	 * A client pays the artist. The shop's account is a different thing entirely: it is what
	 * RECEIVES the cut invoices afterwards.
	 */
	it('reports the artist\'s OWN account even when they work at a shop', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await connectSquareFor('ARTIST', user.id);

		const { data } = (await run(MY_SQUARE_CONNECTION, user)).body.singleResult;
		expect(data.getMySquareConnection.source).toBe('artist');
		expect(data.getMySquareConnection.connected).toBe(true);
		expect(data.getMySquareConnection.ownerName).toBeNull();
	});

	// A connected SHOP does not make a shop artist connected. They need their own, and until they
	// have one the honest answer is that they cannot take a card.
	it('does not report a shop connection as the artist\'s own', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await connectSquareFor('SHOP', shop._id);

		const { data } = (await run(MY_SQUARE_CONNECTION, user)).body.singleResult;
		expect(data.getMySquareConnection.source).toBe('artist');
		expect(data.getMySquareConnection.connected).toBe(false);
	});

	// isUsable, not `connected` - a half-failed OAuth callback leaves the boolean true with no
	// token, and reporting that as connected sends the artist off to debug a payment failure.
	it('does not call a tokenless account connected', async () => {
		const { user } = await createArtistUser();
		await connectSquareFor('ARTIST', user.id, { accessTokenEncrypted: undefined });

		const { data } = (await run(MY_SQUARE_CONNECTION, user)).body.singleResult;
		expect(data.getMySquareConnection.connected).toBe(false);
	});
});

describe('disconnectMySquare', () => {
	it('clears the artist\'s own connection', async () => {
		const { user } = await createArtistUser();
		await connectSquareFor('ARTIST', user.id);

		const { data, errors } = (await run(DISCONNECT_MY_SQUARE, user)).body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.disconnectMySquare.connected).toBe(false);

		const stored = await SquareAccount.findOne({ ownerType: 'ARTIST', ownerId: user.id });
		expect(stored.connected).toBe(false);
		expect(stored.accessTokenEncrypted).toBeUndefined();
		expect(stored.refreshTokenEncrypted).toBeUndefined();
	});

	// CLEARED, not deleted - a reconnect writes back into this row, and the unique index would
	// reject a second one.
	it('keeps the row so a reconnect has somewhere to go', async () => {
		const { user } = await createArtistUser();
		await connectSquareFor('ARTIST', user.id);

		await run(DISCONNECT_MY_SQUARE, user);

		expect(await SquareAccount.countDocuments({ ownerType: 'ARTIST', ownerId: user.id })).toBe(1);
	});

	// Used to be refused, back when a shop artist's charges resolved to the shop. It is their own
	// account and always was.
	it('clears the account of an artist who works at a shop', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await connectSquareFor('ARTIST', user.id);
		await connectSquareFor('SHOP', shop._id);

		const { data, errors } = (await run(DISCONNECT_MY_SQUARE, user)).body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.disconnectMySquare.connected).toBe(false);

		const own = await SquareAccount.findOne({ ownerType: 'ARTIST', ownerId: user.id });
		expect(own.connected).toBe(false);

		// And the SHOP's account - which receives their cut invoices - is untouched.
		const shopAccount = await SquareAccount.findOne({ ownerType: 'SHOP', ownerId: shop._id });
		expect(shopAccount.connected).toBe(true);
		expect(shopAccount.accessTokenEncrypted).toBe('encrypted:token');
	});

	it('is a no-op, not an error, for an artist who never connected', async () => {
		const { user } = await createArtistUser();

		const { data, errors } = (await run(DISCONNECT_MY_SQUARE, user)).body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.disconnectMySquare.connected).toBe(false);
	});
});

describe('getMySquareAuthorizationUrl', () => {
	/**
	 * These are the first tests to reach buildAuthorizationUrl at all.
	 *
	 * The block they replaced asserted a REFUSAL - a shop artist being turned away - so it never
	 * got as far as building a URL, and the Square app credentials were never needed. Now that
	 * every artist is offered the handshake, they are, and globalSetup does not set them: they are
	 * real secrets that belong in .env, not in a test harness.
	 *
	 * Set and restored per test rather than globally, so nothing else in the process inherits a
	 * Square configuration it did not ask for.
	 */
	const SQUARE_ENV = {
		SQUARE_APPLICATION_ID: 'test-square-application-id',
		SQUARE_APPLICATION_SECRET: 'test-square-application-secret',
		SQUARE_OAUTH_REDIRECT_URL: 'https://api.inkbooks.test/square/oauth/callback',
	};
	let saved;

	beforeEach(() => {
		saved = {};
		for (const [key, value] of Object.entries(SQUARE_ENV)) {
			saved[key] = process.env[key];
			process.env[key] = value;
		}
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	// Every artist connects their own account. This used to refuse anyone at a shop, which is
	// exactly backwards - a shop artist needs one as much as an independent artist does, because
	// their clients pay them directly.
	it('is offered to an artist who works at a shop', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);

		const { data, errors } = (await run(MY_SQUARE_AUTHORIZATION_URL, user)).body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getMySquareAuthorizationUrl).toMatch(/oauth2\/authorize/);
	});

	it('is offered to an independent artist too', async () => {
		const { user } = await createArtistUser();

		const { data, errors } = (await run(MY_SQUARE_AUTHORIZATION_URL, user)).body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getMySquareAuthorizationUrl).toMatch(/oauth2\/authorize/);
	});

	// The signed state is the only thing stopping someone attaching their own Square account to
	// another owner (see routes/squareOAuth.js). Worth asserting now that a URL is actually built:
	// nothing else in the suite exercises this.
	it('carries a signed state token bound to the caller', async () => {
		const { user } = await createArtistUser();

		const { data } = (await run(MY_SQUARE_AUTHORIZATION_URL, user)).body.singleResult;
		const state = new URL(data.getMySquareAuthorizationUrl).searchParams.get('state');
		expect(state).toBeTruthy();

		const jwt = require('jsonwebtoken');
		const decoded = jwt.verify(state, process.env.SECRET_KEY);
		expect(decoded.ownerType).toBe('ARTIST');
		expect(decoded.ownerId).toBe(String(user.id));
	});
});
