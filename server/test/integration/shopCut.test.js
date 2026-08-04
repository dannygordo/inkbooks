// Integration tests for the shop-cut computation (utils/shop-cut.js).
//
// Worth stating plainly: before this, Appointment.shopCutAmount was never computed by the
// application at all. createAppointment didn't accept it, updateAppointment only echoed back
// whatever was already there, and no UI wrote it - every non-null value in existence came from
// scripts/seed.js. So the shop-cut payout dashboard, the Square invoice flow and the
// pending-confirmations queue were all reading a field that, against real data, was always null.
// These are the first tests of an actual computation.
//
// The rule under test, in one line: the cut is a percentage of the tattoo work and nothing else.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	connectArtistToShop,
	createAppointment,
} = require('../helpers/factories');
const Appointment = require('../../models/Appointment');
const Shop = require('../../models/Shop');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const { applyShopCut, resolveShopCutPercent } = require('../../utils/shop-cut');

async function setupShopWithCut(percent) {
	const { shop } = await createShopAdminUser();
	await Shop.findByIdAndUpdate(shop.id, { shopCutPercent: percent });
	const { user: artist } = await createArtistUser();
	await connectArtistToShop(artist.id, shop.id);
	return { shop, artist };
}

describe('applyShopCut', () => {
	it('excludes the tip entirely - the artist keeps 100% of it', async () => {
		const { shop, artist } = await setupShopWithCut(40);
		// $400 of work, $100 tip. 40% of the WORK is $160. 40% of the $500 collected would be
		// $200 - the $40 difference is the artist's tip being taxed by the shop, which is exactly
		// what must never happen.
		const appointment = await createAppointment(artist.id, {
			shopId: shop.id,
			subtotalCents: 40000,
			tipCents: 10000,
			totalCents: 50000,
		});

		await applyShopCut(appointment);

		expect(appointment.shopCutCents).toBe(16000);
		expect(appointment.shopCutPercentApplied).toBe(40);
	});

	it('excludes tax and processing fees too', async () => {
		const { shop, artist } = await setupShopWithCut(50);
		// $200 work, $16.50 tax, $6.30 in fees, $40 tip. Only the $200 is the artist's income;
		// the tax belongs to the state and the fee already went to Square.
		const appointment = await createAppointment(artist.id, {
			shopId: shop.id,
			subtotalCents: 20000,
			taxCents: 1650,
			feeCents: 630,
			tipCents: 4000,
			totalCents: 26280,
		});

		await applyShopCut(appointment);

		expect(appointment.shopCutCents).toBe(10000);
	});

	it('rounds to the nearest whole cent rather than producing a fraction of one', async () => {
		const { shop, artist } = await setupShopWithCut(33);
		// 33% of $150.05 is $49.5165 - not a representable amount of money.
		const appointment = await createAppointment(artist.id, {
			shopId: shop.id,
			subtotalCents: 15005,
		});

		await applyShopCut(appointment);

		expect(appointment.shopCutCents).toBe(4952);
		expect(Number.isInteger(appointment.shopCutCents)).toBe(true);
	});

	it('owes nothing when the artist has no shop', async () => {
		const { user: artist } = await createArtistUser();
		const appointment = await createAppointment(artist.id, {
			subtotalCents: 50000,
			tipCents: 10000,
		});

		await applyShopCut(appointment);

		expect(appointment.shopCutCents).toBe(0);
		expect(appointment.shopCutStatus).toBe('none');
	});

	it('owes nothing when the shop has not configured a percentage', async () => {
		// The default is 0, deliberately - a shop that never set this must not start silently
		// billing its artists a cut nobody agreed to.
		const { shop, artist } = await setupShopWithCut(0);
		const appointment = await createAppointment(artist.id, {
			shopId: shop.id,
			subtotalCents: 50000,
		});

		await applyShopCut(appointment);

		expect(appointment.shopCutCents).toBe(0);
		expect(appointment.shopCutStatus).toBe('none');
	});

	it('refuses to recompute a cut that has already been invoiced', async () => {
		const { shop, artist } = await setupShopWithCut(40);
		// An invoice for this cut is already sitting in the artist's inbox. Recomputing it here
		// would put the ledger out of sync with a real Square invoice - a stale number is far
		// less damaging than a contradicted one.
		const appointment = await createAppointment(artist.id, {
			shopId: shop.id,
			subtotalCents: 40000,
			shopCutCents: 12000,
			shopCutStatus: 'invoice_sent',
		});

		await applyShopCut(appointment);

		expect(appointment.shopCutCents).toBe(12000);
		expect(appointment.shopCutStatus).toBe('invoice_sent');
	});
});

describe('resolveShopCutPercent', () => {
	it("prefers the artist's connection-level override over the shop's rate", async () => {
		const { shop, artist } = await setupShopWithCut(40);
		await ArtistShopConnection.findOneAndUpdate(
			{ artistId: artist.id, shopId: shop.id },
			{ shopCutPercent: 25 },
		);

		expect(await resolveShopCutPercent(artist.id, shop.id)).toBe(25);
	});

	it('treats an override of 0 as a real value, not as "unset"', async () => {
		// The distinction that forces the override to be nullable rather than defaulting to 0: a
		// guest artist who genuinely owes the shop nothing is a real arrangement, and a `||`
		// fallback would silently charge them the shop's rate instead.
		const { shop, artist } = await setupShopWithCut(40);
		await ArtistShopConnection.findOneAndUpdate(
			{ artistId: artist.id, shopId: shop.id },
			{ shopCutPercent: 0 },
		);

		expect(await resolveShopCutPercent(artist.id, shop.id)).toBe(0);
	});

	it("falls back to the shop's rate when the artist has no override", async () => {
		const { shop, artist } = await setupShopWithCut(40);
		expect(await resolveShopCutPercent(artist.id, shop.id)).toBe(40);
	});
});

describe('createAppointment: shop cut is derived, never accepted from the client', () => {
	const CREATE_APPOINTMENT = `
		mutation CreateAppointment($appointmentInput: AppointmentInput) {
			createAppointment(appointmentInput: $appointmentInput) {
				id
				subtotalCents
				tipCents
				shopCutCents
				shopCutStatus
			}
		}
	`;

	it('computes the cut server-side from the submitted subtotal, ignoring the tip', async () => {
		const { shop, artist } = await setupShopWithCut(30);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_APPOINTMENT,
				variables: {
					appointmentInput: {
						appointmentDate: new Date().toISOString(),
						appointmentType: 'session',
						appointmentStatus: 'scheduled',
						userId: artist.id,
						shopId: shop.id,
						subtotalCents: 30000,
						tipCents: 9000,
						totalCents: 39000,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
				},
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		// 30% of $300, not of $390.
		expect(data.createAppointment.shopCutCents).toBe(9000);
		expect(data.createAppointment.shopCutStatus).toBe('unpaid');

		const stored = await Appointment.findById(data.createAppointment.id);
		expect(stored.shopCutCents).toBe(9000);
		expect(stored.shopCutPercentApplied).toBe(30);
	});
});
