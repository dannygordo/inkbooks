// Integration tests for recordAdjustment and Appointment.adjustments - DECISIONS.md M4.
//
// The rule worth locking down is the authorization asymmetry M4 states in words: shop-admin only
// where there is a shop, and an unaffiliated artist adjusts their own. That's exactly
// utils/shop-membership.js's canManageArtist at its default floor, reused rather than
// reimplemented - see resolvers/adjustments.js's own comment.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	connectArtistToShop,
	createAppointment,
} = require('../helpers/factories');
const Appointment = require('../../models/Appointment');

const RECORD_ADJUSTMENT = `
	mutation RecordAdjustment($input: RecordAdjustmentInput!) {
		recordAdjustment(input: $input) {
			id
			appointmentId
			shopId
			artistUserId
			amountCents
			reason
			createdByUserId
		}
	}
`;

const GET_APPOINTMENT_ADJUSTMENTS = `
	query GetAppointment($appointmentId: ID!) {
		getAppointment(appointmentId: $appointmentId) {
			id
			totalCents
			adjustments {
				id
				amountCents
				reason
			}
		}
	}
`;

describe('recordAdjustment', () => {
	it("lets an independent artist record an adjustment on their own appointment", async () => {
		const { user: artist } = await createArtistUser();
		const appointment = await createAppointment(artist.id, {
			appointmentStatus: 'completed',
			totalCents: 20000,
		});

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RECORD_ADJUSTMENT,
				variables: {
					input: { appointmentId: appointment.id, amountCents: 5000, reason: 'Reversed in Square by hand' },
				},
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.recordAdjustment.amountCents).toBe(5000);
		expect(data.recordAdjustment.reason).toBe('Reversed in Square by hand');
		expect(data.recordAdjustment.shopId).toBeNull();
		expect(data.recordAdjustment.artistUserId).toBe(String(artist.id));

		// The appointment's own figures are untouched - see models/Adjustment.js's own comment on
		// why this is a record, not a rewrite.
		const stored = await Appointment.findById(appointment.id);
		expect(stored.totalCents).toBe(20000);
	});

	it("refuses an unaffiliated artist recording an adjustment on someone else's appointment", async () => {
		const { user: owner } = await createArtistUser();
		const { user: outsider } = await createArtistUser();
		const appointment = await createAppointment(owner.id, { totalCents: 20000 });

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RECORD_ADJUSTMENT,
				variables: { input: { appointmentId: appointment.id, amountCents: 1000, reason: 'Not mine' } },
			},
			{ contextValue: contextWithToken(signTestToken(outsider)) },
		);

		// recordAdjustment is declared non-null in the schema (Adjustment!) - per the GraphQL spec,
		// an error thrown resolving a non-null field nulls the field, and since it can't be null,
		// that nullability bubbles up to `data` itself rather than leaving `data: { recordAdjustment:
		// null }`. Asserting on the whole `data` object (not the field) is what actually matches how
		// Apollo Server serializes this.
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});

	it('lets a shop admin at the artist\'s own shop record an adjustment', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop.id);
		const appointment = await createAppointment(artist.id, { shopId: shop.id, totalCents: 20000 });

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RECORD_ADJUSTMENT,
				variables: {
					input: { appointmentId: appointment.id, amountCents: 2500, reason: 'Client disputed the charge' },
				},
			},
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors, data } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.recordAdjustment.shopId).toBe(String(shop.id));
	});

	it("refuses a shop admin at a DIFFERENT shop from the artist's", async () => {
		const { user: shopAdmin } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		const appointment = await createAppointment(artist.id, { totalCents: 20000 });

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RECORD_ADJUSTMENT,
				variables: { input: { appointmentId: appointment.id, amountCents: 1000, reason: 'Wrong shop' } },
			},
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		// recordAdjustment is declared non-null in the schema (Adjustment!) - per the GraphQL spec,
		// an error thrown resolving a non-null field nulls the field, and since it can't be null,
		// that nullability bubbles up to `data` itself rather than leaving `data: { recordAdjustment:
		// null }`. Asserting on the whole `data` object (not the field) is what actually matches how
		// Apollo Server serializes this.
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});

	it('rejects a zero or negative amount', async () => {
		const { user: artist } = await createArtistUser();
		const appointment = await createAppointment(artist.id, { totalCents: 20000 });

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RECORD_ADJUSTMENT,
				variables: { input: { appointmentId: appointment.id, amountCents: 0, reason: 'Should fail' } },
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		// recordAdjustment is declared non-null in the schema (Adjustment!) - per the GraphQL spec,
		// an error thrown resolving a non-null field nulls the field, and since it can't be null,
		// that nullability bubbles up to `data` itself rather than leaving `data: { recordAdjustment:
		// null }`. Asserting on the whole `data` object (not the field) is what actually matches how
		// Apollo Server serializes this.
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors.amountCents).toBeTruthy();
	});

	it('rejects an empty reason', async () => {
		const { user: artist } = await createArtistUser();
		const appointment = await createAppointment(artist.id, { totalCents: 20000 });

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RECORD_ADJUSTMENT,
				variables: { input: { appointmentId: appointment.id, amountCents: 500, reason: '   ' } },
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		// recordAdjustment is declared non-null in the schema (Adjustment!) - per the GraphQL spec,
		// an error thrown resolving a non-null field nulls the field, and since it can't be null,
		// that nullability bubbles up to `data` itself rather than leaving `data: { recordAdjustment:
		// null }`. Asserting on the whole `data` object (not the field) is what actually matches how
		// Apollo Server serializes this.
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors.reason).toBeTruthy();
	});
});

describe('Appointment.adjustments', () => {
	it("lists an appointment's adjustments newest first, without changing its own totals", async () => {
		const { user: artist } = await createArtistUser();
		const appointment = await createAppointment(artist.id, { totalCents: 20000 });

		const server = createTestServer();
		const token = signTestToken(artist);
		await server.executeOperation(
			{
				query: RECORD_ADJUSTMENT,
				variables: { input: { appointmentId: appointment.id, amountCents: 1000, reason: 'First' } },
			},
			{ contextValue: contextWithToken(token) },
		);
		await server.executeOperation(
			{
				query: RECORD_ADJUSTMENT,
				variables: { input: { appointmentId: appointment.id, amountCents: 2000, reason: 'Second' } },
			},
			{ contextValue: contextWithToken(token) },
		);

		const res = await server.executeOperation(
			{ query: GET_APPOINTMENT_ADJUSTMENTS, variables: { appointmentId: appointment.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getAppointment.totalCents).toBe(20000);
		expect(data.getAppointment.adjustments).toHaveLength(2);
		expect(data.getAppointment.adjustments[0].reason).toBe('Second');
		expect(data.getAppointment.adjustments[1].reason).toBe('First');
	});
});
