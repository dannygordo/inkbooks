// business-jobs.js tests. The scheduled half of the expense/booth-rent feature is real logic
// tested for real in test/integration/expenses.test.js and test/integration/boothRent.test.js -
// this file is only composition, wiring those two generators into the shape utils/scheduler.js
// expects (see index.js: startScheduler([...notificationJobs(), ...businessJobs()], ...)). Nothing
// anywhere calls businessJobs() itself except production startup, so its own two small
// responsibilities - the job list's shape, and the summary string each job's run() produces from
// its generator's result - had no coverage at all.
// CORRECTION (2026-09-04, see DECISIONS.md): this file originally mocked both dependencies below
// via vi.mock(module, factory) + destructured requires, on the assumption that vi.mock's hoisting
// makes a destructured require() pick up the mock. It does not - Vitest's vi.mock() only reliably
// replaces ESM import bindings, not plain CommonJS require() calls, and this whole codebase is
// CJS. Every `.mockResolvedValue(...)`/`.toHaveBeenCalledTimes(...)` call below was actually
// running against the REAL, unmocked utils/recurring-expenses.js / utils/booth-rent.js exports,
// which have no such methods - confirmed the moment `npm test` was finally run for real. Fixed by
// vi.spyOn()-ing each already-required module's own object BEFORE requiring utils/business-jobs.js
// below - business-jobs.js destructures both at its own module-load time, so whichever function is
// sitting on the module object at that exact moment is what it calls forever after.
const recurringExpensesModule = require('../../utils/recurring-expenses');
const boothRentModule = require('../../utils/booth-rent');

const generateDueRecurringExpenses = vi
	.spyOn(recurringExpensesModule, 'generateDueRecurringExpenses')
	.mockResolvedValue({ templatesProcessed: 0, generated: 0, skippedDuplicate: 0 });
const generateDueBoothRentCharges = vi
	.spyOn(boothRentModule, 'generateDueBoothRentCharges')
	.mockResolvedValue({ pairsProcessed: 0, generated: 0, skippedDuplicate: 0, skippedNotOnBoothRent: 0 });

const { businessJobs } = require('../../utils/business-jobs');

beforeEach(() => {
	vi.clearAllMocks();
});

describe('businessJobs', () => {
	it('returns exactly the two jobs, both hourly', () => {
		const jobs = businessJobs();

		expect(jobs.map((j) => j.name)).toEqual(['recurring-expenses', 'booth-rent-charges']);
		// Both jobs reason the same way in their own comments: the finest real-world cadence
		// (weekly for expenses, monthly for booth rent) is much coarser than an hour, but the
		// scheduler's own lock makes a tighter tick free and means something created mid-day with
		// a same-day nextRunDate doesn't wait for a once-daily job's fixed hour to come back around.
		jobs.forEach((job) => expect(job.everyMs).toBe(60 * 60 * 1000));
	});

	it("recurring-expenses' run() delegates to generateDueRecurringExpenses and formats its result", async () => {
		generateDueRecurringExpenses.mockResolvedValue({
			templatesProcessed: 4,
			generated: 3,
			skippedDuplicate: 1,
		});
		const job = businessJobs().find((j) => j.name === 'recurring-expenses');

		const summary = await job.run();

		expect(generateDueRecurringExpenses).toHaveBeenCalledTimes(1);
		expect(summary).toBe('templates=4 generated=3 skipped=1');
	});

	it("booth-rent-charges' run() delegates to generateDueBoothRentCharges and formats its result", async () => {
		generateDueBoothRentCharges.mockResolvedValue({
			pairsProcessed: 6,
			generated: 5,
			skippedDuplicate: 1,
			skippedNotOnBoothRent: 2,
		});
		const job = businessJobs().find((j) => j.name === 'booth-rent-charges');

		const summary = await job.run();

		expect(generateDueBoothRentCharges).toHaveBeenCalledTimes(1);
		expect(summary).toBe('pairs=6 generated=5 skipped=1');
	});

	// Each call must build a fresh job list bound to the CURRENT mock/module state, not memoize
	// one from the first call - otherwise a scheduler that calls businessJobs() once at startup
	// (which is exactly what index.js does) would be fine, but a test or a future caller that
	// calls it more than once could silently get run() closures from a stale first call.
	it('returns independently-callable run functions on each invocation', async () => {
		generateDueRecurringExpenses.mockResolvedValue({ templatesProcessed: 0, generated: 0, skippedDuplicate: 0 });
		const first = businessJobs().find((j) => j.name === 'recurring-expenses');
		const second = businessJobs().find((j) => j.name === 'recurring-expenses');

		await first.run();
		await second.run();

		expect(generateDueRecurringExpenses).toHaveBeenCalledTimes(2);
	});
});
