// DECISIONS.md S2: an unaffiliated artist is their own admin. Anything gated on "shop admin"
// applies only where a shop exists.
//
// The rule was written long before it was implemented, and it was implemented unevenly - the
// ownership checks inside these resolvers were already correct, and a bare `withAuth(fn,
// SHOP_ADMIN)` floor running BEFORE the body meant an independent artist never reached them. So
// these tests come in pairs: the independent artist can now act, and nothing a shop artist could
// not do before has been loosened. The second half of each pair is the one that matters.
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
	createProject,
} = require('../helpers/factories');
const Client = require('../../models/Client');
const Artist = require('../../models/Artist');
const { Constants } = require('../../utils/constants');

const ARCHIVE_CLIENT = `
	mutation ArchiveClient($clientId: ID!) {
		archiveClient(clientId: $clientId) { id status }
	}
`;

const UNARCHIVE_CLIENT = `
	mutation UnarchiveClient($clientId: ID!) {
		unarchiveClient(clientId: $clientId) { id status }
	}
`;

const ARCHIVE_ARTIST = `
	mutation ArchiveArtist($artistId: ID!) {
		archiveArtist(artistId: $artistId) { id status }
	}
`;

function run(query, user, variables) {
	return createTestServer().executeOperation(
		{ query, variables },
		{ contextValue: contextWithToken(signTestToken(user)) },
	);
}

/**
 * "This was refused" - asserted on the FIELD, not on `data`.
 *
 * GraphQL nulls `data` itself only when the failing field is non-nullable; when it is nullable the
 * error propagates no further than the field, and `data` comes back as `{ archiveClient: null }`.
 * archiveClient/archiveArtist return a NULLABLE type, so `expect(data).toBeNull()` fails on a
 * refusal that worked perfectly - which is exactly what it did here.
 *
 * The trap is that the same assertion PASSES on a non-nullable field, so it looks correct
 * everywhere it has been used before. Asserting on the field works either way, and every caller
 * below also checks the stored record is untouched - which is the real claim being made.
 */
function expectRefused(result, field) {
	const { data, errors } = result.body.singleResult;
	expect(errors).toBeDefined();
	if (data !== null && data !== undefined) {
		expect(data[field]).toBeNull();
	}
}

// An independent artist reaches their own client through the work - there is no shop to share.
// See canAccessClient's "an ARTIST is their own shop for this purpose" branch.
async function independentArtistWithClient() {
	const { user } = await createArtistUser();
	const { client } = await createClientUser();
	await createProject(user.id, client._id);
	return { user, client };
}

describe('an independent artist administers their own records', () => {
	// The example DECISIONS.md S2 names by hand: "an independent artist currently cannot archive
	// their own client".
	it('can archive their own client', async () => {
		const { user, client } = await independentArtistWithClient();

		const { data, errors } = (await run(ARCHIVE_CLIENT, user, { clientId: client.id }))
			.body.singleResult;

		expect(errors).toBeUndefined();
		expect(data.archiveClient.status).toBe(Constants.CLIENT_STATUS.ARCHIVED);
	});

	it('can unarchive them again', async () => {
		const { user, client } = await independentArtistWithClient();
		client.status = Constants.CLIENT_STATUS.ARCHIVED;
		await client.save();

		const { data, errors } = (await run(UNARCHIVE_CLIENT, user, { clientId: client.id }))
			.body.singleResult;

		expect(errors).toBeUndefined();
		expect(data.unarchiveClient.status).toBe(Constants.CLIENT_STATUS.ACTIVE);
	});

	it('can archive themselves', async () => {
		const { user, artist } = await createArtistUser();

		const { data, errors } = (await run(ARCHIVE_ARTIST, user, { artistId: artist.id }))
			.body.singleResult;

		expect(errors).toBeUndefined();
		expect(data.archiveArtist.status).toBe(Constants.ARTIST_STATUS.ARCHIVED);
	});
});

describe('nothing else was loosened', () => {
	/**
	 * THE TEST THAT MATTERS MOST. archiveClient's ownership check passes any artist who shares a
	 * shop OR a project with the client - so simply deleting the role floor, which is what
	 * mutations/artists.js could safely do, would have let a plain artist at a shop archive that
	 * shop's clients. assertAdminAuthority keeps the floor wherever a shop exists.
	 */
	it('still refuses a plain artist at a shop archiving a shop client', async () => {
		const { user: artistUser } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const { client } = await createClientUser();
		await createProject(artistUser.id, client._id);

		expectRefused(await run(ARCHIVE_CLIENT, artistUser, { clientId: client.id }), 'archiveClient');

		const stored = await Client.findById(client._id);
		expect(stored.status).not.toBe(Constants.CLIENT_STATUS.ARCHIVED);
	});

	it('still lets the shop admin archive that same client', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const { client } = await createClientUser();
		await createProject(artistUser.id, client._id);
		client.shopIds = [shop._id];
		await client.save();

		const { errors } = (await run(ARCHIVE_CLIENT, admin, { clientId: client.id }))
			.body.singleResult;

		expect(errors).toBeUndefined();
	});

	// An independent artist is their own admin over their OWN data, not over anyone else's.
	it('refuses an independent artist archiving a stranger\'s client', async () => {
		const { user: mine } = await createArtistUser();
		const { user: theirs } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(theirs.id, client._id);

		expectRefused(await run(ARCHIVE_CLIENT, mine, { clientId: client.id }), 'archiveClient');

		const stored = await Client.findById(client._id);
		expect(stored.status).not.toBe(Constants.CLIENT_STATUS.ARCHIVED);
	});

	// Removing the floor from archiveArtist relies entirely on assertCanManageArtist's own
	// `user.role > minRole` branch. If that ever changed, this is what would catch it.
	it('refuses a plain artist archiving a coworker', async () => {
		const { user: mine } = await createArtistUser();
		const { user: theirs, artist: theirArtist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(mine.id, shop.id);
		await connectArtistToShop(theirs.id, shop.id);

		expectRefused(await run(ARCHIVE_ARTIST, mine, { artistId: theirArtist.id }), 'archiveArtist');

		const stored = await Artist.findById(theirArtist._id);
		expect(stored.status).toBe(Constants.ARTIST_STATUS.ACTIVE);
	});
});

describe('hasAdminAuthority', () => {
	const { hasAdminAuthority } = require('../../utils/shop-membership');

	it('is true for a shop admin', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(admin.id, shop.id);

		expect(await hasAdminAuthority({ id: admin.id, role: admin.role })).toBe(true);
	});

	// The whole point: independence is a fact about the database, not something a role number can
	// express.
	it('is true for an artist with no shop', async () => {
		const { user } = await createArtistUser();

		expect(await hasAdminAuthority({ id: user.id, role: user.role })).toBe(true);
	});

	it('is false for an artist who has one', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);

		expect(await hasAdminAuthority({ id: user.id, role: user.role })).toBe(false);
	});

	// A membership is an interval (A2). Leaving a shop makes someone independent again, and the
	// authority follows.
	it('becomes true again once they leave', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const connection = await connectArtistToShop(user.id, shop.id);

		expect(await hasAdminAuthority({ id: user.id, role: user.role })).toBe(false);

		const now = new Date();
		connection.status = 'disconnected';
		connection.endedAt = now;
		connection.disconnectedAt = now;
		await connection.save();

		expect(await hasAdminAuthority({ id: user.id, role: user.role })).toBe(true);
	});
});
