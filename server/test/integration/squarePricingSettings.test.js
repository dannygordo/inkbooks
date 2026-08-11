// The tax rate and fee offset every charge is computed from - reading them, writing them, and who
// is allowed to. See DECISIONS.md M8 for the owner rule these follow.
//
// These fields had existed on both Shop and Artist since M8 was written with no way to set them,
// so every charge collected $0.00 of tax and nobody could correct it from the app. The tests that
// matter most here are the two about WHICH owner a write lands on: a shop artist's rate belongs to
// the shop, and writing it to their own record would leave two artists in one room billing
// different tax.
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
const Artist = require('../../models/Artist');
const Shop = require('../../models/Shop');

const GET_PRICING = `
	query GetMySquarePricingSettings {
		getMySquarePricingSettings {
			source
			ownerName
			taxRateBasisPoints
			squareFeeOffsetCents
			canEdit
		}
	}
`;

const UPDATE_PRICING = `
	mutation UpdateSquarePricingSettings($taxRateBasisPoints: Int!, $squareFeeOffsetCents: Int!) {
		updateSquarePricingSettings(
			taxRateBasisPoints: $taxRateBasisPoints
			squareFeeOffsetCents: $squareFeeOffsetCents
		) {
			source
			taxRateBasisPoints
			squareFeeOffsetCents
			canEdit
		}
	}
`;

function run(query, user, variables) {
	return createTestServer().executeOperation(
		{ query, variables },
		{ contextValue: contextWithToken(signTestToken(user)) },
	);
}

describe('reading the settings in force', () => {
	it('reports zeros for a fresh independent artist', async () => {
		const { user } = await createArtistUser();

		const { data, errors } = (await run(GET_PRICING, user)).body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getMySquarePricingSettings.source).toBe('artist');
		expect(data.getMySquarePricingSettings.taxRateBasisPoints).toBe(0);
		expect(data.getMySquarePricingSettings.canEdit).toBe(true);
	});

	it('reports the shop\'s figures, and names it, for a connected artist', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		shop.taxRateBasisPoints = 940;
		shop.squareFeeOffsetCents = 600;
		await shop.save();
		await connectArtistToShop(user.id, shop.id);

		const { data } = (await run(GET_PRICING, user)).body.singleResult;
		expect(data.getMySquarePricingSettings.source).toBe('shop');
		expect(data.getMySquarePricingSettings.ownerName).toBe(shop.name);
		expect(data.getMySquarePricingSettings.taxRateBasisPoints).toBe(940);
		expect(data.getMySquarePricingSettings.squareFeeOffsetCents).toBe(600);
	});

	// They can see it - it applies to every charge they take - but not change it.
	it('marks a plain artist at a shop as read-only', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);

		const { data } = (await run(GET_PRICING, user)).body.singleResult;
		expect(data.getMySquarePricingSettings.canEdit).toBe(false);
	});

	it('marks the shop admin as able to edit', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(admin.id, shop.id);

		const { data } = (await run(GET_PRICING, admin)).body.singleResult;
		expect(data.getMySquarePricingSettings.source).toBe('shop');
		expect(data.getMySquarePricingSettings.canEdit).toBe(true);
	});
});

describe('writing to the right owner', () => {
	// THE TEST THIS FILE EXISTS FOR. Tax is destination-based and belongs to the shop's location
	// (M8) - a shop admin's write must land on the SHOP, not on their own Artist record, or two
	// artists in the same room bill different rates.
	it('writes a shop admin\'s change to the shop, not to their own record', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(admin.id, shop.id);

		const { data, errors } = (
			await run(UPDATE_PRICING, admin, { taxRateBasisPoints: 940, squareFeeOffsetCents: 600 })
		).body.singleResult;

		expect(errors).toBeUndefined();
		expect(data.updateSquarePricingSettings.source).toBe('shop');

		const storedShop = await Shop.findById(shop._id);
		expect(storedShop.taxRateBasisPoints).toBe(940);
		expect(storedShop.squareFeeOffsetCents).toBe(600);

		const storedArtist = await Artist.findOne({ userId: admin.id });
		if (storedArtist) {
			expect(storedArtist.taxRateBasisPoints || 0).toBe(0);
		}
	});

	it('writes an independent artist\'s change to their own record', async () => {
		const { user } = await createArtistUser();

		const { data } = (
			await run(UPDATE_PRICING, user, { taxRateBasisPoints: 800, squareFeeOffsetCents: 500 })
		).body.singleResult;

		expect(data.updateSquarePricingSettings.source).toBe('artist');
		const stored = await Artist.findOne({ userId: user.id });
		expect(stored.taxRateBasisPoints).toBe(800);
		expect(stored.squareFeeOffsetCents).toBe(500);
	});

	// The whole reason the rate lives on the shop.
	it('refuses a plain artist at a shop, and changes nothing', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		shop.taxRateBasisPoints = 940;
		await shop.save();
		await connectArtistToShop(user.id, shop.id);

		const { data, errors } = (
			await run(UPDATE_PRICING, user, { taxRateBasisPoints: 0, squareFeeOffsetCents: 0 })
		).body.singleResult;

		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/shop admin/i);

		const storedShop = await Shop.findById(shop._id);
		expect(storedShop.taxRateBasisPoints).toBe(940);
	});

	// An artist who leaves a shop takes their own settings with them, and the shop's stay behind.
	it('switches owner when the artist disconnects from their shop', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		shop.taxRateBasisPoints = 940;
		await shop.save();
		const connection = await connectArtistToShop(user.id, shop.id);

		expect(
			(await run(GET_PRICING, user)).body.singleResult.data.getMySquarePricingSettings.source,
		).toBe('shop');

		const now = new Date();
		connection.status = 'disconnected';
		connection.endedAt = now;
		connection.disconnectedAt = now;
		await connection.save();

		const { data } = (await run(GET_PRICING, user)).body.singleResult;
		expect(data.getMySquarePricingSettings.source).toBe('artist');
		expect(data.getMySquarePricingSettings.taxRateBasisPoints).toBe(0);
		expect(data.getMySquarePricingSettings.canEdit).toBe(true);
	});
});

describe('validation', () => {
	it('refuses a rate above 100%', async () => {
		const { user } = await createArtistUser();

		const { errors } = (
			await run(UPDATE_PRICING, user, { taxRateBasisPoints: 10001, squareFeeOffsetCents: 0 })
		).body.singleResult;

		expect(errors).toBeDefined();
	});

	it('refuses a negative rate', async () => {
		const { user } = await createArtistUser();

		const { errors } = (
			await run(UPDATE_PRICING, user, { taxRateBasisPoints: -1, squareFeeOffsetCents: 0 })
		).body.singleResult;

		expect(errors).toBeDefined();
	});

	// A mistyped offset is far more likely than a real $500/hr one.
	it('refuses an offset above $100 an hour', async () => {
		const { user } = await createArtistUser();

		const { errors } = (
			await run(UPDATE_PRICING, user, { taxRateBasisPoints: 0, squareFeeOffsetCents: 50000 })
		).body.singleResult;

		expect(errors).toBeDefined();
	});

	// Zero is a real configuration - a shop in a state with no sales tax, or an artist choosing not
	// to pass card fees on - and must not be mistaken for "unset".
	it('accepts zero for both', async () => {
		const { user } = await createArtistUser();

		const { data, errors } = (
			await run(UPDATE_PRICING, user, { taxRateBasisPoints: 0, squareFeeOffsetCents: 0 })
		).body.singleResult;

		expect(errors).toBeUndefined();
		expect(data.updateSquarePricingSettings.taxRateBasisPoints).toBe(0);
	});
});

describe('non-artists', () => {
	// Shop staff have no Artist profile and no shop cut - there is nothing here for them to own.
	it('refuses a staff account with no shop of its own to configure', async () => {
		const { user: staffUser } = await createStaffUser();

		const { errors } = (
			await run(UPDATE_PRICING, staffUser, {
				taxRateBasisPoints: 940,
				squareFeeOffsetCents: 600,
			})
		).body.singleResult;

		expect(errors).toBeDefined();
	});
});

/**
 * THE PROPERTY ALL OF THIS EXISTS FOR: what is saved here is what a charge computes from. Asserted
 * against resolveSquareSettings itself rather than by re-reading the model, because that function
 * is what routes/squarePayments.js calls - checking the document would prove the write landed
 * without proving the charge would find it.
 */
describe('what is saved is what is charged', () => {
	it('feeds a saved shop rate straight into the charge settings', async () => {
		const { resolveSquareSettings } = require('../../utils/square-pricing');
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(admin.id, shop.id);

		await run(UPDATE_PRICING, admin, { taxRateBasisPoints: 940, squareFeeOffsetCents: 600 });

		const settings = await resolveSquareSettings(admin.id);
		expect(settings.source).toBe('shop');
		expect(settings.taxRateBasisPoints).toBe(940);
		expect(settings.feeOffsetCents).toBe(600);
	});

	it('feeds a saved independent rate straight into the charge settings', async () => {
		const { resolveSquareSettings } = require('../../utils/square-pricing');
		const { user } = await createArtistUser();

		await run(UPDATE_PRICING, user, { taxRateBasisPoints: 800, squareFeeOffsetCents: 500 });

		const settings = await resolveSquareSettings(user.id);
		expect(settings.source).toBe('artist');
		expect(settings.taxRateBasisPoints).toBe(800);
		expect(settings.feeOffsetCents).toBe(500);
	});
});
