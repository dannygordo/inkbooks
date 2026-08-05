// One source of truth for "which shop does this artist work at", and one active connection.
//
// The app carried two answers to that question for a long time. Artist.shopId was the original
// foreign key; ArtistShopConnection replaced it, but only for authorization - the directories and
// the Artist.shop field resolver were never moved and kept reading the old field. They agreed only
// because createArtistAccount and the seed happened to write both.
//
// connectArtistToShop, the mutation that exists precisely to connect an artist to a shop, writes
// only the connection. So an artist connected that way was authorized at the shop, absent from its
// directory, and - because Artist.shop resolved to null - looked like an INDEPENDENT artist to the
// entire client. The client sets Appointment.shopId from that field, so every appointment they
// booked was written with no shop: no shop cut computed, and the revenue missing from the shop's
// books. Silently, with nothing erroring. The first describe block is that bug.
//
// The second is the invariant that keeps it from coming back: one active connection, enforced on
// the write. That's what makes "which shop" answerable with no precedence rule - and the confirmed
// transfer is what stops it silently moving someone off their shop.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	connectArtistToShop,
} = require('../helpers/factories');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const Artist = require('../../models/Artist');

const CONNECT = `
	mutation Connect($artistId: ID!, $shopId: ID!, $confirmTransfer: Boolean) {
		connectArtistToShop(artistId: $artistId, shopId: $shopId, confirmTransfer: $confirmTransfer) {
			id
			shopId
			status
		}
	}
`;

const GET_ARTISTS = `{ getArtists { id shopId shop { id name } } }`;
const GET_ARTISTS_BY_SHOP = `
	query A($shopId: ID!) { getArtistsByShop(shopId: $shopId) { id } }
`;
const GET_ARTIST = `
	query A($artistId: ID!) { getArtist(artistId: $artistId) { id shopId shop { id name } } }
`;
const GET_USER_TAG_COLORS = `
	query A($shopId: ID!) { getUserTagColors(shopId: $shopId) { id } }
`;

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

describe('a connected artist is visible to their shop', () => {
	// Every one of these fixtures connects ONLY through ArtistShopConnection - no Artist.shopId
	// anywhere - which is exactly the state connectArtistToShop produces and the state that used
	// to be invisible.
	it('appears in the shop directory', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artistUser, artist } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const server = createTestServer();

		const res = await server.executeOperation({ query: GET_ARTISTS }, asUser(shopAdmin));

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.getArtists.map((a) => a.id)).toContain(artist.id);
	});

	it('appears in getArtistsByShop, which feeds the booking flow', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artistUser, artist } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_ARTISTS_BY_SHOP, variables: { shopId: shop.id } },
			asUser(shopAdmin),
		);

		expect(res.body.singleResult.data.getArtistsByShop.map((a) => a.id)).toContain(artist.id);
	});

	it('appears in the shop calendar tag-colour list', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_USER_TAG_COLORS, variables: { shopId: shop.id } },
			asUser(shopAdmin),
		);

		expect(res.body.singleResult.data.getUserTagColors.map((u) => u.id)).toContain(
			String(artistUser.id),
		);
	});

	it('resolves Artist.shop and Artist.shopId from the connection', async () => {
		// The one that caused the money bug. The client reads user.userInfo.shop.id and writes it
		// onto every appointment it creates; a null here meant appointments with no shopId, so no
		// shop cut and no revenue attribution - see utils/artist-shop.js.
		const { shop } = await createShopAdminUser();
		const { user: artistUser, artist } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_ARTIST, variables: { artistId: artist.id } },
			asUser(artistUser),
		);

		const data = res.body.singleResult.data.getArtist;
		expect(data.shop).not.toBeNull();
		expect(data.shop.id).toBe(String(shop.id));
		expect(String(data.shopId)).toBe(String(shop.id));

		// And genuinely derived: Artist has no shopId path at all any more, so there is nothing it
		// could have been read from except the connection.
		const stored = await Artist.findById(artist.id);
		expect(stored.shopId).toBeUndefined();
	});

	it('lets shop staff open a connected artist, and refuses staff at another shop', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { user: staffA } = await createStaffUser(shopA.id);
		const { user: staffB } = await createStaffUser(shopB.id);
		const { user: artistUser, artist } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shopA.id);
		const server = createTestServer();

		const allowed = await server.executeOperation(
			{ query: GET_ARTIST, variables: { artistId: artist.id } },
			asUser(staffA),
		);
		expect(allowed.body.singleResult.errors).toBeUndefined();
		expect(allowed.body.singleResult.data.getArtist.id).toBe(artist.id);

		const refused = await server.executeOperation(
			{ query: GET_ARTIST, variables: { artistId: artist.id } },
			asUser(staffB),
		);
		expect(refused.body.singleResult.data.getArtist).toBeNull();
		expect(refused.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});

	it('leaves an independent artist independent', async () => {
		// Not an edge case - artists with no shop are a stated design goal, and "no connection"
		// has to keep meaning exactly that rather than becoming an error state.
		const { user: artistUser, artist } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_ARTIST, variables: { artistId: artist.id } },
			asUser(artistUser),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.getArtist.shop).toBeNull();
		expect(res.body.singleResult.data.getArtist.shopId).toBeNull();
	});
});

describe('an artist works at one shop at a time', () => {
	it('connects a first shop with no confirmation needed', async () => {
		const { shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: CONNECT, variables: { artistId: artistUser.id, shopId: shop.id } },
			asUser(artistUser),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.connectArtistToShop.status).toBe('active');
	});

	it('refuses a move without confirmation, and names the shop being left', async () => {
		// A message that says "you'll be disconnected from your current shop" without saying WHICH
		// shop isn't a warning anyone can act on, so the refusal carries the names.
		const { shop: oldShop } = await createShopAdminUser({ shop: { name: 'Copper Wolf' } });
		const { shop: newShop } = await createShopAdminUser({ shop: { name: 'Iron Feather' } });
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, oldShop.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: CONNECT, variables: { artistId: artistUser.id, shopId: newShop.id } },
			asUser(artistUser),
		);

		const { errors, data } = res.body.singleResult;
		// connectArtistToShop returns ArtistShopConnection! - non-null - so a thrown error nulls
		// the whole `data`, not just the field.
		expect(data).toBeNull();
		const transfer = errors[0].extensions.transfer;
		expect(transfer.requiresConfirmation).toBe(true);
		expect(transfer.currentShops.map((s) => s.name)).toEqual(['Copper Wolf']);
		expect(transfer.newShop.name).toBe('Iron Feather');
		expect(errors[0].extensions.errors.confirmTransfer).toMatch(/Copper Wolf/);
		expect(errors[0].extensions.errors.confirmTransfer).toMatch(/Iron Feather/);

		// And nothing moved.
		const stillThere = await ArtistShopConnection.findOne({
			artistId: artistUser.id,
			status: 'active',
		});
		expect(String(stillThere.shopId)).toBe(String(oldShop.id));
	});

	it('moves them once confirmed, leaving exactly one active connection', async () => {
		const { shop: oldShop } = await createShopAdminUser();
		const { shop: newShop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, oldShop.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CONNECT,
				variables: { artistId: artistUser.id, shopId: newShop.id, confirmTransfer: true },
			},
			asUser(artistUser),
		);

		expect(res.body.singleResult.errors).toBeUndefined();

		const active = await ArtistShopConnection.find({ artistId: artistUser.id, status: 'active' });
		expect(active).toHaveLength(1);
		expect(String(active[0].shopId)).toBe(String(newShop.id));

		// The old connection is disconnected, not deleted - past appointments written under it
		// stay authorized. See the model's own comment on why the row is kept.
		const old = await ArtistShopConnection.findOne({
			artistId: artistUser.id,
			shopId: oldShop.id,
		});
		expect(old.status).toBe('disconnected');
		expect(old.disconnectedAt).toBeInstanceOf(Date);
	});

	it('makes the new shop the one the whole app sees', async () => {
		const { shop: oldShop } = await createShopAdminUser();
		const { user: newAdmin, shop: newShop } = await createShopAdminUser();
		const { user: artistUser, artist } = await createArtistUser();
		await connectArtistToShop(artistUser.id, oldShop.id);
		const server = createTestServer();

		await server.executeOperation(
			{
				query: CONNECT,
				variables: { artistId: artistUser.id, shopId: newShop.id, confirmTransfer: true },
			},
			asUser(artistUser),
		);

		const res = await server.executeOperation(
			{ query: GET_ARTIST, variables: { artistId: artist.id } },
			asUser(newAdmin),
		);
		expect(res.body.singleResult.data.getArtist.shop.id).toBe(String(newShop.id));

		// And the old shop's directory no longer lists them.
		const oldShopAdmin = await createStaffUser(oldShop.id);
		const oldList = await server.executeOperation(
			{ query: GET_ARTISTS_BY_SHOP, variables: { shopId: oldShop.id } },
			asUser(oldShopAdmin.user),
		);
		expect(oldList.body.singleResult.data.getArtistsByShop.map((a) => a.id)).not.toContain(
			artist.id,
		);
	});

	it('reconnecting to the shop they are already at needs no confirmation', async () => {
		// Only OTHER active connections count as something to leave - re-running a connect against
		// the same shop is a no-op, not a transfer, and shouldn't put a scary dialog in the way.
		const { shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: CONNECT, variables: { artistId: artistUser.id, shopId: shop.id } },
			asUser(artistUser),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		const active = await ArtistShopConnection.find({ artistId: artistUser.id, status: 'active' });
		expect(active).toHaveLength(1);
	});

	it('lets a shop admin move an artist onto their own shop, with the same confirmation', async () => {
		// The other real path: not the artist moving themselves, but the new shop's admin adding
		// someone who is still on the books somewhere else.
		const { shop: oldShop } = await createShopAdminUser({ shop: { name: 'Copper Wolf' } });
		const { user: newAdmin, shop: newShop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, oldShop.id);
		const server = createTestServer();

		const refused = await server.executeOperation(
			{ query: CONNECT, variables: { artistId: artistUser.id, shopId: newShop.id } },
			asUser(newAdmin),
		);
		expect(refused.body.singleResult.errors[0].extensions.transfer.currentShops[0].name).toBe(
			'Copper Wolf',
		);

		const confirmed = await server.executeOperation(
			{
				query: CONNECT,
				variables: { artistId: artistUser.id, shopId: newShop.id, confirmTransfer: true },
			},
			asUser(newAdmin),
		);
		expect(confirmed.body.singleResult.errors).toBeUndefined();
		const active = await ArtistShopConnection.find({ artistId: artistUser.id, status: 'active' });
		expect(active).toHaveLength(1);
	});

	it("refuses a shop admin connecting an artist to somebody else's shop", async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { user: adminB } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CONNECT,
				variables: { artistId: artistUser.id, shopId: shopA.id, confirmTransfer: true },
			},
			asUser(adminB),
		);

		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
		expect(await ArtistShopConnection.countDocuments({ artistId: artistUser.id })).toBe(0);
	});
});
