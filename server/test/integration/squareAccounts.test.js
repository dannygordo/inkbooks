// Integration tests for SquareAccount ownership - the model's unique index and the resolution
// helpers in utils/square-account.js. See DECISIONS.md M9.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const mongoose = require('mongoose');
const SquareAccount = require('../../models/SquareAccount');
const {
	resolveSquareOwnerFor,
	resolveSquareAccountFor,
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

describe('owner resolution', () => {
	// The rule M9 exists to enforce. An artist at a shop charges into the SHOP's account, so two
	// artists in the same room cannot end up taking payment into two different Square accounts
	// while billing the shop's tax rate.
	it('resolves to the shop while the artist is connected to one', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);

		const owner = await resolveSquareOwnerFor(user.id);
		expect(owner.ownerType).toBe('SHOP');
		expect(String(owner.ownerId)).toBe(String(shop._id));
		expect(owner.source).toBe('shop');
	});

	// The case that forced the whole decision: an independent artist is an owner in their own
	// right (S2), not an artist with a missing shop.
	it('resolves to the artist themselves when they have no shop', async () => {
		const { user } = await createArtistUser();

		const owner = await resolveSquareOwnerFor(user.id);
		expect(owner.ownerType).toBe('ARTIST');
		expect(String(owner.ownerId)).toBe(String(user.id));
		expect(owner.source).toBe('artist');
	});

	// A2: leaving a shop closes the interval. The account has to follow the artist out, or their
	// next session charges into the account of a shop they no longer work at.
	it('follows the artist back to themselves after they leave the shop', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const connection = await connectArtistToShop(user.id, shop.id);

		expect((await resolveSquareOwnerFor(user.id)).ownerType).toBe('SHOP');

		const now = new Date();
		connection.status = 'disconnected';
		connection.endedAt = now;
		connection.disconnectedAt = now;
		await connection.save();

		const after = await resolveSquareOwnerFor(user.id);
		expect(after.ownerType).toBe('ARTIST');
		expect(String(after.ownerId)).toBe(String(user.id));
	});

	it('follows a transfer to the new shop', async () => {
		const { user } = await createArtistUser();
		const { shop: first } = await createShopAdminUser();
		const { shop: second } = await createShopAdminUser();
		await connectArtistToShop(user.id, first.id);
		await connectArtistToShop(user.id, second.id);

		const owner = await resolveSquareOwnerFor(user.id);
		expect(String(owner.ownerId)).toBe(String(second._id));
	});

	/**
	 * THE INVARIANT M9 RESTS ON. resolveSquareSettings (whose tax rate and fee offset, M8) and
	 * resolveSquareOwnerFor (whose Square account) must never disagree about the owner - a shop
	 * artist billing the shop's tax into their own Square account is exactly the state the
	 * extraction exists to prevent.
	 */
	it('agrees with resolveSquareSettings about who the owner is', async () => {
		const { user: connected } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(connected.id, shop.id);

		const settings = await resolveSquareSettings(connected.id);
		const owner = await resolveSquareOwnerFor(connected.id);
		expect(owner.source).toBe(settings.source);
		expect(String(owner.ownerId)).toBe(String(settings.shopId));

		const { user: independent } = await createArtistUser();
		const independentSettings = await resolveSquareSettings(independent.id);
		const independentOwner = await resolveSquareOwnerFor(independent.id);
		expect(independentOwner.source).toBe(independentSettings.source);
		expect(independentSettings.shopId).toBeNull();
		expect(String(independentOwner.ownerId)).toBe(String(independent.id));
	});
});

describe('resolveSquareAccountFor', () => {
	it('returns a null account when that owner has never connected Square', async () => {
		const { user } = await createArtistUser();

		const resolved = await resolveSquareAccountFor(user.id);
		expect(resolved.ownerType).toBe('ARTIST');
		expect(resolved.account).toBeNull();
	});

	it('returns the shop account for a connected artist', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await new SquareAccount({
			ownerType: 'SHOP',
			ownerId: shop._id,
			connected: true,
			accessTokenEncrypted: 'encrypted:token',
		}).save();

		const resolved = await resolveSquareAccountFor(user.id);
		expect(resolved.account).not.toBeNull();
		expect(String(resolved.account.ownerId)).toBe(String(shop._id));
		expect(SquareAccount.isUsable(resolved.account)).toBe(true);
	});

	// The account belongs to the OWNER, so an artist's own account must not be picked up while
	// they are at a shop that has not connected one. Otherwise a shop's sessions would quietly
	// charge into the artist's personal Square account.
	it('does not fall back to the artist\'s own account while they are at a shop', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(user.id, shop.id);
		await new SquareAccount({
			ownerType: 'ARTIST',
			ownerId: user.id,
			connected: true,
			accessTokenEncrypted: 'encrypted:personal',
		}).save();

		const resolved = await resolveSquareAccountFor(user.id);
		expect(resolved.ownerType).toBe('SHOP');
		expect(resolved.account).toBeNull();
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
