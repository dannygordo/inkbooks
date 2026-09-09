// utils/tag-color.js's pickDefaultTagColor/isUnsetTagColor are exercised extensively already, but
// only indirectly - through the User.tagColor GraphQL field resolver (graphql/resolvers/index.js
// wires ensureTagColor straight to it), via artistShopConnections.test.js's connectArtistToShop
// regression tests and auth.test.js's login/register self-heal tests. Those cover the real-world
// paths (no-shop default, shop-unique assignment, deliberate-choice preserved, self-heal
// idempotency) well. What they never happen to exercise is the palette-exhaustion fallback below -
// nobody's fixture has ever put 15+ colored members on one shop - so this file closes that one
// direct gap rather than duplicating the resolver-level coverage that already exists.
//
// describe/it/expect come from Vitest's `globals: true` config.
const {
	createShopAdminUser,
	createStaffUser,
} = require('../helpers/factories');
const {
	TAG_COLORS,
	DEFAULT_NO_SHOP_TAG_COLOR,
	isUnsetTagColor,
	pickDefaultTagColor,
} = require('../../utils/tag-color');

describe('isUnsetTagColor', () => {
	it('treats undefined, null, empty string, and every white placeholder as unset', () => {
		expect(isUnsetTagColor(undefined)).toBe(true);
		expect(isUnsetTagColor(null)).toBe(true);
		expect(isUnsetTagColor('')).toBe(true);
		expect(isUnsetTagColor('#fff')).toBe(true);
		expect(isUnsetTagColor('#ffffff')).toBe(true);
		expect(isUnsetTagColor('#FFF')).toBe(true);
		expect(isUnsetTagColor('#FFFFFF')).toBe(true);
	});

	it('treats a real palette color, including the no-shop default itself, as set', () => {
		expect(isUnsetTagColor('#c69818')).toBe(false);
		expect(isUnsetTagColor(DEFAULT_NO_SHOP_TAG_COLOR)).toBe(false);
	});
});

describe('pickDefaultTagColor', () => {
	it('returns the no-shop default when there is no shop to be unique within', async () => {
		expect(await pickDefaultTagColor(null, 'irrelevant-user-id')).toBe(DEFAULT_NO_SHOP_TAG_COLOR);
	});

	it('returns the first palette color for a shop with no other members yet', async () => {
		const { shop } = await createShopAdminUser();

		const color = await pickDefaultTagColor(shop._id, 'some-unrelated-user-id');

		expect(color).toBe(TAG_COLORS[0]);
	});

	it('reuses the first color rather than throwing once every palette color is already taken', async () => {
		const { shop } = await createShopAdminUser();
		// One staff member per palette color - by the last one, every TAG_COLORS entry is in use.
		for (const color of TAG_COLORS) {
			// eslint-disable-next-line no-await-in-loop
			await createStaffUser(shop._id, { tagColor: color });
		}

		const color = await pickDefaultTagColor(shop._id, 'a-new-member-not-yet-created');

		// The degradation this comment in utils/tag-color.js accepts: "an actual collision at that
		// point is an acceptable, rare degradation, not a crash."
		expect(TAG_COLORS).toContain(color);
		expect(color).toBe(TAG_COLORS[0]);
	});

	it('excludes the given userId from the collision check, freeing up a color that user themselves is holding', async () => {
		const { shop } = await createShopAdminUser();
		const { user: holderOfFirstColor } = await createStaffUser(shop._id, { tagColor: TAG_COLORS[0] });
		await createStaffUser(shop._id, { tagColor: TAG_COLORS[1] });

		// Excluding the first color's own holder (as pickDefaultTagColor(shopId, excludeUserId) is
		// called when re-evaluating THAT user's own color) frees TAG_COLORS[0] back up, even
		// though it is technically "in use" by the very user being excluded.
		const color = await pickDefaultTagColor(shop._id, holderOfFirstColor._id);

		expect(color).toBe(TAG_COLORS[0]);
	});
});
