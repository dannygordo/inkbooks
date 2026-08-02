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
