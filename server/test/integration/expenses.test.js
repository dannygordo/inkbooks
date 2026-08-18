// Integration tests for the expense/income/recurring-expense GraphQL surface (resolvers/
// expenses.js, resolvers/income.js) and the ownership model they sit on (utils/shop-membership.js's
// resolveBusinessOwner/assertCanManageBusinessRecord - see that file's own header comment for the
// full design: every row carries exactly one owner, shopId XOR artistUserId).
//
// NOT YET RUN. Same caveat as every other integration test added this session (see clientFlags.test.js/
// analytics.test.js) - this sandbox's MongoMemoryServer can't download a Mongo binary
// (fastdl.mongodb.org returns 403 for this platform), so `npx vitest run` fails before a single test
// executes, regardless of what the test bodies say. Written to the same structure and conventions as
// every passing test in this directory; someone with real network access to fastdl.mongodb.org (or a
// local `mongod`) needs to be the first to actually run this file. See HANDOFF.md's Known Gaps.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	connectArtistToShop,
} = require('../helpers/factories');
const ExpenseType = require('../../models/ExpenseType');
const Expense = require('../../models/Expense');
const RecurringExpense = require('../../models/RecurringExpense');
const { generateDueRecurringExpenses } = require('../../utils/recurring-expenses');

function run(query, user, variables) {
	return createTestServer().executeOperation(
		{ query, variables },
		{ contextValue: contextWithToken(signTestToken(user)) },
	);
}

const CREATE_EXPENSE_TYPE = `
	mutation CreateExpenseType($input: CreateExpenseTypeInput!) {
		createExpenseType(input: $input) { id name shopId artistUserId }
	}
`;

const RECORD_EXPENSE = `
	mutation RecordExpense($input: RecordExpenseInput!) {
		recordExpense(input: $input) { id amountCents shopId artistUserId }
	}
`;

const UPDATE_EXPENSE = `
	mutation UpdateExpense($input: UpdateExpenseInput!) {
		updateExpense(input: $input) { id amountCents description }
	}
`;

const DELETE_EXPENSE = `
	mutation DeleteExpense($expenseId: ID!) {
		deleteExpense(expenseId: $expenseId)
	}
`;

const GET_EXPENSES = `
	query GetExpenses($shopId: ID, $artistUserId: ID) {
		getExpenses(shopId: $shopId, artistUserId: $artistUserId) {
			items { id amountCents }
			pageInfo { totalCount }
		}
	}
`;

const IN_RANGE = new Date('2026-03-15T12:00:00.000Z');

async function seedExpenseType(owner) {
	return new ExpenseType({ name: 'Rent', ...owner }).save();
}

describe('resolveBusinessOwner: who a new expense row belongs to', () => {
	it('scopes to the shop when a shop admin passes their own shopId', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const type = await seedExpenseType({ shopId: shop.id });

		const { errors, data } = (
			await run(RECORD_EXPENSE, admin, {
				input: {
					shopId: shop.id,
					expenseTypeId: type.id,
					amountCents: 12000,
					date: IN_RANGE,
				},
			})
		).body.singleResult;

		expect(errors).toBeUndefined();
		expect(data.recordExpense.shopId).toBe(String(shop.id));
		expect(data.recordExpense.artistUserId).toBeNull();
	});

	it("refuses a shop admin passing a DIFFERENT shop's id - not a member there", async () => {
		const { user: admin } = await createShopAdminUser();
		const { shop: otherShop } = await createShopAdminUser();
		const type = await seedExpenseType({ shopId: otherShop.id });

		const { data, errors } = (
			await run(RECORD_EXPENSE, admin, {
				input: {
					shopId: otherShop.id,
					expenseTypeId: type.id,
					amountCents: 5000,
					date: IN_RANGE,
				},
			})
		).body.singleResult;

		// recordExpense is non-null in the schema (Expense!) - an error thrown resolving it nulls
		// `data` itself, not just this one field (GraphQL null-bubbling - see adjustments.test.js's
		// own comment on the same behavior).
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('refuses a plain shop-connected SHOP_STAFF passing their shop\'s id - staff do not manage the books', async () => {
		const { shop } = await createShopAdminUser();
		const { user: staffUser } = await createStaffUser(shop.id);
		const type = await seedExpenseType({ shopId: shop.id });

		const { data, errors } = (
			await run(RECORD_EXPENSE, staffUser, {
				input: {
					shopId: shop.id,
					expenseTypeId: type.id,
					amountCents: 5000,
					date: IN_RANGE,
				},
			})
		).body.singleResult;

		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/shop admin only|Action not allowed/);
	});

	it('scopes to the caller\'s own artistUserId when shopId is omitted, for an independent artist', async () => {
		const { user: artist } = await createArtistUser();
		const type = await seedExpenseType({ artistUserId: artist.id });

		const { errors, data } = (
			await run(RECORD_EXPENSE, artist, {
				input: { expenseTypeId: type.id, amountCents: 3000, date: IN_RANGE },
			})
		).body.singleResult;

		expect(errors).toBeUndefined();
		expect(data.recordExpense.artistUserId).toBe(String(artist.id));
		expect(data.recordExpense.shopId).toBeNull();
	});
});

describe('assertCanManageBusinessRecord: ownership is re-checked on every read/update/delete', () => {
	async function shopExpense() {
		const { user: admin, shop } = await createShopAdminUser();
		const type = await seedExpenseType({ shopId: shop.id });
		const expense = await new Expense({
			shopId: shop.id,
			expenseTypeId: type.id,
			amountCents: 9900,
			date: IN_RANGE,
			createdByUserId: admin.id,
		}).save();
		return { admin, shop, expense };
	}

	it("lets the shop's own admin update and delete it", async () => {
		const { admin, expense } = await shopExpense();

		const updateRes = await run(UPDATE_EXPENSE, admin, {
			input: { expenseId: expense.id, amountCents: 10500, description: 'Updated' },
		});
		expect(updateRes.body.singleResult.errors).toBeUndefined();
		expect(updateRes.body.singleResult.data.updateExpense.amountCents).toBe(10500);

		const deleteRes = await run(DELETE_EXPENSE, admin, { expenseId: expense.id });
		expect(deleteRes.body.singleResult.errors).toBeUndefined();
		expect(deleteRes.body.singleResult.data.deleteExpense).toBe(true);
		expect(await Expense.findById(expense.id)).toBeNull();
	});

	it("refuses a DIFFERENT shop's admin from touching it - no cross-shop bleed in either direction", async () => {
		const { expense } = await shopExpense();
		const { user: otherAdmin } = await createShopAdminUser();

		const updateRes = await run(UPDATE_EXPENSE, otherAdmin, {
			input: { expenseId: expense.id, amountCents: 1 },
		});
		// updateExpense is non-null in the schema (Expense!) - same null-bubbling reasoning as above.
		expect(updateRes.body.singleResult.data).toBeNull();
		expect(updateRes.body.singleResult.errors[0].message).toMatch(/Action not allowed/);

		const stored = await Expense.findById(expense.id);
		expect(stored.amountCents).toBe(9900);
	});

	it('refuses an independent artist from reading a shop expense list they have no membership in', async () => {
		const { shop } = await shopExpense();
		const { user: outsider } = await createArtistUser();

		const res = await run(GET_EXPENSES, outsider, { shopId: shop.id });
		// getExpenses is non-null in the schema (ExpensePage!) - same null-bubbling reasoning as above.
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('generateDueRecurringExpenses: the scheduled job that turns a template into real rows', () => {
	async function recurringTemplate(overrides = {}) {
		const { user: admin, shop } = await createShopAdminUser();
		const type = await seedExpenseType({ shopId: shop.id });
		const template = await new RecurringExpense({
			shopId: shop.id,
			expenseTypeId: type.id,
			amountCents: 150000,
			frequency: 'monthly',
			startDate: new Date('2026-01-01T00:00:00.000Z'),
			nextRunDate: new Date('2026-01-01T00:00:00.000Z'),
			active: true,
			createdByUserId: admin.id,
			...overrides,
		}).save();
		return { admin, shop, type, template };
	}

	it('generates one Expense for a single due occurrence and advances nextRunDate', async () => {
		const { template, shop } = await recurringTemplate();
		const now = new Date('2026-01-15T00:00:00.000Z');

		const result = await generateDueRecurringExpenses({ now });

		expect(result.generated).toBe(1);
		const rows = await Expense.find({ shopId: shop.id, recurringExpenseId: template._id });
		expect(rows).toHaveLength(1);
		expect(rows[0].amountCents).toBe(150000);

		const refreshed = await RecurringExpense.findById(template._id);
		expect(refreshed.nextRunDate.toISOString()).toBe('2026-02-01T00:00:00.000Z');
	});

	it('catches up EVERY missed occurrence in one run, not just the most recent', async () => {
		const { template, shop } = await recurringTemplate();
		// Four months have gone by with the job never running - January, February, March, AND
		// April (already 15 days in, so April 1st has passed too) are all owed. The boundary is
		// `cursor <= now` (see utils/recurring-expenses.js), the same inclusive rule the sibling
		// "generates one Expense for a single due occurrence" test above relies on to count
		// January itself as due on Jan 15 - the current month's occurrence counts as soon as its
		// date has passed, not only once the FOLLOWING month starts.
		const now = new Date('2026-04-15T00:00:00.000Z');

		const result = await generateDueRecurringExpenses({ now });

		expect(result.generated).toBe(4);
		const rows = await Expense.find({ shopId: shop.id, recurringExpenseId: template._id }).sort({
			date: 1,
		});
		expect(rows.map((r) => r.date.toISOString())).toEqual([
			'2026-01-01T00:00:00.000Z',
			'2026-02-01T00:00:00.000Z',
			'2026-03-01T00:00:00.000Z',
			'2026-04-01T00:00:00.000Z',
		]);
	});

	it('is idempotent - running twice for the same window does not duplicate rows', async () => {
		const { template, shop } = await recurringTemplate();
		// Jan 1 and Feb 1 are both due by Feb 15 (same inclusive `cursor <= now` boundary as
		// above) - the first run generates both.
		const now = new Date('2026-02-15T00:00:00.000Z');

		const firstRun = await generateDueRecurringExpenses({ now });
		expect(firstRun.generated).toBe(2);
		const secondRun = await generateDueRecurringExpenses({ now });

		expect(secondRun.generated).toBe(0);
		const rows = await Expense.find({ shopId: shop.id, recurringExpenseId: template._id });
		expect(rows).toHaveLength(2);
	});

	it('deactivates the template once it runs past endDate, generating the final occurrence but no more', async () => {
		const { template, shop } = await recurringTemplate({
			endDate: new Date('2026-02-01T00:00:00.000Z'),
		});
		const now = new Date('2026-06-01T00:00:00.000Z');

		await generateDueRecurringExpenses({ now });

		const rows = await Expense.find({ shopId: shop.id, recurringExpenseId: template._id });
		// Jan and Feb both <= endDate; March would be the first occurrence past it.
		expect(rows).toHaveLength(2);
		const refreshed = await RecurringExpense.findById(template._id);
		expect(refreshed.active).toBe(false);
	});

	it('deleting an expense a template generated does not touch the template or its other rows', async () => {
		const { template, shop } = await recurringTemplate();
		// Jan 1, Feb 1, AND Mar 1 are all due by Mar 15 (same inclusive `cursor <= now` boundary as
		// the "catches up EVERY missed occurrence" test above) - three rows generated, not two.
		await generateDueRecurringExpenses({ now: new Date('2026-03-15T00:00:00.000Z') });
		const rows = await Expense.find({ shopId: shop.id, recurringExpenseId: template._id }).sort({
			date: 1,
		});
		expect(rows).toHaveLength(3);

		await Expense.findByIdAndDelete(rows[0]._id);

		const stillThere = await RecurringExpense.findById(template._id);
		expect(stillThere.active).toBe(true);
		const remaining = await Expense.find({ shopId: shop.id, recurringExpenseId: template._id });
		expect(remaining).toHaveLength(2);
	});
});

describe('financial dashboard figures: expensesCents/otherIncomeCents/netCents', () => {
	const GET_SHOP_ANALYTICS = `
		query GetShopAnalytics($shopId: ID!, $start: DateTime!, $end: DateTime!) {
			getShopAnalytics(shopId: $shopId, start: $start, end: $end) {
				revenueCents
				expensesCents
				otherIncomeCents
				netCents
			}
		}
	`;
	const START = new Date('2026-03-01T00:00:00.000Z');
	const END = new Date('2026-04-01T00:00:00.000Z');
	const Income = require('../../models/Income');
	const IncomeType = require('../../models/IncomeType');

	it('nets tattoo revenue, other income, and expenses into one grand total', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const expenseType = await seedExpenseType({ shopId: shop.id });
		const incomeType = await new IncomeType({ name: 'Retail', shopId: shop.id }).save();
		await new Expense({
			shopId: shop.id,
			expenseTypeId: expenseType.id,
			amountCents: 20000,
			date: IN_RANGE,
			createdByUserId: admin.id,
		}).save();
		await new Income({
			shopId: shop.id,
			incomeTypeId: incomeType.id,
			amountCents: 5000,
			date: IN_RANGE,
			createdByUserId: admin.id,
		}).save();

		const res = await run(GET_SHOP_ANALYTICS, admin, {
			shopId: shop.id,
			start: START,
			end: END,
		});
		const { data, errors } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getShopAnalytics.expensesCents).toBe(20000);
		expect(data.getShopAnalytics.otherIncomeCents).toBe(5000);
		// No completed appointments in this fixture, so revenue is 0 - net is just other income
		// minus expenses: 5000 - 20000 = -15000.
		expect(data.getShopAnalytics.netCents).toBe(-15000);
	});

	it("nulls all three for Staff, same money blackout as every other figure on this dashboard", async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const { user: staffUser } = await createStaffUser(shop.id);
		const expenseType = await seedExpenseType({ shopId: shop.id });
		await new Expense({
			shopId: shop.id,
			expenseTypeId: expenseType.id,
			amountCents: 20000,
			date: IN_RANGE,
			createdByUserId: admin.id,
		}).save();

		const res = await run(GET_SHOP_ANALYTICS, staffUser, {
			shopId: shop.id,
			start: START,
			end: END,
		});
		const { data, errors } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getShopAnalytics.expensesCents).toBeNull();
		expect(data.getShopAnalytics.otherIncomeCents).toBeNull();
		expect(data.getShopAnalytics.netCents).toBeNull();
	});
});
