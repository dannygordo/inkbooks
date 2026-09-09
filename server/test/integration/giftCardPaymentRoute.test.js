// Integration tests for the real Express route at routes/squarePayments.js's
// process-gift-card-payment endpoint, using supertest against a minimal app that mounts just that
// router - same approach as squarePaymentRoute.test.js, which this file mirrors closely (same
// buildApp/fakeIp/post helpers), since this is reachable over HTTP rather than through
// ApolloServer.executeOperation().
//
// square.createPaymentForAccount is mocked - what is under test is what InkBooks decides to
// charge and to whose account, not Square's own response to it.
//
// describe/it/expect/vi/beforeEach come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const express = require('express');
const request = require('supertest');
const squarePaymentsRouter = require('../../routes/squarePayments');
const square = require('../../utils/square');
const GiftCard = require('../../models/GiftCard');
const SquareAccount = require('../../models/SquareAccount');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	connectArtistToShop,
} = require('../helpers/factories');

function buildApp() {
	const app = express();
	// Mirrors index.js's app.set('trust proxy', 1) - see squarePaymentRoute.test.js's own comment.
	app.set('trust proxy', 1);
	app.use(squarePaymentsRouter);
	return app;
}

// A fresh, never-used fake client IP per request - see squarePaymentRoute.test.js's own comment
// on why (the rate limiter is an in-memory singleton shared across the whole test process).
let ipCounter = 0;
function fakeIp() {
	ipCounter += 1;
	const octet4 = ipCounter % 250;
	const octet3 = Math.floor(ipCounter / 250) % 250;
	const octet2 = Math.floor(ipCounter / (250 * 250)) % 250;
	return `199.${octet2 + 1}.${octet3 + 1}.${octet4 + 1}`;
}

let createPaymentSpy;

beforeEach(() => {
	createPaymentSpy = vi
		.spyOn(square, 'createPaymentForAccount')
		.mockResolvedValue({ id: 'sqpmt_giftcard_test', status: 'COMPLETED' });
});

afterEach(() => {
	createPaymentSpy.mockRestore();
});

async function connectSquareForArtist(userId) {
	return new SquareAccount({
		ownerType: 'ARTIST',
		ownerId: userId,
		connected: true,
		locationId: 'L_ARTIST',
		merchantId: 'M_ARTIST',
		accessTokenEncrypted: 'encrypted:artist-token',
		tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
	}).save();
}

// Bypasses the createArtistGiftCard/createShopGiftCard mutations for speed, same reasoning
// helpers/factories.js gives for bypassing register/login - this file is testing the CHARGE
// route, not the create mutation's own validation (giftCards.test.js already covers that).
function pendingArtistCard(artist, overrides = {}) {
	return new GiftCard({
		code: `TEST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
		issuerType: 'ARTIST',
		issuerArtistId: artist.id,
		faceValueCents: 10000,
		balanceCents: 10000,
		feeOffsetCents: 0,
		soldByUserId: artist.id,
		paymentMethod: 'square',
		saleStatus: 'pending',
		...overrides,
	}).save();
}

function pendingShopCard(shop, soldByUserId, overrides = {}) {
	return new GiftCard({
		code: `TEST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
		issuerType: 'SHOP',
		shopId: shop.id,
		faceValueCents: 10000,
		balanceCents: 10000,
		feeOffsetCents: 0,
		soldByUserId,
		paymentMethod: 'square',
		saleStatus: 'pending',
		shopCutCents: 10000,
		shopCutPercentApplied: 100,
		shopCutStatus: 'unpaid',
		...overrides,
	}).save();
}

function post(body, user, ip = fakeIp()) {
	const req = request(buildApp())
		.post('/square/process-gift-card-payment')
		.set('X-Forwarded-For', ip);
	if (user) {
		req.set('Authorization', `Bearer ${signTestToken(user)}`);
	}
	return req.send(body);
}

const validBody = (giftCardId, extra = {}) => ({
	sourceId: 'cnon:card-nonce-ok',
	idempotencyKey: 'idem-key-giftcard-1',
	giftCardId,
	...extra,
});

describe('process-gift-card-payment - artist-issued', () => {
	it('charges faceValueCents + feeOffsetCents into the issuing artist\'s own account', async () => {
		const { user: artist } = await createArtistUser();
		await connectSquareForArtist(artist.id);
		const card = await pendingArtistCard(artist, { faceValueCents: 12000, balanceCents: 12000, feeOffsetCents: 350 });

		const res = await post(validBody(card.id), artist);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.paymentId).toBe('sqpmt_giftcard_test');
		expect(createPaymentSpy.mock.calls[0][0].amountCents).toBe(12350);
		expect(createPaymentSpy.mock.calls[0][0].account.ownerId.toString()).toBe(String(artist.id));

		const stored = await GiftCard.findById(card.id);
		expect(stored.saleStatus).toBe('complete');
		expect(stored.squarePaymentId).toBe('sqpmt_giftcard_test');
		// Untouched by the charge itself - already written at creation (see models/GiftCard.js).
		expect(stored.balanceCents).toBe(12000);
	});

	it('refuses a caller who is not the artist who issued the card', async () => {
		const { user: artist } = await createArtistUser();
		await connectSquareForArtist(artist.id);
		const card = await pendingArtistCard(artist);
		const { user: otherArtist } = await createArtistUser();

		const res = await post(validBody(card.id), otherArtist);

		expect(res.status).toBe(403);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});

	it('refuses to charge a card that has already been paid for', async () => {
		const { user: artist } = await createArtistUser();
		await connectSquareForArtist(artist.id);
		const card = await pendingArtistCard(artist, { saleStatus: 'complete', squarePaymentId: 'sqpmt_already' });

		const res = await post(validBody(card.id), artist);

		expect(res.status).toBe(409);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});

	it('refuses to charge without a connected Square account', async () => {
		const { user: artist } = await createArtistUser();
		// No SquareAccount connected at all.
		const card = await pendingArtistCard(artist);

		const res = await post(validBody(card.id), artist);

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/Connect Square in Settings/);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});

	it('returns 404 for a gift card that does not exist', async () => {
		const { user: artist } = await createArtistUser();
		await connectSquareForArtist(artist.id);

		const res = await post(validBody('64b000000000000000000000'), artist);

		expect(res.status).toBe(404);
	});
});

describe('process-gift-card-payment - shop-issued', () => {
	it('charges into the SELLING ADMIN\'S OWN account, not the shop\'s', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await connectSquareForArtist(shopAdmin.id);
		const card = await pendingShopCard(shop, shopAdmin.id, { faceValueCents: 5000, balanceCents: 5000 });

		const res = await post(validBody(card.id), shopAdmin);

		expect(res.status).toBe(200);
		expect(createPaymentSpy.mock.calls[0][0].account.ownerId.toString()).toBe(String(shopAdmin.id));

		const stored = await GiftCard.findById(card.id);
		expect(stored.saleStatus).toBe('complete');
	});

	it('refuses a caller who is not a shop admin at the card\'s own shop', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await connectSquareForArtist(shopAdmin.id);
		const card = await pendingShopCard(shop, shopAdmin.id);

		const { user: otherArtist } = await createArtistUser();
		await connectArtistToShop(otherArtist.id, shop.id, { shopCutPercent: 40 }); // ARTIST role, not admin

		const res = await post(validBody(card.id), otherArtist);

		expect(res.status).toBe(403);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});

	it('refuses an admin at a different shop entirely', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await connectSquareForArtist(shopAdmin.id);
		const card = await pendingShopCard(shop, shopAdmin.id);

		const { user: otherAdmin } = await createShopAdminUser();

		const res = await post(validBody(card.id), otherAdmin);

		expect(res.status).toBe(403);
	});
});

describe('process-gift-card-payment - request validation and auth', () => {
	it('rejects an unauthenticated request', async () => {
		const { user: artist } = await createArtistUser();
		await connectSquareForArtist(artist.id);
		const card = await pendingArtistCard(artist);

		const res = await post(validBody(card.id), null);

		expect(res.status).toBe(401);
	});

	it('rejects a request missing sourceId', async () => {
		const { user: artist } = await createArtistUser();
		await connectSquareForArtist(artist.id);
		const card = await pendingArtistCard(artist);

		const res = await post({ idempotencyKey: 'k1', giftCardId: card.id }, artist);

		expect(res.status).toBe(400);
	});
});
