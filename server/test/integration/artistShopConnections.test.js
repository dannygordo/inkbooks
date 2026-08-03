// Regression tests for connectArtistToShop's tagColor-assignment side effect (see
// mutations/artistShopConnections.js) - the moment an artist actually becomes affiliated with a
// shop is the natural point to guarantee their calendar color won't collide with a shop-mate's,
// rather than waiting for them to notice their own appointments render invisibly and go pick one
// manually in Profile. See utils/tag-color.js for the underlying picking logic (also covered by
// login()'s self-heal - see test/integration/auth.test.js).
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createShopAdminUser } = require('../helpers/factories');
const { DEFAULT_NO_SHOP_TAG_COLOR } = require('../../utils/tag-color');
const User = require('../../models/User');

const CONNECT_ARTIST_TO_SHOP = `
	mutation ConnectArtistToShop($artistId: ID!, $shopId: ID!) {
		connectArtistToShop(artistId: $artistId, shopId: $shopId) {
			id
			artistId
			shopId
			status
		}
	}
`;

describe('connectArtistToShop: tagColor assignment', () => {
	it('assigns a real color to an artist whose tagColor is still the purple "no shop" default', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser({ tagColor: DEFAULT_NO_SHOP_TAG_COLOR });

		const response = await createTestServer().executeOperation(
			{ query: CONNECT_ARTIST_TO_SHOP, variables: { artistId: artist.id, shopId: shop.id } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors } = response.body.singleResult;
		expect(errors).toBeUndefined();

		const stored = await User.findById(artist.id);
		expect(stored.tagColor).toBeTruthy();
	});

	it('assigns a color not already in use by another artist at the same shop', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		// Already connected, sitting on a real, specific color.
		await createArtistUser({ tagColor: '#c69818', artist: { shopId: shop.id } });
		const { user: newArtist } = await createArtistUser({ tagColor: undefined });

		const response = await createTestServer().executeOperation(
			{ query: CONNECT_ARTIST_TO_SHOP, variables: { artistId: newArtist.id, shopId: shop.id } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors } = response.body.singleResult;
		expect(errors).toBeUndefined();

		const stored = await User.findById(newArtist.id);
		expect(stored.tagColor).toBeTruthy();
		expect(stored.tagColor).not.toBe('#c69818');
	});

	it('does not overwrite a tagColor the artist already deliberately chose', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser({ tagColor: '#84b100' });

		const response = await createTestServer().executeOperation(
			{ query: CONNECT_ARTIST_TO_SHOP, variables: { artistId: artist.id, shopId: shop.id } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors } = response.body.singleResult;
		expect(errors).toBeUndefined();

		const stored = await User.findById(artist.id);
		expect(stored.tagColor).toBe('#84b100');
	});
});
