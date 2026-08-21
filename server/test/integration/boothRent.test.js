// Booth rent (Feature 5) - the flat-fee alternative to a percentage shop cut. Two describe blocks:
// the monthly-charge GENERATOR (utils/booth-rent.js's generateDueBoothRentCharges - catch-up,
// eligibility re-checked every run, mid-history repricing) and the dual-control PAYMENT LIFECYCLE
// (mutations/boothRentPayments.js - due -> marked_paid -> confirmed), the direct structural mirror
// of shopCutLedger.test.js's markShopCutPaidManually/confirmShopCutPaid coverage. Flagged in the
// plan as the highest-priority gap to close given real money moves through it and nothing before
// this file exercised any of it against a database.
//
// describe/it/expect/vi/beforeEach come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createShopAdminUser } = require('../helpers/factories');
const BoothRentPlan = require('../../models/BoothRentPlan');
const BoothRentCharge = require('../../models/BoothRentCharge');
const ShopCutRate = require('../../models/ShopCutRate');
const Expense = require('../../models/Expense');
const Income = require('../../models/Income');
const { generateDueBoothRentCharges } = require('../../utils/booth-rent');

function utc(y, m, d) {
	return new Date(Date.UTC(y, m, d));
}

async function createBoothRentPlan(artistId, shopId, setByUserId, overrides = {}) {
	return new BoothRentPlan({
		artistId,
		shopId,
		amountCents: 50000,
		dueDayOfMonth: 5,
		setByUserId,
		effectiveFrom: utc(2026, 0, 15), // Jan 15, 2026
		...overrides,
	}).save();
}

// BOOTH_RENT is expressed as a dated ShopCutRate row (percent: 0, compensationModel: 'BOOTH_RENT')
// - see models/ShopCutRate.js's own header comment on why this needed no changes to the percentage
// resolution at all. Switching back to a percentage is just another dated row.
async function setCompensationModel(artistId, shopId, setByUserId, compensationModel, effectiveFrom) {
	return new ShopCutRate({
		artistId,
		shopId,
		percent: compensationModel === 'BOOTH_RENT' ? 0 : 40,
		compensationModel,
		setByUserId,
		effectiveFrom,
	}).save();
}

async function createBoothRentCharge(artistId, shopId, overrides = {}) {
	return new BoothRentCharge({
		artistId,
		shopId,
		amountCents: 50000,
		periodMonth: utc(2026, 3, 1),
		dueDate: utc(2026, 3, 5),
		status: 'due',
		...overrides,
	}).save();
}

describe('generateDueBoothRentCharges', () => {
	it('skips periods that predate the plan, catches up every due period since, and stops before a not-yet-due one', async () => {
		const { user: artist } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await setCompensationModel(artist._id, shop._id, shopAdmin.id, 'BOOTH_RENT', utc(2026, 0, 1));
		await createBoothRentPlan(artist._id, shop._id, shopAdmin.id); // $500/mo, due the 5th, effective Jan 15

		// "now" is April 10 - Jan predates the plan's effectiveFrom (Jan 15), so Jan is skipped
		// entirely (nothing was owed for it yet); Feb/Mar/Apr are all past their due date (the 5th);
		// May's due date (May 5) is still in the future relative to "now", so generation must stop
		// there rather than manufacturing a charge for a period that isn't due yet.
		const result = await generateDueBoothRentCharges({ now: utc(2026, 3, 10) });

		expect(result.generated).toBe(3);
		expect(result.pairsProcessed).toBe(1);

		const charges = await BoothRentCharge.find({ artistId: artist._id }).sort({ periodMonth: 1 });
		expect(charges).toHaveLength(3);
		expect(charges.map((c) => c.periodMonth.toISOString())).toEqual([
			utc(2026, 1, 1).toISOString(), // Feb
			utc(2026, 2, 1).toISOString(), // Mar
			utc(2026, 3, 1).toISOString(), // Apr
		]);
		expect(charges.every((c) => c.amountCents === 50000)).toBe(true);
		expect(charges.every((c) => c.status === 'due')).toBe(true);
		expect(charges[0].dueDate.toISOString()).toBe(utc(2026, 1, 5).toISOString());
	});

	it('is idempotent - re-running with the same "now" generates nothing new', async () => {
		const { user: artist } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await setCompensationModel(artist._id, shop._id, shopAdmin.id, 'BOOTH_RENT', utc(2026, 0, 1));
		await createBoothRentPlan(artist._id, shop._id, shopAdmin.id);
		await generateDueBoothRentCharges({ now: utc(2026, 3, 10) });

		const second = await generateDueBoothRentCharges({ now: utc(2026, 3, 10) });

		expect(second.generated).toBe(0);
		expect(await BoothRentCharge.countDocuments({ artistId: artist._id })).toBe(3);
	});

	it('a mid-history rent change reprices only future periods - already-generated charges keep their original amount', async () => {
		const { user: artist } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await setCompensationModel(artist._id, shop._id, shopAdmin.id, 'BOOTH_RENT', utc(2026, 0, 1));
		await createBoothRentPlan(artist._id, shop._id, shopAdmin.id); // $500/mo from Jan 15
		await generateDueBoothRentCharges({ now: utc(2026, 3, 10) }); // generates Feb/Mar/Apr @ $500

		// A raise to $650/mo, effective May 1 - append-only, same as ShopCutRate never edits an old row.
		await createBoothRentPlan(artist._id, shop._id, shopAdmin.id, {
			amountCents: 65000,
			effectiveFrom: utc(2026, 4, 1),
		});
		await generateDueBoothRentCharges({ now: utc(2026, 5, 10) }); // catches up May, June

		const charges = await BoothRentCharge.find({ artistId: artist._id }).sort({ periodMonth: 1 });
		expect(charges).toHaveLength(5); // Feb, Mar, Apr, May, June
		const byMonth = Object.fromEntries(charges.map((c) => [c.periodMonth.getUTCMonth(), c.amountCents]));
		expect(byMonth[1]).toBe(50000); // Feb - untouched by the later raise
		expect(byMonth[2]).toBe(50000); // Mar - untouched
		expect(byMonth[3]).toBe(50000); // Apr - untouched (period started before the raise took effect)
		expect(byMonth[4]).toBe(65000); // May - new rate
		expect(byMonth[5]).toBe(65000); // June - new rate
	});

	it('stops generating the moment a pair switches back to PERCENTAGE, even though the BoothRentPlan row still exists', async () => {
		const { user: artist } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await setCompensationModel(artist._id, shop._id, shopAdmin.id, 'BOOTH_RENT', utc(2026, 0, 1));
		await createBoothRentPlan(artist._id, shop._id, shopAdmin.id);
		await generateDueBoothRentCharges({ now: utc(2026, 3, 10) }); // Feb/Mar/Apr @ $500, as above

		// Switches back to a percentage cut starting May 1 - eligibility is re-checked against
		// ShopCutRate every run, not cached on the plan (see this function's own header comment), so
		// generation for this pair must stop even though BoothRentPlan itself was never touched.
		await setCompensationModel(artist._id, shop._id, shopAdmin.id, 'PERCENTAGE', utc(2026, 4, 1));
		const result = await generateDueBoothRentCharges({ now: utc(2026, 5, 10) });

		expect(result.skippedNotOnBoothRent).toBe(1);
		expect(result.generated).toBe(0);
		expect(await BoothRentCharge.countDocuments({ artistId: artist._id })).toBe(3); // still just Feb/Mar/Apr
	});
});

describe('markBoothRentPaidManually -> confirmBoothRentPaid: dual control', () => {
	it('markBoothRentPaidManually rejects anyone but the charge\'s own artist', async () => {
		const { user: owner } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const charge = await createBoothRentCharge(owner._id, shop._id);
		const token = signTestToken(otherArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation($id: ID!) { markBoothRentPaidManually(boothRentChargeId: $id) { id status } }`,
				variables: { id: charge.id },
			},
			{ contextValue: contextWithToken(token) },
		);

		// markBoothRentPaidManually(...): BoothRentCharge! is non-null in the schema, so a thrown
		// resolver error nulls out `data` itself, not just `data.markBoothRentPaidManually` - same
		// rule as shopCutLedger.test.js's own comment on this.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Only the artist this charge belongs to/);
	});

	it('markBoothRentPaidManually moves due -> marked_paid, stamps who/when, and creates no ledger rows yet', async () => {
		const { user: owner } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const charge = await createBoothRentCharge(owner._id, shop._id);
		const token = signTestToken(owner);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation($id: ID!) { markBoothRentPaidManually(boothRentChargeId: $id) { id status markedPaidByUserId expenseId incomeId } }`,
				variables: { id: charge.id },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.markBoothRentPaidManually.status).toBe('marked_paid');
		expect(data.markBoothRentPaidManually.expenseId).toBeNull();
		expect(data.markBoothRentPaidManually.incomeId).toBeNull();

		const stored = await BoothRentCharge.findById(charge.id);
		expect(String(stored.markedPaidByUserId)).toBe(String(owner.id));
		expect(stored.markedPaidAt).toBeInstanceOf(Date);

		// The timing invariant this whole design depends on: an artist's own unconfirmed claim must
		// never be real revenue/expense yet - mirrors applyShopCut's own rule for the percentage side.
		expect(await Expense.countDocuments({})).toBe(0);
		expect(await Income.countDocuments({})).toBe(0);
	});

	it('markBoothRentPaidManually rejects a charge that is already marked_paid', async () => {
		const { user: owner } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const charge = await createBoothRentCharge(owner._id, shop._id, {
			status: 'marked_paid',
			markedPaidAt: new Date(),
			markedPaidByUserId: owner._id,
		});
		const token = signTestToken(owner);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation($id: ID!) { markBoothRentPaidManually(boothRentChargeId: $id) { id } }`,
				variables: { id: charge.id },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.boothRentChargeId).toMatch(/awaiting the shop's confirmation/);
	});

	it('markBoothRentPaidManually rejects a charge that has already been confirmed', async () => {
		const { user: owner } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const charge = await createBoothRentCharge(owner._id, shop._id, { status: 'confirmed' });
		const token = signTestToken(owner);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation($id: ID!) { markBoothRentPaidManually(boothRentChargeId: $id) { id } }`,
				variables: { id: charge.id },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.boothRentChargeId).toMatch(/already been confirmed/);
	});

	it('confirmBoothRentPaid rejects a caller below SHOP_ADMIN', async () => {
		const { user: owner } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const charge = await createBoothRentCharge(owner._id, shop._id, {
			status: 'marked_paid',
			markedPaidAt: new Date(),
			markedPaidByUserId: owner._id,
		});
		const token = signTestToken(owner); // ARTIST role, not SHOP_ADMIN
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation($id: ID!) { confirmBoothRentPaid(boothRentChargeId: $id) { id } }`,
				variables: { id: charge.id },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('confirmBoothRentPaid rejects a shop admin at a DIFFERENT shop than the charge belongs to', async () => {
		const { user: owner } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const { user: otherShopAdmin } = await createShopAdminUser(); // a second, unrelated shop
		const charge = await createBoothRentCharge(owner._id, shop._id, {
			status: 'marked_paid',
			markedPaidAt: new Date(),
			markedPaidByUserId: owner._id,
		});
		const token = signTestToken(otherShopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation($id: ID!) { confirmBoothRentPaid(boothRentChargeId: $id) { id } }`,
				variables: { id: charge.id },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('confirmBoothRentPaid rejects a charge that is not awaiting confirmation (still "due")', async () => {
		const { user: owner } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const charge = await createBoothRentCharge(owner._id, shop._id); // status: 'due'
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation($id: ID!) { confirmBoothRentPaid(boothRentChargeId: $id) { id } }`,
				variables: { id: charge.id },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.boothRentChargeId).toMatch(/not awaiting confirmation/);
	});

	it('confirmBoothRentPaid completes the loop: marked_paid -> confirmed, and writes matching Expense/Income ledger rows', async () => {
		const { user: owner } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const charge = await createBoothRentCharge(owner._id, shop._id, {
			amountCents: 75000,
			status: 'marked_paid',
			markedPaidAt: new Date(),
			markedPaidByUserId: owner._id,
		});
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: `mutation($id: ID!) { confirmBoothRentPaid(boothRentChargeId: $id) { id status expenseId incomeId } }`,
				variables: { id: charge.id },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.confirmBoothRentPaid.status).toBe('confirmed');
		expect(data.confirmBoothRentPaid.expenseId).not.toBeNull();
		expect(data.confirmBoothRentPaid.incomeId).not.toBeNull();

		const stored = await BoothRentCharge.findById(charge.id);
		expect(String(stored.confirmedByUserId)).toBe(String(shopAdmin.id));
		expect(stored.confirmedAt).toBeInstanceOf(Date);

		// The ledger rows are the actual point of confirmation - artist-owned expense (rent paid
		// out), shop-owned income (rent collected), both for the exact same amount as the charge, and
		// only created NOW, not at markBoothRentPaidManually - see the test above proving that.
		const expense = await Expense.findById(stored.expenseId);
		expect(String(expense.artistUserId)).toBe(String(owner.id));
		expect(expense.shopId).toBeNull();
		expect(expense.amountCents).toBe(75000);

		const income = await Income.findById(stored.incomeId);
		expect(String(income.shopId)).toBe(String(shop.id));
		expect(income.artistUserId).toBeNull();
		expect(income.amountCents).toBe(75000);
	});

	it('confirming a second, later charge for the same artist reuses the same "Booth Rent" Expense/Income TYPE, not a duplicate one', async () => {
		const { user: owner } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const first = await createBoothRentCharge(owner._id, shop._id, {
			status: 'marked_paid',
			markedPaidAt: new Date(),
			markedPaidByUserId: owner._id,
		});
		const second = await createBoothRentCharge(owner._id, shop._id, {
			periodMonth: utc(2026, 4, 1),
			dueDate: utc(2026, 4, 5),
			status: 'marked_paid',
			markedPaidAt: new Date(),
			markedPaidByUserId: owner._id,
		});
		const token = signTestToken(shopAdmin);
		const server = createTestServer();
		const query = `mutation($id: ID!) { confirmBoothRentPaid(boothRentChargeId: $id) { id } }`;

		await server.executeOperation(
			{ query, variables: { id: first.id } },
			{ contextValue: contextWithToken(token) },
		);
		await server.executeOperation(
			{ query, variables: { id: second.id } },
			{ contextValue: contextWithToken(token) },
		);

		const expenses = await Expense.find({ artistUserId: owner._id });
		const incomes = await Income.find({ shopId: shop._id });
		expect(expenses).toHaveLength(2);
		expect(incomes).toHaveLength(2);
		// Same ExpenseType/IncomeType row reused both times, not re-created per charge.
		expect(String(expenses[0].expenseTypeId)).toBe(String(expenses[1].expenseTypeId));
		expect(String(incomes[0].incomeTypeId)).toBe(String(incomes[1].incomeTypeId));
	});
});
