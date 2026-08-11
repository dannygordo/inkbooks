// Integration tests for the real Express route at routes/squarePayments.js, using supertest
// against a minimal app that mounts just that router - same approach as squareWebhook.test.js,
// since this is reachable over HTTP rather than through ApolloServer.executeOperation().
//
// WHAT THESE ARE FOR. This route used to take subtotalCents/taxCents/feeCents/tipCents and
// amountCents from the request body, write them onto the appointment, and compute the shop's cut
// from the subtotal the caller had just sent it. An artist could charge one figure and record
// another, and pay their cut on the smaller one. The first describe block below is entirely about
// proving that is no longer possible - a test that passes today and would fail the moment anyone
// reintroduces a money field to the request.
//
// square.createPaymentForAccount is mocked: it makes real HTTPS calls to Square, and what is under
// test is what InkBooks decides to charge, not Square's response to it.
// describe/it/expect/vi/beforeEach come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const express = require('express');
const request = require('supertest');
const squarePaymentsRouter = require('../../routes/squarePayments');
const square = require('../../utils/square');
const Appointment = require('../../models/Appointment');
const SquareAccount = require('../../models/SquareAccount');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	connectArtistToShop,
	createAppointment,
} = require('../helpers/factories');

function buildApp() {
	const app = express();
	// Mirrors index.js's app.set('trust proxy', 1) - without it X-Forwarded-For does not populate
	// req.ip the way utils/rate-limit.js's getClientIp expects, and every request in the file
	// shares one key.
	app.set('trust proxy', 1);
	app.use(squarePaymentsRouter);
	return app;
}

// A fresh, never-used fake client IP per request. The rate limiter (utils/rate-limit.js) is an
// in-memory singleton living for the whole test PROCESS - not reset between tests or files - and
// this route allows 10 attempts a minute. Without this the eleventh test in the file starts
// getting 429s that look like assertion failures about payments. Same helper, same reason, as
// bookingRequests.test.js and the suite this one replaces.
let ipCounter = 0;
function fakeIp() {
	ipCounter += 1;
	const octet4 = ipCounter % 250;
	const octet3 = Math.floor(ipCounter / 250) % 250;
	const octet2 = Math.floor(ipCounter / (250 * 250)) % 250;
	return `198.${octet2 + 1}.${octet3 + 1}.${octet4 + 1}`;
}

// vi.spyOn rather than vi.mock, for the reason spelled out at length in shopCutLedger.test.js:
// this suite is CommonJS, so vi.mock would replace a different module instance than the one the
// route requires.
let createPaymentSpy;

beforeEach(() => {
	createPaymentSpy = vi
		.spyOn(square, 'createPaymentForAccount')
		.mockResolvedValue({ id: 'sqpmt_test', status: 'COMPLETED' });
});

afterEach(() => {
	createPaymentSpy.mockRestore();
});

// $180/hr, 9.4% tax, $6/hr offset - the configuration DECISIONS.md M5 and M2 work through.
async function connectedShopWithRates() {
	const { shop } = await createShopAdminUser();
	shop.hourlyRate = 180;
	shop.taxRateBasisPoints = 940;
	shop.squareFeeOffsetCents = 600;
	await shop.save();
	await new SquareAccount({
		ownerType: 'SHOP',
		ownerId: shop._id,
		connected: true,
		locationId: 'L_TEST',
		merchantId: 'M_TEST',
		accessTokenEncrypted: 'encrypted:token',
		tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
	}).save();
	return shop;
}

async function artistAtConnectedShop() {
	const { user } = await createArtistUser();
	const shop = await connectedShopWithRates();
	await connectArtistToShop(user.id, shop.id);
	return { user, shop };
}

function post(body, user, ip = fakeIp()) {
	const req = request(buildApp()).post('/square/process-payment').set('X-Forwarded-For', ip);
	if (user) {
		req.set('Authorization', `Bearer ${signTestToken(user)}`);
	}
	return req.send(body);
}

const validBody = (appointmentId, extra = {}) => ({
	sourceId: 'cnon:card-nonce-ok',
	idempotencyKey: 'idem-key-1',
	appointmentId,
	...extra,
});

describe('the caller cannot set the amount', () => {
	// THE TEST THIS FILE EXISTS FOR. A subtotal in the body must not reach the charge, the stored
	// record, or the shop cut.
	it('ignores money fields in the request body entirely', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		const res = await post(
			validBody(appointment.id, {
				subtotalCents: 100,
				taxCents: 0,
				feeCents: 0,
				amountCents: 100,
			}),
			user,
		);

		expect(res.status).toBe(200);
		// 20000 + 9.4% tax = 21880, not the 100 the caller asked for.
		expect(createPaymentSpy.mock.calls[0][0].amountCents).toBe(21880);

		const stored = await Appointment.findById(appointment.id);
		expect(stored.subtotalCents).toBe(20000);
		expect(stored.taxCents).toBe(1880);
	});

	it('computes the shop cut from the stored subtotal, not the posted one', async () => {
		const { user, shop } = await artistAtConnectedShop();
		shop.shopCutPercent = 40;
		await shop.save();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		await post(validBody(appointment.id, { subtotalCents: 100 }), user);

		const stored = await Appointment.findById(appointment.id);
		// 40% of $200, not 40% of $1.
		expect(stored.shopCutCents).toBe(8000);
	});

	// The tip IS the caller's to set - it is decided at the counter and no stored rate predicts it.
	// It is also the one figure that cannot move the cut, since tips sit outside the cuttable base
	// (M2), which is why allowing it is safe.
	it('accepts the tip, and keeps it out of the cut', async () => {
		const { user, shop } = await artistAtConnectedShop();
		shop.shopCutPercent = 40;
		await shop.save();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		await post(validBody(appointment.id, { tipCents: 5000 }), user);

		expect(createPaymentSpy.mock.calls[0][0].amountCents).toBe(26880);
		const stored = await Appointment.findById(appointment.id);
		expect(stored.tipCents).toBe(5000);
		expect(stored.shopCutCents).toBe(8000);
	});

	// The offset is the artist's choice, honoured only when asked for (M5).
	it('applies the offset only when the caller asks for it', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 18000,
		});

		await post(validBody(appointment.id, { applyFeeOffset: true }), user);

		// $6 offset, not $600 - see chargeQuote.test.js on the units bug this pins.
		expect(createPaymentSpy.mock.calls[0][0].amountCents).toBe(20348);
	});
});

describe('where the money settles', () => {
	it('charges into the shop\'s connected account for a shop artist', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		await post(validBody(appointment.id), user);

		const account = createPaymentSpy.mock.calls[0][0].account;
		expect(account.ownerType).toBe('SHOP');
		expect(String(account.ownerId)).toBe(String(shop._id));
	});

	it('charges into the artist\'s own account when they are independent', async () => {
		const { user, artist } = await createArtistUser();
		artist.hourlyRate = 150;
		await artist.save();
		await new SquareAccount({
			ownerType: 'ARTIST',
			ownerId: user.id,
			connected: true,
			locationId: 'L_OWN',
			accessTokenEncrypted: 'encrypted:own',
		}).save();
		const appointment = await createAppointment(user.id, { subtotalCents: 20000 });

		await post(validBody(appointment.id), user);

		const account = createPaymentSpy.mock.calls[0][0].account;
		expect(account.ownerType).toBe('ARTIST');
		expect(String(account.ownerId)).toBe(String(user.id));
	});

	// Refused before the card is reached for, with a message naming who has to fix it.
	it('refuses when the owner has no usable connection, without calling Square', async () => {
		const { user } = await createArtistUser();
		const appointment = await createAppointment(user.id, { subtotalCents: 20000 });

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/Connect Square in Settings/);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});
});

describe('charging twice', () => {
	it('passes the caller\'s idempotency key through unchanged', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		await post(validBody(appointment.id, {}), user);

		expect(createPaymentSpy.mock.calls[0][0].idempotencyKey).toBe('idem-key-1');
	});

	// An idempotency key covers a retry of the same request. It does nothing about a second,
	// deliberate charge, because Square sees a different key and a different payment.
	it('refuses a session that already has a payment against it', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
			squarePaymentId: 'sqpmt_earlier',
		});

		const res = await post(validBody(appointment.id, { idempotencyKey: 'idem-key-2' }), user);

		expect(res.status).toBe(409);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});
});

// Carried over from test/integration/squarePayments.test.js, which this file replaces. That suite
// was written against the old contract - client-supplied amountCents, no appointmentId, a platform
// sandbox token, global.fetch mocked at the Square boundary - and most of it asserted behaviour
// that has deliberately gone. These are the cases that still mean something, restated against what
// the route does now.
describe('auth, validation and rate limiting', () => {
	it('rejects a request with no Authorization header', async () => {
		const res = await post({ sourceId: 'cnon:card-nonce-ok' }, null);

		expect(res.status).toBe(401);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});

	it('rejects a body missing sourceId', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		const res = await post({ idempotencyKey: 'k', appointmentId: appointment.id }, user);

		expect(res.status).toBe(400);
		expect(res.body.errors).toBeDefined();
	});

	it('rejects a body with no appointmentId at all', async () => {
		const { user } = await artistAtConnectedShop();

		const res = await post({ sourceId: 'cnon:x', idempotencyKey: 'k' }, user);

		expect(res.status).toBe(400);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});

	// Square's own failure surfaces with its status and message rather than being flattened into a
	// generic 500 - a declined card is something the person at the counter can act on.
	it('passes Square\'s status and message through on a decline', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		const declined = new Error('Card declined');
		declined.status = 402;
		createPaymentSpy.mockRejectedValueOnce(declined);

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(402);
		expect(res.body.error).toBe('Card declined');
	});

	/**
	 * Unreadable stored credentials are a 400 with an action, not a 500.
	 *
	 * This is a real state, not a hypothetical: a rotated TOKEN_ENCRYPTION_KEY, a restored backup
	 * or a hand-edited row all produce it, and a seeded placeholder token produced it the first
	 * time anyone tried to charge from seeded data. The failure landed as a bare 500 while a card
	 * was being charged, which tells the person at the counter nothing.
	 */
	it('refuses readably when the stored token cannot be decrypted', async () => {
		const { user, shop } = await artistAtConnectedShop();
		await SquareAccount.updateOne(
			{ ownerType: 'SHOP', ownerId: shop._id },
			{ $set: { accessTokenEncrypted: 'not-a-real-ciphertext' } },
		);
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		// The real square.js path, not the mock - the decryption happens before any HTTP call.
		createPaymentSpy.mockRestore();

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/reconnect Square/i);

		const stored = await Appointment.findById(appointment.id);
		expect(stored.squarePaymentId).toBeUndefined();
	});

	// A declined charge must not leave the session looking settled.
	it('records nothing when the charge fails', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		createPaymentSpy.mockRejectedValueOnce(new Error('Card declined'));

		await post(validBody(appointment.id), user);

		const stored = await Appointment.findById(appointment.id);
		expect(stored.squarePaymentId).toBeUndefined();
	});

	it('rate-limits at 10 attempts a minute per caller', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const ip = fakeIp();

		for (let i = 0; i < 10; i++) {
			const appointment = await createAppointment(user.id, {
				shopId: shop.id,
				subtotalCents: 20000,
			});
			const res = await post(
				validBody(appointment.id, { idempotencyKey: `idem-${i}` }),
				user,
				ip,
			);
			expect(res.status).toBe(200);
		}

		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		const eleventh = await post(
			validBody(appointment.id, { idempotencyKey: 'idem-11' }),
			user,
			ip,
		);

		expect(eleventh.status).toBe(429);
		expect(eleventh.body.error).toMatch(/Too many payment attempts/);
	});
});

describe('refusals that must happen before any money moves', () => {
	it('rejects a body with no idempotency key', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		const res = await post(
			{ sourceId: 'cnon:x', appointmentId: appointment.id },
			user,
		);

		expect(res.status).toBe(400);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});

	it('rejects an appointment belonging to another artist', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const { user: other } = await createArtistUser();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		const res = await post(validBody(appointment.id), other);

		expect(res.status).toBe(403);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});

	it('rejects a session with no price saved on it', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, { shopId: shop.id, subtotalCents: 0 });

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(400);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});

	// A session fully covered by a deposit owes nothing, and Square rejects a zero charge anyway.
	it('rejects a session already covered by its deposit credit', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 8000,
			depositCreditCents: 50000,
		});

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/nothing left to collect/i);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});
});

describe('charging a pending deposit', () => {
	async function pendingDepositAppointment(user, shop, depositCents = 20000) {
		return createAppointment(user.id, {
			shopId: shop.id,
			appointmentType: 'consult',
			depositCents,
			depositStatus: 'pending',
		});
	}

	it('charges the stored deposit amount and marks it collected', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await pendingDepositAppointment(user, shop);

		const res = await post(validBody(appointment.id, { chargeType: 'deposit' }), user);

		expect(res.status).toBe(200);
		// $200 face value plus 9.4% tax (M11).
		expect(createPaymentSpy.mock.calls[0][0].amountCents).toBe(21880);

		const stored = await Appointment.findById(appointment.id);
		expect(stored.depositStatus).toBe('available');
		expect(stored.depositSquarePaymentId).toBe('sqpmt_test');
		expect(stored.depositCollectedAt).toBeTruthy();
	});

	// Taxed at collection - a deposit is its own transaction (M11). $200 at 9.4% is $18.80, and the
	// tax is recorded separately from the deposit's face value so it never becomes spendable
	// credit.
	it('taxes the deposit and records the tax apart from the face value', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await pendingDepositAppointment(user, shop);

		await post(validBody(appointment.id, { chargeType: 'deposit' }), user);

		expect(createPaymentSpy.mock.calls[0][0].amountCents).toBe(21880);
		const stored = await Appointment.findById(appointment.id);
		expect(stored.depositCents).toBe(20000);
		expect(stored.taxCents).toBe(1880);
	});

	// The amount charged is the amount recorded, because they are the same stored field.
	it('does not let the caller change the deposit amount', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await pendingDepositAppointment(user, shop, 20000);

		await post(
			validBody(appointment.id, { chargeType: 'deposit', depositCents: 100, amountCents: 100 }),
			user,
		);

		expect(createPaymentSpy.mock.calls[0][0].amountCents).toBe(21880);
		const stored = await Appointment.findById(appointment.id);
		expect(stored.depositCents).toBe(20000);
	});

	it('refuses a deposit that was already collected', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			depositCents: 20000,
			depositStatus: 'available',
			depositSquarePaymentId: 'sqpmt_earlier',
		});

		const res = await post(validBody(appointment.id, { chargeType: 'deposit' }), user);

		expect(res.status).toBe(409);
		expect(createPaymentSpy).not.toHaveBeenCalled();
	});
});
