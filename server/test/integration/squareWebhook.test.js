// Integration test for the real Express route at routes/squareWebhooks.js - this is the one piece
// of the shop-cut ledger that isn't reachable through GraphQL at all, so it needs an actual HTTP
// request against the router rather than ApolloServer.executeOperation(). Uses supertest against a
// minimal Express app that mounts just this one router, matching how index.js itself mounts it
// (crucially: express.raw() for this path, same requirement the router's own comment documents -
// signature verification needs the exact raw bytes, not a re-serialized parsed body).
// describe/it/expect/beforeEach come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const squareWebhooksRouter = require('../../routes/squareWebhooks');
const { createArtistUser, createShopAdminUser, createAppointment } = require('../helpers/factories');
const Appointment = require('../../models/Appointment');

const NOTIFICATION_URL = 'https://api.inkbooks.net/webhooks/square';
const SIGNATURE_KEY = 'test-webhook-signature-key';

function buildApp() {
	const app = express();
	app.use(squareWebhooksRouter);
	return app;
}

function sign(rawBody) {
	return crypto.createHmac('sha256', SIGNATURE_KEY).update(NOTIFICATION_URL + rawBody).digest('base64');
}

function paymentMadeEvent(invoiceId, status = 'PAID') {
	return JSON.stringify({
		type: 'invoice.payment_made',
		data: { object: { invoice: { id: invoiceId, status } } },
	});
}

beforeEach(() => {
	process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = SIGNATURE_KEY;
	process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = NOTIFICATION_URL;
});

describe('POST /webhooks/square: signature verification', () => {
	it('rejects a request with no signature header (403)', async () => {
		const app = buildApp();
		const body = paymentMadeEvent('inv:doesnotmatter');

		const response = await request(app)
			.post('/webhooks/square')
			.set('Content-Type', 'application/json')
			.send(body);

		expect(response.status).toBe(403);
	});

	it('rejects a tampered body whose signature no longer matches (403)', async () => {
		const app = buildApp();
		const body = paymentMadeEvent('inv:doesnotmatter');
		const signature = sign(body);
		const tamperedBody = body.replace('PAID', 'CANCELED');

		const response = await request(app)
			.post('/webhooks/square')
			.set('Content-Type', 'application/json')
			.set('x-square-hmacsha256-signature', signature)
			.send(tamperedBody);

		expect(response.status).toBe(403);
	});

	it('rejects when SQUARE_WEBHOOK_SIGNATURE_KEY is not configured (500, not a crash)', async () => {
		delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
		const app = buildApp();
		const body = paymentMadeEvent('inv:doesnotmatter');

		const response = await request(app)
			.post('/webhooks/square')
			.set('Content-Type', 'application/json')
			.set('x-square-hmacsha256-signature', 'anything')
			.send(body);

		expect(response.status).toBe(500);
	});
});

describe('POST /webhooks/square: invoice.payment_made handling', () => {
	it('accepts a validly signed event and marks the matching appointment paid', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const appointment = await createAppointment(artist.id, {
			shopId: shop.id,
			shopCutStatus: 'invoice_sent',
			shopCutSquareInvoiceId: 'inv:real123',
		});

		const app = buildApp();
		const body = paymentMadeEvent('inv:real123', 'PAID');
		const signature = sign(body);

		const response = await request(app)
			.post('/webhooks/square')
			.set('Content-Type', 'application/json')
			.set('x-square-hmacsha256-signature', signature)
			.send(body);

		expect(response.status).toBe(200);
		const stored = await Appointment.findById(appointment.id);
		expect(stored.shopCutStatus).toBe('paid');
	});

	it('is a no-op (still 200) when no appointment matches the invoice id', async () => {
		const app = buildApp();
		const body = paymentMadeEvent('inv:no-such-invoice', 'PAID');
		const signature = sign(body);

		const response = await request(app)
			.post('/webhooks/square')
			.set('Content-Type', 'application/json')
			.set('x-square-hmacsha256-signature', signature)
			.send(body);

		expect(response.status).toBe(200);
	});

	it('ignores event types other than invoice.payment_made, but still acknowledges with 200', async () => {
		const app = buildApp();
		const body = JSON.stringify({ type: 'invoice.created', data: { object: { invoice: { id: 'inv:whatever', status: 'DRAFT' } } } });
		const signature = sign(body);

		const response = await request(app)
			.post('/webhooks/square')
			.set('Content-Type', 'application/json')
			.set('x-square-hmacsha256-signature', signature)
			.send(body);

		expect(response.status).toBe(200);
	});

	it('does not un-pay an appointment already marked paid (idempotent-ish)', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const appointment = await createAppointment(artist.id, {
			shopId: shop.id,
			shopCutStatus: 'paid',
			shopCutSquareInvoiceId: 'inv:alreadypaid',
			shopCutConfirmedAt: new Date('2020-01-01'),
		});

		const app = buildApp();
		const body = paymentMadeEvent('inv:alreadypaid', 'PAID');
		const signature = sign(body);

		await request(app)
			.post('/webhooks/square')
			.set('Content-Type', 'application/json')
			.set('x-square-hmacsha256-signature', signature)
			.send(body);

		const stored = await Appointment.findById(appointment.id);
		expect(stored.shopCutStatus).toBe('paid');
		// The route's own `appointment.shopCutStatus !== 'paid'` guard means it should never even
		// attempt a redundant save here - shopCutConfirmedAt should be untouched.
		expect(stored.shopCutConfirmedAt.toISOString()).toBe(new Date('2020-01-01').toISOString());
	});
});
