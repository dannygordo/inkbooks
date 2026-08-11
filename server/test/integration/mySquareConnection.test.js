// The artist-facing half of the Square connection: getMySquareConnection,
// getMySquareAuthorizationUrl and disconnectMySquare. See DECISIONS.md M9.
//
// These exist because M9 is only half-implemented without them. The extraction gave an
// independent artist an account they could own; these are the operations that let them reach it,
// and the thing most worth pinning is what happens to an artist who is NOT independent - every
// one of the three has to refuse or redirect rather than quietly acting on the wrong owner.
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

	// The answer to "where does my money go" for a shop artist, which is the whole reason this
	// query returns a source rather than just a boolean.
	it('reports the SHOP as owner for a connected artist, and names it', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await connectSquareFor('SHOP', shop._id);

		const { data } = (await run(MY_SQUARE_CONNECTION, user)).body.singleResult;
		expect(data.getMySquareConnection.source).toBe('shop');
		expect(data.getMySquareConnection.connected).toBe(true);
		expect(data.getMySquareConnection.ownerName).toBe(shop.name);
	});

	// The state where an artist would otherwise think it was theirs to fix.
	it('reports the shop as owner even when the shop has not connected', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);

		const { data } = (await run(MY_SQUARE_CONNECTION, user)).body.singleResult;
		expect(data.getMySquareConnection.source).toBe('shop');
		expect(data.getMySquareConnection.connected).toBe(false);
		expect(data.getMySquareConnection.ownerName).toBe(shop.name);
	});

	// An artist's personal account must not be reported while a shop owns their charges - it would
	// read as "you are set up" while their sessions charge somewhere else entirely.
	it('ignores the artist\'s own account while a shop owns their charges', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await connectSquareFor('ARTIST', user.id);

		const { data } = (await run(MY_SQUARE_CONNECTION, user)).body.singleResult;
		expect(data.getMySquareConnection.source).toBe('shop');
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

	// Succeeding here would report "Disconnected" while their sessions carried on charging into
	// the shop's account.
	it('refuses an artist whose shop holds the connection', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await connectSquareFor('SHOP', shop._id);

		const { data, errors } = (await run(DISCONNECT_MY_SQUARE, user)).body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.square).toMatch(/shop admin/i);

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
	// A personal account for a shop artist would be a connection nothing routes to, sitting there
	// looking like it works - so the refusal is the feature, not a missing capability.
	it('refuses an artist who is currently at a shop', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);

		const { data, errors } = (await run(MY_SQUARE_AUTHORIZATION_URL, user)).body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.square).toMatch(/shop/i);
	});
});
