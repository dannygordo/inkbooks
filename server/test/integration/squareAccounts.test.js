// Integration tests for SquareAccount ownership - the model's unique index and the resolution
// helpers in utils/square-account.js. See DECISIONS.md M9.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const mongoose = require('mongoose');
const SquareAccount = require('../../models/SquareAccount');
const {
	resolveArtistChargeAccount,
	findAccountForOwner,
	getOrCreateAccountForOwner,
} = require('../../utils/square-account');
const { resolveSquareSettings } = require('../../utils/square-pricing');
const Shop = require('../../models/Shop');
const {
	createArtistUser,
	createShopAdminUser,
	connectArtistToShop,
} = require('../helpers/factories');

// Mongoose builds indexes in the background on first use, so a duplicate-key assertion can race
// the index into existence and pass for the wrong reason - or fail intermittently, which is worse.
// .init() resolves once the index build has finished. Only this suite needs it: the others assert
// on data, not on the constraint itself.
beforeAll(async () => {
	await SquareAccount.init();
});

/**
 * WHICH ACCOUNT A CLIENT'S CARD IS CHARGED INTO: the artist's own, always.
 *
 * These tests replace a block that asserted the opposite - that a shop artist's charges resolve to
 * the SHOP's account, by analogy with the tax rate. That was wrong and the consequence was severe:
 * the shop received the entire payment and then invoiced the artist for a cut of it, so the shop
 * was paid twice and the artist not at all.
 *
 * A client pays the artist for the work. What the artist owes the shop is a second transaction,
 * settled afterwards through the shop-cut ledger - exactly as it works with cash.
 */
describe('resolveArtistChargeAccount', () => {
	it('returns the artist\'s own account when they are independent', async () => {
		const { user } = await createArtistUser();
		await new SquareAccount({
			ownerType: 'ARTIST',
			ownerId: user.id,
			connected: true,
			accessTokenEncrypted: 'encrypted:own',
		}).save();

		const account = await resolveArtistChargeAccount(user.id);
		expect(account.ownerType).toBe('ARTIST');
		expect(String(account.ownerId)).toBe(String(user.id));
	});

	// THE CORRECTION, stated as directly as it can be.
	it('returns the artist\'s own account when they work at a shop', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await new SquareAccount({
			ownerType: 'ARTIST',
			ownerId: user.id,
			connected: true,
			accessTokenEncrypted: 'encrypted:own',
		}).save();

		const account = await resolveArtistChargeAccount(user.id);
		expect(account.ownerType).toBe('ARTIST');
		expect(String(account.ownerId)).toBe(String(user.id));
	});

	// The fallback that caused the bug. A shop with a connected account must NEVER stand in for an
	// artist who has not connected one - the correct answer is "you cannot take a card yet".
	it('never falls back to the shop, even when the shop is connected', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await new SquareAccount({
			ownerType: 'SHOP',
			ownerId: shop._id,
			connected: true,
			accessTokenEncrypted: 'encrypted:shop',
		}).save();

		expect(await resolveArtistChargeAccount(user.id)).toBeNull();
	});

	it('returns null for an artist who has not connected one', async () => {
		const { user } = await createArtistUser();

		expect(await resolveArtistChargeAccount(user.id)).toBeNull();
	});

	// Leaving a shop changes nothing here, which is the point - it was never the shop's account.
	it('is unchanged by joining or leaving a shop', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await new SquareAccount({
			ownerType: 'ARTIST',
			ownerId: user.id,
			connected: true,
			accessTokenEncrypted: 'encrypted:own',
		}).save();

		const before = await resolveArtistChargeAccount(user.id);
		const connection = await connectArtistToShop(user.id, shop.id);
		const during = await resolveArtistChargeAccount(user.id);

		const now = new Date();
		connection.status = 'disconnected';
		connection.endedAt = now;
		connection.disconnectedAt = now;
		await connection.save();
		const after = await resolveArtistChargeAccount(user.id);

		expect(String(during._id)).toBe(String(before._id));
		expect(String(after._id)).toBe(String(before._id));
	});
});

/**
 * THE TWO QUESTIONS THAT LOOK ALIKE AND ARE NOT.
 *
 * "Whose tax rate applies" is about WHERE THE WORK HAPPENED - destination-based, so it resolves to
 * the shop (M8). "Whose account is charged" is about WHO IS OWED - the artist, always (M9). The
 * same shop is attached to one of them, which is what made conflating them easy, and an earlier
 * version of this file asserted that the two must agree. They must not.
 */
describe('the tax rate and the charge account resolve differently', () => {
	it('bills the shop\'s tax rate into the artist\'s own account', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		shop.taxRateBasisPoints = 940;
		await shop.save();
		await connectArtistToShop(user.id, shop.id);
		await new SquareAccount({
			ownerType: 'ARTIST',
			ownerId: user.id,
			connected: true,
			accessTokenEncrypted: 'encrypted:own',
		}).save();

		const settings = await resolveSquareSettings(user.id);
		const account = await resolveArtistChargeAccount(user.id);

		expect(settings.source).toBe('shop');
		expect(settings.taxRateBasisPoints).toBe(940);
		expect(account.ownerType).toBe('ARTIST');
	});
});

describe('one account per owner', () => {
	it('rejects a second account for the same owner', async () => {
		const ownerId = new mongoose.Types.ObjectId();
		await new SquareAccount({ ownerType: 'SHOP', ownerId }).save();

		await expect(
			new SquareAccount({ ownerType: 'SHOP', ownerId }).save(),
		).rejects.toThrow(/duplicate key/i);
	});

	// The pair is the key, not the id. A shop and an artist can share an id value without
	// colliding - they are different collections.
	it('allows a shop and an artist to hold the same id value', async () => {
		const ownerId = new mongoose.Types.ObjectId();
		await new SquareAccount({ ownerType: 'SHOP', ownerId }).save();
		await new SquareAccount({ ownerType: 'ARTIST', ownerId }).save();

		expect(await SquareAccount.countDocuments({ ownerId })).toBe(2);
	});

	it('refuses an owner type outside the enum', async () => {
		await expect(
			new SquareAccount({ ownerType: 'USER', ownerId: new mongoose.Types.ObjectId() }).save(),
		).rejects.toThrow();
	});
});

describe('getOrCreateAccountForOwner', () => {
	it('creates a disconnected row the first time', async () => {
		const ownerId = new mongoose.Types.ObjectId();

		const account = await getOrCreateAccountForOwner('SHOP', ownerId);
		expect(account.connected).toBe(false);
		expect(SquareAccount.isUsable(account)).toBe(false);
	});

	// The reconnect path. Disconnecting clears this row rather than deleting it, so a second
	// connect finds the emptied document waiting - an insert here would hit the unique index.
	it('reuses the existing row instead of colliding on the index', async () => {
		const ownerId = new mongoose.Types.ObjectId();
		const first = await getOrCreateAccountForOwner('SHOP', ownerId);
		const second = await getOrCreateAccountForOwner('SHOP', ownerId);

		expect(String(second._id)).toBe(String(first._id));
		expect(await SquareAccount.countDocuments({ ownerType: 'SHOP', ownerId })).toBe(1);
	});

	// $setOnInsert, not $set: a re-run must not knock a live connection back to disconnected.
	it('does not reset a live connection when called again', async () => {
		const ownerId = new mongoose.Types.ObjectId();
		const account = await getOrCreateAccountForOwner('SHOP', ownerId);
		account.connected = true;
		account.accessTokenEncrypted = 'encrypted:token';
		await account.save();

		const again = await getOrCreateAccountForOwner('SHOP', ownerId);
		expect(again.connected).toBe(true);
		expect(again.accessTokenEncrypted).toBe('encrypted:token');
	});
});

describe('findAccountForOwner', () => {
	it('returns null rather than throwing when the owner is missing', async () => {
		expect(await findAccountForOwner(null, null)).toBeNull();
		expect(await findAccountForOwner('SHOP', null)).toBeNull();
	});

	it('does not return one owner\'s account to another', async () => {
		const { shop: mine } = await createShopAdminUser();
		const { shop: theirs } = await createShopAdminUser();
		await new SquareAccount({
			ownerType: 'SHOP',
			ownerId: theirs._id,
			connected: true,
			accessTokenEncrypted: 'encrypted:theirs',
		}).save();

		expect(await findAccountForOwner('SHOP', mine._id)).toBeNull();
		expect(await Shop.exists({ _id: mine._id })).toBeTruthy();
	});
});
