// Integration tests for the User.tagColor field resolver's self-heal (see graphql/resolvers/
// index.js and utils/tag-color.js's ensureTagColor).
//
// The gap these cover: there were already two tagColor guarantees - one at connectArtistToShop
// (artistShopConnections.test.js) and one at login (auth.test.js) - and both were still
// insufficient in the one place it mattered most. A shop calendar renders every shop-mate's
// appointments via getAppointmentsByShop, so the artist doing the looking sees labels for artists
// who may not have logged in since the default was fixed. Healing the viewer does nothing for the
// people being viewed, and their labels rendered as white-on-white - which reads as "the
// appointment is missing", not as "the color is wrong".
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	connectArtistToShop,
	createAppointment,
} = require('../helpers/factories');
const User = require('../../models/User');

const GET_APPOINTMENTS_BY_SHOP = `
	query GetAppointmentsByShop($shopId: ID!) {
		getAppointmentsByShop(shopId: $shopId) {
			id
			user {
				id
				tagColor
			}
		}
	}
`;

describe('User.tagColor resolver: self-heal on read', () => {
	it("assigns a real color to another artist who never logged in, rather than returning white", async () => {
		const { shop } = await createShopAdminUser();
		// The artist doing the looking - already has a deliberate color.
		const { user: viewer } = await createArtistUser({ tagColor: '#2ea2dc' });
		// The artist being looked AT - stuck on the old hardcoded white default. This is the
		// account that rendered invisibly.
		const { user: stale } = await createArtistUser({ tagColor: '#fff' });
		await connectArtistToShop(viewer.id, shop.id);
		await connectArtistToShop(stale.id, shop.id);
		await createAppointment(stale.id, { shopId: shop.id });

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_SHOP, variables: { shopId: String(shop.id) } },
			{ contextValue: contextWithToken(signTestToken(viewer)) },
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		const returned = res.body.singleResult.data.getAppointmentsByShop[0].user.tagColor;
		expect(returned).toBeTruthy();
		expect(['#fff', '#ffffff', '#FFF', '#FFFFFF']).not.toContain(returned);
		// Unique within the shop - must not be handed the viewer's own color.
		expect(returned).not.toBe('#2ea2dc');
	});

	it('persists the healed color, so the fix survives past the request that triggered it', async () => {
		const { shop } = await createShopAdminUser();
		const { user: viewer } = await createArtistUser({ tagColor: '#2ea2dc' });
		const { user: stale } = await createArtistUser({ tagColor: undefined });
		await connectArtistToShop(viewer.id, shop.id);
		await connectArtistToShop(stale.id, shop.id);
		await createAppointment(stale.id, { shopId: shop.id });

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_SHOP, variables: { shopId: String(shop.id) } },
			{ contextValue: contextWithToken(signTestToken(viewer)) },
		);
		const returned = res.body.singleResult.data.getAppointmentsByShop[0].user.tagColor;

		// The point of writing back rather than computing on every read: the stored document is
		// actually repaired, so this converges instead of recomputing forever.
		const stored = await User.findById(stale.id);
		expect(stored.tagColor).toBe(returned);
	});

	it('leaves a color the artist deliberately chose completely alone', async () => {
		const { shop } = await createShopAdminUser();
		const { user: viewer } = await createArtistUser({ tagColor: '#2ea2dc' });
		// Deliberately the SAME color as the viewer's. A real choice is never overridden, even
		// when it collides with a shop-mate - this is about repairing a bad default, not policing
		// people's picks. See utils/tag-color.js's own comment on that distinction.
		const { user: chosen } = await createArtistUser({ tagColor: '#2ea2dc' });
		await connectArtistToShop(viewer.id, shop.id);
		await connectArtistToShop(chosen.id, shop.id);
		await createAppointment(chosen.id, { shopId: shop.id });

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: GET_APPOINTMENTS_BY_SHOP, variables: { shopId: String(shop.id) } },
			{ contextValue: contextWithToken(signTestToken(viewer)) },
		);

		expect(res.body.singleResult.data.getAppointmentsByShop[0].user.tagColor).toBe('#2ea2dc');
		const stored = await User.findById(chosen.id);
		expect(stored.tagColor).toBe('#2ea2dc');
	});
});
