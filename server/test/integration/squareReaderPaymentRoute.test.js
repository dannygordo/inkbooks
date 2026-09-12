// Integration tests for routes/squarePayments.js's /square/process-reader-payment route - the
// Mobile Payments SDK's card-reader counterpart to squarePaymentRoute.test.js's nonce-based route.
//
// WHAT THESE ARE FOR. Unlike the nonce route, this one is handed a payment id for a charge that
// ALREADY HAPPENED on the device, via a physical Square reader - there is no sourceId to charge,
// only a claim to verify. square.getPaymentForAccount is mocked to stand in for Square's own
// records, and every test here is really asking one question: does this route ever write a
// completed-charge ledger entry off something other than what Square itself says happened?
//
// describe/it/expect/vi/beforeEach come from Vitest's `globals: true` config, matching every other
// integration test in this directory.
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
	app.set('trust proxy', 1);
	app.use(squarePaymentsRouter);
	return app;
}

// Same fresh-fake-IP-per-request approach as squarePaymentRoute.test.js, and for the same reason -
// the rate limiter is an in-memory singleton for the whole test process.
let ipCounter = 0;
function fakeIp() {
	ipCounter += 1;
	const octet4 = ipCounter % 250;
	const octet3 = Math.floor(ipCounter / 250) % 250;
	const octet2 = Math.floor(ipCounter / (250 * 250)) % 250;
	return `199.${octet2 + 1}.${octet3 + 1}.${octet4 + 1}`;
}

let getPaymentSpy;

beforeEach(() => {
	getPaymentSpy = vi.spyOn(square, 'getPaymentForAccount');
});

afterEach(() => {
	getPaymentSpy.mockRestore();
});

async function connectedShopWithRates() {
	const { shop } = await createShopAdminUser();
	shop.hourlyRate = 180;
	shop.taxRateBasisPoints = 940;
	shop.squareFeeOffsetCents = 600;
	await shop.save();
	return shop;
}

async function connectSquareForArtist(userId, overrides = {}) {
	return new SquareAccount({
		ownerType: 'ARTIST',
		ownerId: userId,
		connected: true,
		locationId: 'L_ARTIST',
		merchantId: 'M_ARTIST',
		accessTokenEncrypted: 'encrypted:artist-token',
		tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
		...overrides,
	}).save();
}

async function artistAtConnectedShop() {
	const { user } = await createArtistUser();
	const shop = await connectedShopWithRates();
	await connectArtistToShop(user.id, shop.id);
	await connectSquareForArtist(user.id);
	return { user, shop };
}

function post(body, user, ip = fakeIp()) {
	const req = request(buildApp())
		.post('/square/process-reader-payment')
		.set('X-Forwarded-For', ip);
	if (user) {
		req.set('Authorization', `Bearer ${signTestToken(user)}`);
	}
	return req.send(body);
}

// A completed Square payment matching whatever this test's freshly-computed quote should be -
// tests override amount/location_id/status to exercise the mismatch paths.
function squarePayment(overrides = {}) {
	return {
		id: 'sqpmt_reader_test',
		status: 'COMPLETED',
		location_id: 'L_ARTIST',
		amount_money: { amount: 21880, currency: 'USD' },
		...overrides,
	};
}

const validBody = (appointmentId, extra = {}) => ({
	paymentId: 'sqpmt_reader_test',
	appointmentId,
	...extra,
});

describe('a clean reader payment', () => {
	it('records a session charge exactly like the nonce route does, off Square\'s own record', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		// $200 + 9.4% tax = $218.80 = 21880 cents, matching squarePayment()'s default.
		getPaymentSpy.mockResolvedValue(squarePayment());

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(200);
		expect(res.body.paymentId).toBe('sqpmt_reader_test');
		const stored = await Appointment.findById(appointment.id);
		expect(stored.squarePaymentId).toBe('sqpmt_reader_test');
		expect(stored.appointmentStatus).toBe('completed');
		expect(stored.subtotalCents).toBe(20000);
		expect(stored.taxCents).toBe(1880);
	});

	it('records a deposit the same way', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			depositStatus: 'pending',
			depositCents: 10000,
		});
		// $100 + 9.4% tax = $109.40 = 10940 cents.
		getPaymentSpy.mockResolvedValue(squarePayment({ amount_money: { amount: 10940, currency: 'USD' } }));

		const res = await post(validBody(appointment.id, { chargeType: 'deposit' }), user);

		expect(res.status).toBe(200);
		const stored = await Appointment.findById(appointment.id);
		expect(stored.depositSquarePaymentId).toBe('sqpmt_reader_test');
		expect(stored.depositStatus).toBe('available');
	});

	it('passes the account it looked the payment up under to square.getPaymentForAccount', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		getPaymentSpy.mockResolvedValue(squarePayment());

		await post(validBody(appointment.id), user);

		expect(getPaymentSpy.mock.calls[0][0].account.ownerType).toBe('ARTIST');
		expect(getPaymentSpy.mock.calls[0][0].paymentId).toBe('sqpmt_reader_test');
	});
});

describe('fails closed on anything Square\'s record does not confirm', () => {
	it('refuses a payment amount that does not match the current quote, and writes nothing', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		// Quote says 21880; Square says something else entirely.
		getPaymentSpy.mockResolvedValue(squarePayment({ amount_money: { amount: 500, currency: 'USD' } }));

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(409);
		const stored = await Appointment.findById(appointment.id);
		expect(stored.squarePaymentId).toBeFalsy();
		expect(stored.appointmentStatus).not.toBe('completed');
	});

	it('refuses a payment that is not COMPLETED yet', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		getPaymentSpy.mockResolvedValue(squarePayment({ status: 'APPROVED' }));

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(400);
		const stored = await Appointment.findById(appointment.id);
		expect(stored.squarePaymentId).toBeFalsy();
	});

	it('refuses a payment made against a different location', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		getPaymentSpy.mockResolvedValue(squarePayment({ location_id: 'L_SOMEONE_ELSE' }));

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(400);
	});

	it('refuses when Square has no record of the payment at all', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		getPaymentSpy.mockResolvedValue(null);

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(404);
	});
});

describe('idempotency and replay', () => {
	it('refuses a session already marked paid, without calling Square at all', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
			squarePaymentId: 'already-paid',
		});

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(409);
		expect(getPaymentSpy).not.toHaveBeenCalled();
	});

	it('refuses a payment id already recorded against a DIFFERENT appointment', async () => {
		const { user, shop } = await artistAtConnectedShop();
		const other = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 5000,
			squarePaymentId: 'sqpmt_reader_test',
		});
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(409);
		expect(getPaymentSpy).not.toHaveBeenCalled();
		// Untouched - the guard fired before Square was ever asked.
		const stored = await Appointment.findById(other.id);
		expect(stored.squarePaymentId).toBe('sqpmt_reader_test');
	});
});

describe('ownership', () => {
	it('refuses a caller who does not own the appointment and is not shop staff', async () => {
		const { user: owner, shop } = await artistAtConnectedShop();
		const appointment = await createAppointment(owner.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});
		const { user: stranger } = await createArtistUser();

		const res = await post(validBody(appointment.id), stranger);

		expect(res.status).toBe(403);
		expect(getPaymentSpy).not.toHaveBeenCalled();
	});
});

describe('missing Square connection', () => {
	it('refuses before ever asking Square anything', async () => {
		const { user } = await createArtistUser();
		const appointment = await createAppointment(user.id, { subtotalCents: 20000 });
		// No SquareAccount connected for this artist at all.

		const res = await post(validBody(appointment.id), user);

		expect(res.status).toBe(400);
		expect(getPaymentSpy).not.toHaveBeenCalled();
	});
});
