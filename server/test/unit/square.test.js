// describe/it/expect/beforeEach come from Vitest's `globals: true` config (see
// server/vitest.config.js) - Vitest's own package is ESM-only and throws if `require()`'d
// directly, so globals mode is what lets a CommonJS project like this one use them without an
// import statement (test/setup.js already relies on the same mechanism).
const square = require('../../utils/square');
const crypto = require('crypto');

describe('computeGrossedUpAmountCents', () => {
	// Hand-computed against the exact rates in utils/square.js (ACH: 1%, card: 3.3% + 30c) - these
	// are the same figures confirmed live against the real Square Sandbox API earlier in this
	// project (a $1.00 ACH invoice came back as $1.02, a $1.00 card invoice as $1.35).
	it('grosses up ACH correctly (1% fee, no fixed cost)', () => {
		expect(square.computeGrossedUpAmountCents(100, 'ach')).toBe(102); // ceil(100 / 0.99)
		expect(square.computeGrossedUpAmountCents(2000, 'ach')).toBe(2021); // ceil(2000 / 0.99)
	});

	it('grosses up card correctly (3.3% + 30c fixed)', () => {
		expect(square.computeGrossedUpAmountCents(100, 'card')).toBe(135); // ceil((100+30) / 0.967)
		expect(square.computeGrossedUpAmountCents(2000, 'card')).toBe(2100); // ceil(2030 / 0.967)
	});

	it('defaults to ACH math for any payment method other than "card"', () => {
		expect(square.computeGrossedUpAmountCents(100, 'ach')).toBe(
			square.computeGrossedUpAmountCents(100, undefined),
		);
	});

	it('always rounds up, never leaving the shop short a cent', () => {
		// Any non-exact division must ceil, not round/floor - undershooting means the shop nets
		// less than what's actually owed.
		const result = square.computeGrossedUpAmountCents(333, 'ach');
		expect(Number.isInteger(result)).toBe(true);
		expect(result).toBeGreaterThanOrEqual(Math.ceil(333 / 0.99));
	});
});

describe('verifyWebhookSignature', () => {
	const notificationUrl = 'https://api.inkbooks.net/webhooks/square';
	const rawBody = JSON.stringify({ type: 'invoice.payment_made', data: { object: { invoice: { id: 'inv:123', status: 'PAID' } } } });

	beforeEach(() => {
		process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'test-signature-key';
	});

	function realSignature(key, url, body) {
		return crypto.createHmac('sha256', key).update(url + body).digest('base64');
	}

	it('accepts a correctly signed payload', () => {
		const signature = realSignature('test-signature-key', notificationUrl, rawBody);
		expect(
			square.verifyWebhookSignature({ notificationUrl, rawBody, signatureHeader: signature }),
		).toBe(true);
	});

	it('rejects a tampered body (signature no longer matches)', () => {
		const signature = realSignature('test-signature-key', notificationUrl, rawBody);
		const tamperedBody = rawBody.replace('PAID', 'CANCELED');
		expect(
			square.verifyWebhookSignature({
				notificationUrl,
				rawBody: tamperedBody,
				signatureHeader: signature,
			}),
		).toBe(false);
	});

	it('rejects a signature computed with the wrong key', () => {
		const signature = realSignature('wrong-key', notificationUrl, rawBody);
		expect(
			square.verifyWebhookSignature({ notificationUrl, rawBody, signatureHeader: signature }),
		).toBe(false);
	});

	it('rejects a mismatched notification URL (e.g. trailing slash drift)', () => {
		const signature = realSignature('test-signature-key', notificationUrl, rawBody);
		expect(
			square.verifyWebhookSignature({
				notificationUrl: notificationUrl + '/',
				rawBody,
				signatureHeader: signature,
			}),
		).toBe(false);
	});

	it('rejects a missing signature header rather than throwing', () => {
		expect(
			square.verifyWebhookSignature({ notificationUrl, rawBody, signatureHeader: undefined }),
		).toBe(false);
	});

	it('throws if SQUARE_WEBHOOK_SIGNATURE_KEY is not configured', () => {
		delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
		expect(() =>
			square.verifyWebhookSignature({ notificationUrl, rawBody, signatureHeader: 'anything' }),
		).toThrow(/SQUARE_WEBHOOK_SIGNATURE_KEY/);
	});
});

/**
 * The scopes the authorization URL asks a seller to grant.
 *
 * PAYMENTS_WRITE was missing, and its absence was invisible until a real seller was connected: the
 * list was written for the Invoices-only flow, when card charges went through a separate platform
 * token rather than the artist's own connection (DECISIONS.md M9). Square refused the first real
 * charge with "The merchant has not given your application sufficient permissions".
 *
 * Asserted on the URL rather than on the exported constant, because the URL is what the seller
 * actually consents to - a scope in the array that never reaches the query string grants nothing.
 */
describe('OAuth scopes', () => {
	const SQUARE_ENV = {
		SQUARE_APPLICATION_ID: 'test-square-application-id',
		SQUARE_APPLICATION_SECRET: 'test-square-application-secret',
		SQUARE_OAUTH_REDIRECT_URL: 'https://api.inkbooks.test/square/oauth/callback',
	};
	let saved;

	beforeEach(() => {
		saved = {};
		for (const [key, value] of Object.entries(SQUARE_ENV)) {
			saved[key] = process.env[key];
			process.env[key] = value;
		}
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	function requestedScopes() {
		const url = new URL(square.buildAuthorizationUrl('state-token'));
		return url.searchParams.get('scope').split(' ');
	}

	// THE ONE THAT WAS MISSING.
	it('asks for PAYMENTS_WRITE, without which no card can be charged', () => {
		expect(requestedScopes()).toContain('PAYMENTS_WRITE');
	});

	it('asks for the invoice and order scopes the shop-cut ledger needs', () => {
		const scopes = requestedScopes();
		expect(scopes).toContain('INVOICES_WRITE');
		expect(scopes).toContain('ORDERS_WRITE');
		expect(scopes).toContain('CUSTOMERS_WRITE');
	});

	// A different permission entirely, for Square's automatic app_fee_allocations split - decided
	// against in favour of the ledger + Invoices model. InkBooks never takes a share of a payment
	// as it passes through, and asking for the permission to would say otherwise on the consent
	// screen the seller reads.
	it('does NOT ask for PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS', () => {
		expect(requestedScopes()).not.toContain('PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS');
	});

	it('carries the state token through unchanged', () => {
		const url = new URL(square.buildAuthorizationUrl('state-token'));
		expect(url.searchParams.get('state')).toBe('state-token');
	});
});

/**
 * A CONNECTION AUTHORIZED BEFORE PAYMENTS_WRITE EXISTED.
 *
 * Square's own wording is accurate and useless to the artist: they authorized the connection
 * themselves, nothing in InkBooks looks broken, and the fix is a disconnect/reconnect cycle nobody
 * would guess. A refresh returns the scopes originally granted, so there is no way to gain one
 * without a fresh consent.
 *
 * Tested here rather than through the payment route, because the detection lives inside
 * createPaymentForAccount - a route test would have to mock that function and would prove nothing
 * about it. global.fetch is mocked instead, so the real code path runs.
 *
 * The payload is what Square actually returned from the sandbox on 2026-08-11, so this keeps
 * matching the shape that occurs rather than one inferred from documentation.
 */
describe('createPaymentForAccount: a missing scope', () => {
	const tokenCrypto = require('../../utils/token-crypto');
	let savedKey;
	let account;

	beforeEach(() => {
		savedKey = process.env.TOKEN_ENCRYPTION_KEY;
		// 32 bytes, base64 - see utils/token-crypto.js's getKey.
		process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
		account = {
			connected: true,
			locationId: 'L_TEST',
			accessTokenEncrypted: tokenCrypto.encrypt('seller-access-token'),
			// Comfortably beyond the seven-day refresh window, so no refresh call is attempted.
			tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			save: async () => {},
		};
	});

	afterEach(() => {
		if (savedKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
		else process.env.TOKEN_ENCRYPTION_KEY = savedKey;
		vi.restoreAllMocks();
	});

	function mockSquareScopeRefusal() {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 403,
			json: async () => ({
				errors: [
					{
						category: 'AUTHENTICATION_ERROR',
						code: 'INSUFFICIENT_SCOPES',
						detail:
							'The merchant has not given your application sufficient permissions to do ' +
							'that. The merchant must authorize your application for the following ' +
							'scopes: PAYMENTS_WRITE',
					},
				],
			}),
		});
	}

	it('says to reconnect, rather than passing Square\'s wording through', async () => {
		mockSquareScopeRefusal();

		await expect(
			square.createPaymentForAccount({
				account,
				sourceId: 'cnon:test',
				amountCents: 20000,
				idempotencyKey: 'idem-1',
			}),
		).rejects.toThrow(/Disconnect and reconnect Square/i);
	});

	// 400, so the route surfaces it as a refusal with an action rather than a server error.
	it('carries a status the route can turn into a 400', async () => {
		mockSquareScopeRefusal();

		await square
			.createPaymentForAccount({
				account,
				sourceId: 'cnon:test',
				amountCents: 20000,
				idempotencyKey: 'idem-1',
			})
			.catch((err) => {
				expect(err.status).toBe(400);
			});
	});

	// An ordinary decline must NOT be rewritten as a scope problem - "reconnect Square" is terrible
	// advice for a card that was declined.
	it('leaves a normal decline alone', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 402,
			json: async () => ({
				errors: [{ category: 'PAYMENT_METHOD_ERROR', code: 'CARD_DECLINED', detail: 'Card declined.' }],
			}),
		});

		await expect(
			square.createPaymentForAccount({
				account,
				sourceId: 'cnon:test',
				amountCents: 20000,
				idempotencyKey: 'idem-1',
			}),
		).rejects.toThrow(/Card declined/);
	});
});
