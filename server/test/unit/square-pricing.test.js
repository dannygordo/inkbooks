// describe/it/expect come from Vitest's `globals: true` config (see server/vitest.config.js).
//
// These cover the PURE half of utils/square-pricing.js only - computeChargeBreakdown,
// computeFeeOffsetCents and roundCents. `resolveSquareSettings` is deliberately not here: it hits
// Mongo, so it belongs with the integration suites, and the shop-first/artist-when-independent
// rule it implements (DECISIONS.md M8) is not arithmetic.
//
// Every expected number below is either lifted verbatim from a worked example in DECISIONS.md or
// hand-computed from the rule that section states. Where a figure comes from the document, the
// section is named - so that if this file and DECISIONS.md ever disagree, it is obvious which one
// moved.
const {
	computeChargeBreakdown,
	computeFeeOffsetCents,
	roundCents,
} = require('../../utils/square-pricing');

describe('roundCents', () => {
	// Math.round is half-up toward +Infinity, which is what a till does. Naming it in a test
	// because the choice is invisible at the call sites and matters at every one of them.
	it('rounds a half up', () => {
		expect(roundCents(0.5)).toBe(1);
		expect(roundCents(1.5)).toBe(2);
		expect(roundCents(2.5)).toBe(3);
	});

	it('leaves whole cents alone', () => {
		expect(roundCents(1748)).toBe(1748);
		expect(roundCents(0)).toBe(0);
	});

	// Toward +Infinity, not away from zero - so -0.5 rounds to 0 rather than -1. No caller should
	// be feeding this a negative, but if one ever does, this is what happens.
	it('rounds a negative half toward zero, not away from it', () => {
		expect(roundCents(-0.5)).toBe(-0);
		expect(roundCents(-1.5)).toBe(-1);
	});
});

describe('computeFeeOffsetCents', () => {
	// DECISIONS.md M5, stated verbatim: "At $180/hr with a $6 offset: one hour recovers $6 against
	// a $5.39 fee. Six hours recovers $36 against $31.84."
	it('recovers $6 on a one-hour session at $180/hr', () => {
		expect(
			computeFeeOffsetCents({
				subtotalCents: 18000,
				hourlyRateCents: 18000,
				feeOffsetPerHourCents: 600,
			}),
		).toBe(600);
	});

	it('recovers $36 on a six-hour session at $180/hr', () => {
		expect(
			computeFeeOffsetCents({
				subtotalCents: 108000,
				hourlyRateCents: 18000,
				feeOffsetPerHourCents: 600,
			}),
		).toBe(3600);
	});

	// The point of deriving from the total rather than the booked duration (M5): a flat-priced
	// session has no hours, but $540 at $180/hr implies three, and the answer is the same as it
	// would be for a three-hour hourly booking.
	it('gives a flat-priced session the same answer as the equivalent hourly one', () => {
		const flat = computeFeeOffsetCents({
			subtotalCents: 54000,
			hourlyRateCents: 18000,
			feeOffsetPerHourCents: 600,
		});
		expect(flat).toBe(1800);
	});

	// A deposit has no hours either. $100 at $180/hr implies 0.5555... hours; 600 x that is
	// 333.33, rounded to 333.
	it('handles a deposit, which has no duration at all', () => {
		expect(
			computeFeeOffsetCents({
				subtotalCents: 10000,
				hourlyRateCents: 18000,
				feeOffsetPerHourCents: 600,
			}),
		).toBe(333);
	});

	// An unconfigured offset is the normal state, not an error. A charge must never fail because
	// nobody filled in a settings field.
	it('returns 0 when any input is missing rather than throwing', () => {
		expect(computeFeeOffsetCents({})).toBe(0);
		expect(
			computeFeeOffsetCents({ subtotalCents: 18000, hourlyRateCents: 18000 }),
		).toBe(0);
		expect(
			computeFeeOffsetCents({ subtotalCents: 18000, feeOffsetPerHourCents: 600 }),
		).toBe(0);
		expect(
			computeFeeOffsetCents({ hourlyRateCents: 18000, feeOffsetPerHourCents: 600 }),
		).toBe(0);
	});

	// Guards against a divide-by-zero producing Infinity and an Infinity total downstream.
	it('returns 0 for a zero hourly rate instead of dividing by it', () => {
		expect(
			computeFeeOffsetCents({
				subtotalCents: 18000,
				hourlyRateCents: 0,
				feeOffsetPerHourCents: 600,
			}),
		).toBe(0);
	});
});

describe('computeChargeBreakdown', () => {
	describe('the offset is a choice, never silent (M5)', () => {
		it('leaves the offset out entirely when applyFeeOffset is false', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 18000,
				hourlyRateCents: 18000,
				feeOffsetPerHourCents: 600,
				taxRateBasisPoints: 940,
				applyFeeOffset: false,
			});
			expect(b.feeOffsetCents).toBe(0);
			expect(b.taxableCents).toBe(18000);
		});

		it('defaults to leaving it out when the caller says nothing', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 18000,
				hourlyRateCents: 18000,
				feeOffsetPerHourCents: 600,
			});
			expect(b.feeOffsetCents).toBe(0);
		});
	});

	describe('the offset joins the taxable base (M8, consequence 1)', () => {
		// $180 session, $6/hr offset, 9.4% tax. Taxable is 18600, not 18000: the offset is part of
		// the service price, so it is taxed. 18600 x 940 / 10000 = 1748.4 -> 1748.
		it('taxes the offset along with the session', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 18000,
				hourlyRateCents: 18000,
				feeOffsetPerHourCents: 600,
				taxRateBasisPoints: 940,
				applyFeeOffset: true,
			});
			expect(b.feeOffsetCents).toBe(600);
			expect(b.taxableCents).toBe(18600);
			expect(b.taxCents).toBe(1748);
			expect(b.totalCents).toBe(20348);
		});

		// The same session without the offset is taxed on 18000 -> 1692. The 56-cent difference is
		// the tax on the offset, and it is the whole point of the ordering.
		it('produces exactly the tax on the offset as the difference', () => {
			const withOffset = computeChargeBreakdown({
				subtotalCents: 18000,
				hourlyRateCents: 18000,
				feeOffsetPerHourCents: 600,
				taxRateBasisPoints: 940,
				applyFeeOffset: true,
			});
			const without = computeChargeBreakdown({
				subtotalCents: 18000,
				taxRateBasisPoints: 940,
			});
			expect(without.taxCents).toBe(1692);
			expect(withOffset.taxCents - without.taxCents).toBe(56);
		});
	});

	describe('tax is basis points, not a float (M8)', () => {
		// DECISIONS.md M2's worked figure: a $200 session at 9.4% carries $18.80 of tax, of which a
		// 40% cut would be $7.52 - the number that section uses to argue the cut excludes tax.
		it('computes $18.80 of tax on a $200 session at 940bp', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 20000,
				taxRateBasisPoints: 940,
			});
			expect(b.taxCents).toBe(1880);
			expect(roundCents(b.taxCents * 0.4)).toBe(752);
		});

		it('rounds a half-cent of tax up rather than down', () => {
			// 5000 x 941 / 10000 = 470.5 exactly.
			const b = computeChargeBreakdown({
				subtotalCents: 5000,
				taxRateBasisPoints: 941,
			});
			expect(b.taxCents).toBe(471);
		});

		it('charges no tax at a zero rate', () => {
			const b = computeChargeBreakdown({ subtotalCents: 18000 });
			expect(b.taxCents).toBe(0);
			expect(b.totalCents).toBe(18000);
		});
	});

	describe('a deposit comes off the base, a gift card off the total (M8)', () => {
		// A deposit was ITS OWN TAXED TRANSACTION at collection (M11), so the portion of the work
		// it covers has already been taxed. The session taxes only what is left.
		it('reduces the taxable base when a deposit is applied', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 50000,
				taxRateBasisPoints: 940,
				depositCreditCents: 20000,
			});
			expect(b.netSubtotalCents).toBe(30000);
			expect(b.taxableCents).toBe(30000);
			expect(b.taxCents).toBe(2820);
			expect(b.amountDueCents).toBe(32820);
		});

		// DECISIONS.md M8's worked example, from the other end: the deposit was billed
		// $200 + $18.80 at the consult, the sitting bills $300 + $28.20, and the state receives
		// 9.4% of $500 across the two - once.
		it('taxes the whole job exactly once across the two transactions', () => {
			const depositCharge = computeChargeBreakdown({
				subtotalCents: 20000,
				taxRateBasisPoints: 940,
			});
			const sessionCharge = computeChargeBreakdown({
				subtotalCents: 50000,
				taxRateBasisPoints: 940,
				depositCreditCents: 20000,
			});
			expect(depositCharge.taxCents).toBe(1880);
			expect(sessionCharge.taxCents).toBe(2820);
			expect(depositCharge.taxCents + sessionCharge.taxCents).toBe(4700);
			// 9.4% of the $500 job, computed directly.
			expect(computeChargeBreakdown({ subtotalCents: 50000, taxRateBasisPoints: 940 }).taxCents)
				.toBe(4700);
		});

		// A gift card was sold UNTAXED (M6), so tax on the whole session is still owed and the card
		// is a payment instrument against the taxed total.
		it('does not reduce tax when a gift card is applied', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 50000,
				taxRateBasisPoints: 940,
				giftCardCents: 20000,
			});
			expect(b.taxableCents).toBe(50000);
			expect(b.taxCents).toBe(4700);
			expect(b.totalCents).toBe(54700);
			expect(b.amountDueCents).toBe(34700);
		});

		// The distinction, side by side on the same job. The state gets $47 either way; only the
		// timing differs.
		it('collects the same tax on a job whether it was prepaid by deposit or gift card', () => {
			const viaDeposit = computeChargeBreakdown({
				subtotalCents: 50000,
				taxRateBasisPoints: 940,
				depositCreditCents: 20000,
			});
			const viaGiftCard = computeChargeBreakdown({
				subtotalCents: 50000,
				taxRateBasisPoints: 940,
				giftCardCents: 20000,
			});
			// The deposit already carried $18.80 of tax at collection; the gift card carried none.
			expect(viaDeposit.taxCents + 1880).toBe(viaGiftCard.taxCents);
		});

		it('applies a deposit and a gift card together, each at its own point', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 50000,
				taxRateBasisPoints: 940,
				depositCreditCents: 20000,
				giftCardCents: 10000,
			});
			// Base is $300 after the deposit, tax $28.20, total $328.20, card takes $100 off.
			expect(b.taxCents).toBe(2820);
			expect(b.totalCents).toBe(32820);
			expect(b.amountDueCents).toBe(22820);
		});

		// The offset recovers the processing fee on the money being charged NOW - the fee on the
		// deposit was recovered by the offset taken at collection (M5, M11).
		it('derives the offset from the net subtotal, not the gross', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 54000,
				hourlyRateCents: 18000,
				feeOffsetPerHourCents: 600,
				applyFeeOffset: true,
				depositCreditCents: 18000,
			});
			// $360 remaining is two implied hours, so $12 - not the $18 the gross would give.
			expect(b.feeOffsetCents).toBe(1200);
		});
	});

	describe('credits clamp at zero (M8)', () => {
		// DECISIONS.md M8, verbatim: "A $100 deposit against an $80 final sitting bills $0 - never
		// a negative that would read as owing the client money."
		it('bills $0, not a negative, on a $100 deposit against an $80 sitting', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 8000,
				depositCreditCents: 10000,
			});
			expect(b.amountDueCents).toBe(0);
		});

		it('bills $0 on an over-large gift card too', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 8000,
				giftCardCents: 50000,
			});
			expect(b.amountDueCents).toBe(0);
		});

		// A negative credit must not become a surcharge. Guarded per-credit, before summing, so one
		// negative cannot cancel out another credit either.
		it('ignores a negative credit rather than adding it to the bill', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 20000,
				depositCreditCents: -5000,
			});
			expect(b.amountDueCents).toBe(20000);
		});

		it('does not let a negative gift card eat a real deposit', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 20000,
				depositCreditCents: 5000,
				giftCardCents: -5000,
			});
			expect(b.amountDueCents).toBe(15000);
		});

		// Returns the CLAMPED figure, not the raw input. It used to echo the raw one, so a negative
		// credit came back negative beside an unreduced total - which a confirmation screen would
		// render as a discount that had not been given.
		it('reports the credit that was actually used, not the raw input', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 20000,
				depositCreditCents: -5000,
				giftCardCents: -5000,
			});
			expect(b.depositCreditCents).toBe(0);
			expect(b.giftCardCents).toBe(0);
			expect(b.amountDueCents).toBe(20000);
		});

		// A deposit larger than the sitting must not produce a negative base, which would invert
		// the tax into a credit owed to the client.
		it('never lets an over-large deposit invert the tax', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 8000,
				taxRateBasisPoints: 940,
				depositCreditCents: 50000,
			});
			expect(b.netSubtotalCents).toBe(0);
			expect(b.taxCents).toBe(0);
			expect(b.amountDueCents).toBe(0);
		});
	});

	describe('tips sit outside the taxable base and the cut (M2, M8)', () => {
		it('adds the tip to what the card is charged and nowhere else', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 18000,
				taxRateBasisPoints: 940,
				tipCents: 5000,
			});
			expect(b.taxableCents).toBe(18000);
			expect(b.taxCents).toBe(1692);
			expect(b.totalCents).toBe(24692);
			expect(b.tipCents).toBe(5000);
		});

		it('does not tax the tip even when an offset is also applied', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 18000,
				hourlyRateCents: 18000,
				feeOffsetPerHourCents: 600,
				taxRateBasisPoints: 940,
				applyFeeOffset: true,
				tipCents: 5000,
			});
			expect(b.taxableCents).toBe(18600);
			expect(b.taxCents).toBe(1748);
			expect(b.totalCents).toBe(25348);
		});
	});

	describe('a deposit charge is the same arithmetic (M3)', () => {
		// A consult holding a deposit gets subtotalCents set to the deposit amount, so the same
		// function prices it. $200 deposit, 9.4% tax, $6/hr offset at $180/hr -> implied 1.111 hrs,
		// offset 667, taxable 20667, tax 1942.7 -> 1943.
		it('prices a $200 deposit with the offset and tax', () => {
			const b = computeChargeBreakdown({
				subtotalCents: 20000,
				hourlyRateCents: 18000,
				feeOffsetPerHourCents: 600,
				taxRateBasisPoints: 940,
				applyFeeOffset: true,
			});
			expect(b.feeOffsetCents).toBe(667);
			expect(b.taxableCents).toBe(20667);
			expect(b.taxCents).toBe(1943);
			expect(b.amountDueCents).toBe(22610);
		});
	});

	describe('defaults', () => {
		it('returns an all-zero breakdown for an empty call rather than NaN', () => {
			const b = computeChargeBreakdown({});
			expect(b).toEqual({
				subtotalCents: 0,
				depositCreditCents: 0,
				netSubtotalCents: 0,
				feeOffsetCents: 0,
				taxableCents: 0,
				taxCents: 0,
				tipCents: 0,
				totalCents: 0,
				giftCardCents: 0,
				amountDueCents: 0,
			});
		});

		// Every figure a caller might render must be a number. A single undefined here becomes NaN
		// on a confirmation screen.
		it('returns a number in every field', () => {
			const b = computeChargeBreakdown({ subtotalCents: 18000, taxRateBasisPoints: 940 });
			for (const [key, value] of Object.entries(b)) {
				expect(typeof value, `${key} should be a number`).toBe('number');
				expect(Number.isNaN(value), `${key} should not be NaN`).toBe(false);
			}
		});
	});
});
