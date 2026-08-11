// What a charge comes to, resolved against real stored rates. See DECISIONS.md M5/M8 and
// utils/charge-quote.js.
//
// test/unit/square-pricing.test.js already covers computeChargeBreakdown's arithmetic exhaustively
// - but every one of those tests passes hourlyRateCents in by hand, so none of them touch
// resolveSquareSettings, which is where the units actually get read off a document. That gap hid a
// real bug: hourlyRate is stored in whole DOLLARS and was being assigned straight to a field named
// hourlyRateCents, so a one-hour session at $180 implied 100 hours and a $6 offset came out at
// $600. The first test below is the one that would have caught it.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { resolveSquareSettings } = require('../../utils/square-pricing');
const { quoteAppointmentCharge, quoteDepositCharge } = require('../../utils/charge-quote');
const Appointment = require('../../models/Appointment');
const Artist = require('../../models/Artist');
const Shop = require('../../models/Shop');
const {
	createArtistUser,
	createShopAdminUser,
	connectArtistToShop,
	createAppointment,
} = require('../helpers/factories');

// $180/hr, 9.4% tax, $6/hr offset - the exact configuration DECISIONS.md M5 and M2 work through.
async function shopWithRates(overrides = {}) {
	const { shop } = await createShopAdminUser();
	shop.hourlyRate = 180; // DOLLARS, as stored
	shop.taxRateBasisPoints = 940;
	shop.squareFeeOffsetCents = 600;
	Object.assign(shop, overrides);
	await shop.save();
	return shop;
}

describe('resolveSquareSettings: units', () => {
	// THE REGRESSION TEST. 180 dollars is 18000 cents, and the field says cents.
	it('converts the shop hourly rate from dollars to cents', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);

		const settings = await resolveSquareSettings(user.id);
		expect(settings.hourlyRateCents).toBe(18000);
		expect(settings.source).toBe('shop');
	});

	it('converts an independent artist\'s hourly rate the same way', async () => {
		const { user, artist } = await createArtistUser();
		artist.hourlyRate = 150;
		artist.taxRateBasisPoints = 800;
		artist.squareFeeOffsetCents = 500;
		await artist.save();

		const settings = await resolveSquareSettings(user.id);
		expect(settings.hourlyRateCents).toBe(15000);
		expect(settings.source).toBe('artist');
	});

	// squareFeeOffsetCents and taxRateBasisPoints are declared in their own units and must NOT be
	// converted - pinning that so a future "fix" doesn't multiply them too.
	it('leaves the offset and tax rate alone - they are already in their own units', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);

		const settings = await resolveSquareSettings(user.id);
		expect(settings.feeOffsetCents).toBe(600);
		expect(settings.taxRateBasisPoints).toBe(940);
	});

	it('reports zeros rather than throwing for an artist with nothing configured', async () => {
		const { user } = await createArtistUser();

		const settings = await resolveSquareSettings(user.id);
		expect(settings.hourlyRateCents).toBe(0);
		expect(settings.taxRateBasisPoints).toBe(0);
		expect(settings.feeOffsetCents).toBe(0);
	});
});

describe('quoteAppointmentCharge', () => {
	// M5's worked example, end to end through stored rates rather than hand-passed arguments:
	// one hour at $180 recovers $6, not $600.
	it('applies the offset from M5 at its documented value', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 18000,
		});

		const { breakdown } = await quoteAppointmentCharge(appointment, { applyFeeOffset: true });
		expect(breakdown.feeOffsetCents).toBe(600);
		expect(breakdown.taxableCents).toBe(18600);
		expect(breakdown.taxCents).toBe(1748);
		expect(breakdown.amountDueCents).toBe(20348);
	});

	it('leaves the offset out unless it was asked for (M5)', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 18000,
		});

		const { breakdown } = await quoteAppointmentCharge(appointment);
		expect(breakdown.feeOffsetCents).toBe(0);
		expect(breakdown.taxCents).toBe(1692);
	});

	// The subtotal comes from the SAVED appointment. This is the property the whole redesign rests
	// on - there is no argument that can move it.
	it('takes the subtotal from the appointment, not from the caller', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		const { breakdown } = await quoteAppointmentCharge(appointment, {
			// Not a parameter. Passed anyway, to prove it is ignored.
			subtotalCents: 100,
			tipCents: 0,
		});
		expect(breakdown.subtotalCents).toBe(20000);
	});

	it('adds the tip to what is collected but not to the taxable base (M2)', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 18000,
		});

		const { breakdown } = await quoteAppointmentCharge(appointment, { tipCents: 5000 });
		expect(breakdown.taxableCents).toBe(18000);
		expect(breakdown.taxCents).toBe(1692);
		expect(breakdown.amountDueCents).toBe(24692);
	});

	// M8: a deposit comes off the SUBTOTAL, before tax, because it was already taxed at collection
	// (M11). The sitting taxes only the part of the work not yet paid for.
	it('subtracts a deposit credit before tax, not after', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 50000,
			depositCreditCents: 20000,
		});

		const { breakdown } = await quoteAppointmentCharge(appointment);
		expect(breakdown.netSubtotalCents).toBe(30000);
		expect(breakdown.taxCents).toBe(2820);
		expect(breakdown.amountDueCents).toBe(32820);
	});

	// A session with no price is unfinished, not free. Charging tax and a tip on a zero subtotal
	// would be a charge nobody agreed to.
	it('refuses a session with no price saved on it', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, { shopId: shop.id, subtotalCents: 0 });

		await expect(quoteAppointmentCharge(appointment)).rejects.toThrow(/price/i);
	});

	// M8's owner rule, reaching the quote: an independent artist's own tax rate applies, and a
	// shop artist's does not come from their own record.
	it('uses the artist\'s own rates when they are independent', async () => {
		const { user, artist } = await createArtistUser();
		artist.hourlyRate = 150;
		artist.taxRateBasisPoints = 800;
		await artist.save();
		const appointment = await createAppointment(user.id, { subtotalCents: 20000 });

		const { settings, breakdown } = await quoteAppointmentCharge(appointment);
		expect(settings.source).toBe('artist');
		expect(breakdown.taxCents).toBe(1600);
	});

	it('ignores the artist\'s own tax rate while they are at a shop', async () => {
		const { user, artist } = await createArtistUser();
		artist.taxRateBasisPoints = 800;
		await artist.save();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 20000,
		});

		const { breakdown } = await quoteAppointmentCharge(appointment);
		expect(breakdown.taxCents).toBe(1880); // the shop's 940bp, not the artist's 800
	});
});

describe('quoteDepositCharge', () => {
	async function pendingDeposit(user, shop, depositCents) {
		const appointment = await createAppointment(user.id, {
			shopId: shop ? shop.id : undefined,
			appointmentType: 'consult',
			depositCents,
			depositStatus: 'pending',
		});
		return appointment;
	}

	// A deposit is its own transaction and carries its own tax (M11). $200 at 9.4% is $18.80.
	it('taxes the deposit at collection', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await pendingDeposit(user, shop, 20000);

		const { breakdown } = await quoteDepositCharge(appointment);
		expect(breakdown.taxCents).toBe(1880);
		expect(breakdown.amountDueCents).toBe(21880);
	});

	/**
	 * THE PROPERTY THE TWO HALVES EXIST TO GUARANTEE, asserted end to end against stored rates:
	 * tax the deposit at collection AND deduct it from the session base, and the state receives
	 * 9.4% of the job exactly once. Tax one without the other and the client is either
	 * double-taxed or the state is short.
	 */
	it('taxes a $500 job exactly once across the deposit and the sitting', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);

		const consult = await pendingDeposit(user, shop, 20000);
		const { breakdown: depositBreakdown } = await quoteDepositCharge(consult);

		const session = await createAppointment(user.id, {
			shopId: shop.id,
			subtotalCents: 50000,
			depositCreditCents: 20000,
		});
		const { breakdown: sessionBreakdown } = await quoteAppointmentCharge(session);

		expect(depositBreakdown.taxCents).toBe(1880);
		expect(sessionBreakdown.taxCents).toBe(2820);
		// 9.4% of $500, and not a cent more.
		expect(depositBreakdown.taxCents + sessionBreakdown.taxCents).toBe(4700);
	});

	// M5 is explicit that the offset works "identically for hourly and flat-priced sessions and
	// for deposits". $200 at $180/hr implies 1.111 hours; 600 x that is 667. It joins the taxable
	// base here the same way it does on a session, so tax is on 20667.
	it('applies the offset, and taxes it with the deposit', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await pendingDeposit(user, shop, 20000);

		const { breakdown } = await quoteDepositCharge(appointment, { applyFeeOffset: true });
		expect(breakdown.feeOffsetCents).toBe(667);
		expect(breakdown.taxableCents).toBe(20667);
		expect(breakdown.taxCents).toBe(1943);
		expect(breakdown.amountDueCents).toBe(22610);
	});

	it('takes the amount from the stored pending deposit', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await pendingDeposit(user, shop, 15000);

		const { breakdown } = await quoteDepositCharge(appointment);
		expect(breakdown.subtotalCents).toBe(15000);
	});

	it('refuses a deposit that was already collected', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, {
			shopId: shop.id,
			depositCents: 20000,
			depositStatus: 'available',
		});

		await expect(quoteDepositCharge(appointment)).rejects.toThrow(/already been collected/i);
	});

	it('refuses an appointment with no deposit recorded at all', async () => {
		const { user } = await createArtistUser();
		const shop = await shopWithRates();
		await connectArtistToShop(user.id, shop.id);
		const appointment = await createAppointment(user.id, { shopId: shop.id });

		await expect(quoteDepositCharge(appointment)).rejects.toThrow(/record the deposit/i);
	});
});
