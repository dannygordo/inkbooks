// Integration tests for the shop-cut ledger mutations (mutations/shopCutPayments.js) - the
// dual-control manual-pay flow (markShopCutPaidManually -> confirmShopCutPaid) plus
// createShopCutInvoice's precondition checks. square.createAndPublishShopCutInvoice is mocked -
// it makes real HTTPS calls to Square's API (sandbox or production) and there's no reason a unit/
// integration test should depend on network access or real Square credentials; everything else in
// utils/square.js (computeGrossedUpAmountCents, verifyWebhookSignature) is already covered for
// real in test/unit/square.test.js and test/integration/squareWebhook.test.js.
// describe/it/expect/vi/beforeEach come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createShopAdminUser, createAppointment } = require('../helpers/factories');
const Shop = require('../../models/Shop');
const Appointment = require('../../models/Appointment');

const square = require('../../utils/square');

const CREATE_SHOP_CUT_INVOICE = `
	mutation CreateShopCutInvoice($appointmentId: ID!, $paymentMethod: String) {
		createShopCutInvoice(appointmentId: $appointmentId, paymentMethod: $paymentMethod) {
			invoiceUrl
			appointment {
				id
				shopCutStatus
			}
		}
	}
`;

const MARK_PAID_MANUALLY = `
	mutation MarkShopCutPaidManually($appointmentId: ID!) {
		markShopCutPaidManually(appointmentId: $appointmentId) {
			id
			shopCutStatus
		}
	}
`;

const CONFIRM_SHOP_CUT_PAID = `
	mutation ConfirmShopCutPaid($appointmentId: ID!) {
		confirmShopCutPaid(appointmentId: $appointmentId) {
			id
			shopCutStatus
		}
	}
`;

async function connectedShop() {
	const { shop } = await createShopAdminUser();
	shop.squareConnected = true;
	shop.squareLocationId = 'L_TEST_LOCATION';
	await shop.save();
	return shop;
}

// vi.mock() targets Vitest's ESM import graph - this whole suite is CommonJS (see the note at the
// top of this file on `globals: true`), so a plain require() call falls outside that graph and
// vi.mock() would silently replace a *different* module instance than the one
// graphql/mutations/shopCutPayments.js actually requires (Node's require cache would otherwise
// still hand that resolver the real, un-mocked function). vi.spyOn instead mutates the property
// directly on the one shared require-cache object both this file and the resolver reference, so
// the mock actually takes effect where it needs to.
let createInvoiceSpy;

beforeEach(() => {
	createInvoiceSpy = vi.spyOn(square, 'createAndPublishShopCutInvoice');
});

afterEach(() => {
	createInvoiceSpy.mockRestore();
});

describe('createShopCutInvoice', () => {
	it('rejects a caller who is not the appointment\'s own artist', async () => {
		const { user: owner } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const shop = await connectedShop();
		const appointment = await createAppointment(owner.id, { shopId: shop.id, shopCutAmount: 50, shopCutStatus: 'unpaid' });
		const token = signTestToken(otherArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_SHOP_CUT_INVOICE, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		// createShopCutInvoice(...): ShopCutInvoiceResult! is non-null in the schema, so a thrown
		// resolver error nulls out `data` itself, not just `data.createShopCutInvoice` - same rule
		// noted in auth.test.js.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Only the artist on this appointment/);
		expect(square.createAndPublishShopCutInvoice).not.toHaveBeenCalled();
	});

	it('rejects an appointment with no shop attached', async () => {
		const { user: owner } = await createArtistUser();
		const appointment = await createAppointment(owner.id); // no shopId
		const token = signTestToken(owner);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_SHOP_CUT_INVOICE, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { data } = response.body.singleResult;
		expect(data).toBeNull();
	});

	it('rejects a shop cut that has already been paid', async () => {
		const { user: owner } = await createArtistUser();
		const shop = await connectedShop();
		const appointment = await createAppointment(owner.id, { shopId: shop.id, shopCutAmount: 50, shopCutStatus: 'paid' });
		const token = signTestToken(owner);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_SHOP_CUT_INVOICE, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		// Thrown via UserInputError('Errors', { errors: { appointmentId: '...' } }) - the detail is
		// in extensions.errors.appointmentId, not message (which is literally "Errors").
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.appointmentId).toMatch(/already been paid/);
	});

	it('rejects a shop that has not connected Square', async () => {
		const { user: owner } = await createArtistUser();
		const { shop } = await createShopAdminUser(); // squareConnected defaults to false
		const appointment = await createAppointment(owner.id, { shopId: shop.id, shopCutAmount: 50, shopCutStatus: 'unpaid' });
		const token = signTestToken(owner);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_SHOP_CUT_INVOICE, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.appointmentId).toMatch(/has not connected a Square account/);
	});

	it('on success: calls Square with the grossed-up amount and marks the appointment invoice_sent', async () => {
		const { user: owner } = await createArtistUser();
		const shop = await connectedShop();
		const appointment = await createAppointment(owner.id, { shopId: shop.id, shopCutAmount: 50, shopCutStatus: 'unpaid' });
		square.createAndPublishShopCutInvoice.mockResolvedValue({
			invoiceId: 'inv:test123',
			publicUrl: 'https://squareup.com/invoice/test123',
		});
		const token = signTestToken(owner);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_SHOP_CUT_INVOICE, variables: { appointmentId: appointment.id, paymentMethod: 'card' } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createShopCutInvoice.invoiceUrl).toBe('https://squareup.com/invoice/test123');
		expect(data.createShopCutInvoice.appointment.shopCutStatus).toBe('invoice_sent');

		expect(square.createAndPublishShopCutInvoice).toHaveBeenCalledTimes(1);
		const callArgs = square.createAndPublishShopCutInvoice.mock.calls[0][0];
		expect(callArgs.targetAmountCents).toBe(5000); // $50 -> 5000 cents
		expect(callArgs.paymentMethod).toBe('card');

		const stored = await Appointment.findById(appointment.id);
		expect(stored.shopCutSquareInvoiceId).toBe('inv:test123');
		expect(stored.shopCutPaymentMethod).toBe('square_invoice');
	});
});

describe('markShopCutPaidManually -> confirmShopCutPaid: dual control', () => {
	it('markShopCutPaidManually rejects anyone but the appointment\'s own artist', async () => {
		const { user: owner } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const shop = await connectedShop();
		const appointment = await createAppointment(owner.id, { shopId: shop.id, shopCutAmount: 50, shopCutStatus: 'unpaid' });
		const token = signTestToken(otherArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: MARK_PAID_MANUALLY, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		// markShopCutPaidManually(...): Appointment! is non-null in the schema, so a thrown
		// resolver error nulls out `data` itself, not just `data.markShopCutPaidManually`.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Only the artist on this appointment can mark it paid/);
	});

	it('markShopCutPaidManually moves status to pending_confirmation, NOT straight to paid', async () => {
		const { user: owner } = await createArtistUser();
		const shop = await connectedShop();
		const appointment = await createAppointment(owner.id, { shopId: shop.id, shopCutAmount: 50, shopCutStatus: 'unpaid' });
		const token = signTestToken(owner);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: MARK_PAID_MANUALLY, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.markShopCutPaidManually.shopCutStatus).toBe('pending_confirmation');

		const stored = await Appointment.findById(appointment.id);
		expect(stored.shopCutPaymentMethod).toBe('manual');
		expect(String(stored.shopCutMarkedPaidBy)).toBe(String(owner.id));
		expect(stored.shopCutMarkedPaidAt).toBeInstanceOf(Date);
	});

	it('confirmShopCutPaid rejects a caller below SHOP_ADMIN', async () => {
		const { user: owner } = await createArtistUser();
		const shop = await connectedShop();
		const appointment = await createAppointment(owner.id, { shopId: shop.id, shopCutAmount: 50, shopCutStatus: 'pending_confirmation' });
		const token = signTestToken(owner); // ARTIST role, not SHOP_ADMIN
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CONFIRM_SHOP_CUT_PAID, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		// confirmShopCutPaid(...): Appointment! is non-null in the schema, so a thrown resolver
		// error nulls out `data` itself, not just `data.confirmShopCutPaid`.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('confirmShopCutPaid rejects an appointment that is not awaiting confirmation', async () => {
		const { user: owner } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const appointment = await createAppointment(owner.id, { shopId: shop.id, shopCutAmount: 50, shopCutStatus: 'unpaid' });
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CONFIRM_SHOP_CUT_PAID, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		// Thrown via UserInputError('Errors', { errors: { appointmentId: '...' } }) - the detail is
		// in extensions.errors.appointmentId, not message (which is literally "Errors").
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.appointmentId).toMatch(/not awaiting confirmation/);
	});

	it('confirmShopCutPaid completes the loop: pending_confirmation -> paid', async () => {
		const { user: owner } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const appointment = await createAppointment(owner.id, {
			shopId: shop.id,
			shopCutAmount: 50,
			shopCutStatus: 'pending_confirmation',
			shopCutMarkedPaidBy: owner.id,
			shopCutMarkedPaidAt: new Date(),
		});
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CONFIRM_SHOP_CUT_PAID, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.confirmShopCutPaid.shopCutStatus).toBe('paid');

		const stored = await Appointment.findById(appointment.id);
		expect(String(stored.shopCutConfirmedBy)).toBe(String(shopAdmin.id));
		expect(stored.shopCutConfirmedAt).toBeInstanceOf(Date);
	});
});
