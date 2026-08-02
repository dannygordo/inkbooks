// Integration test for the real Express route at routes/squarePayments.js - the deposit-checkout
// route (client/src/components/IBSquarePayments/squareConfig.js's PROCESS_URL) that didn't exist
// at all before this session (see PRODUCTION_ROADMAP.md's Phase 4 write-up). Uses supertest
// against a minimal Express app that mounts just this one router, matching the pattern already
// established in squareWebhook.test.js. Mocks global.fetch rather than calling Square's real
// sandbox API - no real Square sandbox credentials exist in this test environment, and a test
// suite shouldn't depend on a live third-party network call regardless.
// describe/it/expect/beforeEach/afterEach come from Vitest's `globals: true` config - see the
// comment in test/integration/appointments.test.js for why there's no `require('vitest')` here.
const express = require('express');
const request = require('supertest');
const { signTestToken } = require('../helpers/auth');
const { createUser } = require('../helpers/factories');
const { Constants } = require('../../utils/constants');
const squarePaymentsRouter = require('../../routes/squarePayments');

const SANDBOX_ACCESS_TOKEN = 'test-sandbox-access-token';
const SANDBOX_LOCATION_ID = 'test-location-id';

function buildApp() {
	const app = express();
	// Mirrors index.js's real app.set('trust proxy', 1) - needed for X-Forwarded-For below to
	// actually populate req.ip the way utils/rate-limit.js's getClientIp expects, the same
	// concern index.js's own comment on this flags for Render's real reverse proxy.
	app.set('trust proxy', 1);
	app.use(squarePaymentsRouter);
	return app;
}

// A fresh, never-used fake client IP per test - see the identical rationale/comment in
// bookingRequests.test.js's fakeIp(): the rate limiter (utils/rate-limit.js) is an in-memory
// singleton that persists for the whole test process, not reset between tests or test files.
let ipCounter = 0;
function fakeIp() {
	ipCounter += 1;
	const octet4 = ipCounter % 250;
	const octet3 = Math.floor(ipCounter / 250) % 250;
	const octet2 = Math.floor(ipCounter / (250 * 250)) % 250;
	return `199.${octet2 + 1}.${octet3 + 1}.${octet4 + 1}`;
}

function mockSquareSuccess(paymentOverrides = {}) {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({
			payment: {
				id: 'sandbox-payment-1',
				status: 'COMPLETED',
				...paymentOverrides,
			},
		}),
	});
}

function mockSquareFailure(status = 402, errors = [{ detail: 'Card declined' }]) {
	global.fetch = vi.fn().mockResolvedValue({
		ok: false,
		status,
		json: async () => ({ errors }),
	});
}

beforeEach(() => {
	process.env.SQUARE_SANDBOX_ACCESS_TOKEN = SANDBOX_ACCESS_TOKEN;
	process.env.SQUARE_SANDBOX_LOCATION_ID = SANDBOX_LOCATION_ID;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('POST /square/process-payment: auth and validation', () => {
	it('rejects a request with no Authorization header (401)', async () => {
		const app = buildApp();
		const response = await request(app)
			.post('/square/process-payment')
			.set('X-Forwarded-For', fakeIp())
			.send({ sourceId: 'cnon:card-nonce-ok', amountCents: 1000 });

		expect(response.status).toBe(401);
	});

	it('rejects a request missing sourceId/amountCents (400)', async () => {
		const app = buildApp();
		const user = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const token = signTestToken(user);

		const response = await request(app)
			.post('/square/process-payment')
			.set('Authorization', `Bearer ${token}`)
			.set('X-Forwarded-For', fakeIp())
			.send({});

		expect(response.status).toBe(400);
		expect(response.body.errors).toBeDefined();
	});

	it('rejects a non-positive amountCents (400)', async () => {
		const app = buildApp();
		const user = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const token = signTestToken(user);

		const response = await request(app)
			.post('/square/process-payment')
			.set('Authorization', `Bearer ${token}`)
			.set('X-Forwarded-For', fakeIp())
			.send({ sourceId: 'cnon:card-nonce-ok', amountCents: -500 });

		expect(response.status).toBe(400);
	});
});

describe('POST /square/process-payment: charging via Square', () => {
	it('charges the card and returns the payment id/status on success', async () => {
		mockSquareSuccess();
		const app = buildApp();
		const user = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const token = signTestToken(user);

		const response = await request(app)
			.post('/square/process-payment')
			.set('Authorization', `Bearer ${token}`)
			.set('X-Forwarded-For', fakeIp())
			.send({ sourceId: 'cnon:card-nonce-ok', amountCents: 10000 });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			paymentId: 'sandbox-payment-1',
			status: 'COMPLETED',
		});
	});

	it('calls Square sandbox Payments API with the right host, auth, and body shape', async () => {
		mockSquareSuccess();
		const app = buildApp();
		const user = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const token = signTestToken(user);

		await request(app)
			.post('/square/process-payment')
			.set('Authorization', `Bearer ${token}`)
			.set('X-Forwarded-For', fakeIp())
			.send({ sourceId: 'cnon:card-nonce-ok', amountCents: 2500, note: 'Deposit for sleeve' });

		expect(global.fetch).toHaveBeenCalledTimes(1);
		const [url, options] = global.fetch.mock.calls[0];
		expect(url).toBe('https://connect.squareupsandbox.com/v2/payments');
		expect(options.method).toBe('POST');
		expect(options.headers.Authorization).toBe(`Bearer ${SANDBOX_ACCESS_TOKEN}`);

		const body = JSON.parse(options.body);
		expect(body.source_id).toBe('cnon:card-nonce-ok');
		expect(body.amount_money).toEqual({ amount: 2500, currency: 'USD' });
		expect(body.location_id).toBe(SANDBOX_LOCATION_ID);
		expect(body.note).toBe('Deposit for sleeve');
		expect(typeof body.idempotency_key).toBe('string');
		expect(body.idempotency_key.length).toBeGreaterThan(0);
	});

	it('surfaces Square\'s own error message and status when the charge fails', async () => {
		mockSquareFailure(402, [{ detail: 'Card declined' }]);
		const app = buildApp();
		const user = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const token = signTestToken(user);

		const response = await request(app)
			.post('/square/process-payment')
			.set('Authorization', `Bearer ${token}`)
			.set('X-Forwarded-For', fakeIp())
			.send({ sourceId: 'cnon:card-nonce-declined', amountCents: 10000 });

		expect(response.status).toBe(402);
		expect(response.body.error).toBe('Card declined');
	});

	it('fails clearly when SQUARE_SANDBOX_ACCESS_TOKEN is not configured', async () => {
		delete process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
		mockSquareSuccess();
		const app = buildApp();
		const user = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const token = signTestToken(user);

		const response = await request(app)
			.post('/square/process-payment')
			.set('Authorization', `Bearer ${token}`)
			.set('X-Forwarded-For', fakeIp())
			.send({ sourceId: 'cnon:card-nonce-ok', amountCents: 10000 });

		expect(response.status).toBe(500);
		expect(response.body.error).toMatch(/SQUARE_SANDBOX_ACCESS_TOKEN/);
		expect(global.fetch).not.toHaveBeenCalled();
	});
});

describe('POST /square/process-payment: rate limiting', () => {
	it('rate-limits at 10 attempts/minute per caller', async () => {
		mockSquareSuccess();
		const app = buildApp();
		const user = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const token = signTestToken(user);
		const ip = fakeIp();

		for (let i = 0; i < 10; i++) {
			const response = await request(app)
				.post('/square/process-payment')
				.set('Authorization', `Bearer ${token}`)
				.set('X-Forwarded-For', ip)
				.send({ sourceId: `cnon:card-nonce-${i}`, amountCents: 1000 });
			expect(response.status).toBe(200);
		}

		const eleventh = await request(app)
			.post('/square/process-payment')
			.set('Authorization', `Bearer ${token}`)
			.set('X-Forwarded-For', ip)
			.send({ sourceId: 'cnon:card-nonce-11', amountCents: 1000 });

		expect(eleventh.status).toBe(429);
		expect(eleventh.body.error).toMatch(/Too many payment attempts/);
	});
});
