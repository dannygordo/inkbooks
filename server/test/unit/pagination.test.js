// describe/it/expect/vi come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.
//
// WRITTEN BUT NOT YET RUN - same globalSetup/MongoMemoryServer download caveat as
// test/unit/money.test.js (see that file's own header comment for the full explanation).
// normalizePage and paginateArray need no database at all; paginate() is exercised here against a
// hand-built fake Mongoose Model (see makeFakeModel below) rather than a real one, specifically so
// this file needs none of that setup - a real Model.find()/.countDocuments() would need an actual
// connection, which is exactly what globalSetup can't provide here.
const { normalizePage, paginate, paginateArray, DEFAULT_LIMIT, MAX_LIMIT } = require('../../utils/pagination');

// normalizePage throws a UserInputError the same way every resolver in this codebase does -
// `new UserInputError('Errors', { errors: { field: 'the real message' } })` (see utils/errors.js:
// the constructor's first argument becomes `.message` verbatim, the second argument's `errors` key
// becomes `.extensions.errors`). `.message` is therefore always the literal string "Errors"; the
// descriptive text this file actually wants to assert on lives at `.extensions.errors[field]`.
// `toThrow(/regex/)` matches against `.message` alone, which is why the six assertions below don't
// use it directly - this helper catches the real error and checks the field that actually carries
// the message.
function expectValidationError(fn, field, pattern) {
	let thrown;
	try {
		fn();
	} catch (err) {
		thrown = err;
	}
	expect(thrown).toBeDefined();
	expect(thrown.message).toBe('Errors');
	expect(thrown.extensions.errors[field]).toMatch(pattern);
}

describe('normalizePage', () => {
	it('defaults to DEFAULT_LIMIT and offset 0 when no page is given at all', () => {
		expect(normalizePage(undefined)).toEqual({ limit: DEFAULT_LIMIT, offset: 0 });
		expect(normalizePage(null)).toEqual({ limit: DEFAULT_LIMIT, offset: 0 });
	});

	it('defaults the offset to 0 when only a limit is given', () => {
		expect(normalizePage({ limit: 10 })).toEqual({ limit: 10, offset: 0 });
	});

	it('defaults the limit when only an offset is given', () => {
		expect(normalizePage({ offset: 20 })).toEqual({ limit: DEFAULT_LIMIT, offset: 20 });
	});

	it('passes a valid limit/offset pair through unchanged', () => {
		expect(normalizePage({ limit: 25, offset: 50 })).toEqual({ limit: 25, offset: 50 });
	});

	// A bounded answer, not a refusal - "give me everything" is reasonable, and pageInfo.hasMore
	// says the rest exists (see this function's own comment on why over- vs under-limit are
	// handled differently).
	it('clamps a limit above MAX_LIMIT down to MAX_LIMIT rather than refusing it', () => {
		expect(normalizePage({ limit: 100000 })).toEqual({ limit: MAX_LIMIT, offset: 0 });
	});

	it('allows a limit exactly at MAX_LIMIT unclamped', () => {
		expect(normalizePage({ limit: MAX_LIMIT })).toEqual({ limit: MAX_LIMIT, offset: 0 });
	});

	// Refused loudly rather than silently clamped - a negative or fractional value means the
	// caller computed something wrong, and quietly substituting the default would hide the bug at
	// the moment it's cheapest to catch (see this function's own comment).
	it('throws on a negative limit', () => {
		expectValidationError(() => normalizePage({ limit: -5 }), 'limit', /limit must be a positive whole number/);
	});

	it('throws on a zero limit', () => {
		expectValidationError(() => normalizePage({ limit: 0 }), 'limit', /limit must be a positive whole number/);
	});

	it('throws on a fractional limit', () => {
		expectValidationError(() => normalizePage({ limit: 10.5 }), 'limit', /limit must be a positive whole number/);
	});

	it('throws on a negative offset', () => {
		expectValidationError(
			() => normalizePage({ limit: 10, offset: -1 }),
			'offset',
			/offset must be zero or a positive whole number/,
		);
	});

	it('throws on a fractional offset', () => {
		expectValidationError(
			() => normalizePage({ limit: 10, offset: 1.5 }),
			'offset',
			/offset must be zero or a positive whole number/,
		);
	});

	it('allows an offset of exactly 0', () => {
		expect(normalizePage({ limit: 10, offset: 0 })).toEqual({ limit: 10, offset: 0 });
	});
});

describe('paginateArray', () => {
	const ITEMS = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));

	it('slices to the requested page', () => {
		const result = paginateArray(ITEMS, { limit: 10, offset: 10 });
		expect(result.items).toHaveLength(10);
		expect(result.items[0]).toEqual({ id: 11 });
		expect(result.items[9]).toEqual({ id: 20 });
	});

	it('totalCount reflects the FULL list, not just the returned page', () => {
		const result = paginateArray(ITEMS, { limit: 10, offset: 0 });
		expect(result.pageInfo.totalCount).toBe(25);
		expect(result.items).toHaveLength(10);
	});

	it('hasMore is true when the page does not reach the end of the list', () => {
		const result = paginateArray(ITEMS, { limit: 10, offset: 10 });
		expect(result.pageInfo.hasMore).toBe(true);
	});

	// The exact off-by-one this was written to avoid (see paginate's own comment): an
	// exactly-full final page must not be mistaken for "there's more" just because it happens to
	// be a full-size page.
	it('hasMore is false on an exactly-full final page', () => {
		const result = paginateArray(ITEMS, { limit: 5, offset: 20 });
		expect(result.items).toHaveLength(5);
		expect(result.pageInfo.hasMore).toBe(false);
	});

	it('hasMore is false, and items is empty, when the offset is past the end of the list', () => {
		const result = paginateArray(ITEMS, { limit: 10, offset: 100 });
		expect(result.items).toEqual([]);
		expect(result.pageInfo.hasMore).toBe(false);
		expect(result.pageInfo.totalCount).toBe(25);
	});

	it('handles an empty list without throwing', () => {
		const result = paginateArray([], { limit: 10, offset: 0 });
		expect(result.items).toEqual([]);
		expect(result.pageInfo).toEqual({ totalCount: 0, hasMore: false, limit: 10, offset: 0 });
	});

	it('still validates the page argument (delegates to normalizePage)', () => {
		expectValidationError(() => paginateArray(ITEMS, { limit: -1 }), 'limit', /limit must be a positive whole number/);
	});
});

describe('paginate', () => {
	// A hand-built stand-in for a Mongoose Model, chainable the same way `Model.find(filter)`
	// is (.sort/.skip/.limit/.select each return the query itself) and awaitable the same way a
	// real Mongoose query is (implements `.then`, so `await query` / `Promise.all([query, ...])`
	// resolves to `items` without needing an actual Promise instance or a real connection).
	function makeFakeModel(items, totalCount) {
		const query = {
			sort: vi.fn(() => query),
			skip: vi.fn(() => query),
			limit: vi.fn(() => query),
			select: vi.fn(() => query),
			then: (resolve, reject) => Promise.resolve(items).then(resolve, reject),
		};
		return {
			find: vi.fn(() => query),
			countDocuments: vi.fn().mockResolvedValue(totalCount),
			_query: query,
		};
	}

	it('returns the model\'s items and a matching pageInfo', async () => {
		const items = [{ id: 'a' }, { id: 'b' }];
		const model = makeFakeModel(items, 12);

		const result = await paginate(model, { shopId: 'shop-1' }, { page: { limit: 2, offset: 4 } });

		expect(result.items).toBe(items);
		expect(result.pageInfo).toEqual({ totalCount: 12, hasMore: true, limit: 2, offset: 4 });
	});

	it('passes the filter to both find() and countDocuments() identically', async () => {
		const model = makeFakeModel([], 0);
		const filter = { shopId: 'shop-1', appointmentStatus: 'completed' };

		await paginate(model, filter, { page: { limit: 10 } });

		expect(model.find).toHaveBeenCalledWith(filter);
		expect(model.countDocuments).toHaveBeenCalledWith(filter);
	});

	it('applies sort, skip, and limit from the normalized page', async () => {
		const model = makeFakeModel([], 0);

		await paginate(model, {}, { sort: { appointmentDate: -1 }, page: { limit: 15, offset: 30 } });

		expect(model._query.sort).toHaveBeenCalledWith({ appointmentDate: -1 });
		expect(model._query.skip).toHaveBeenCalledWith(30);
		expect(model._query.limit).toHaveBeenCalledWith(15);
	});

	it('applies select only when explicitly given', async () => {
		const withSelect = makeFakeModel([], 0);
		await paginate(withSelect, {}, { page: {}, select: 'title appointmentDate' });
		expect(withSelect._query.select).toHaveBeenCalledWith('title appointmentDate');

		const withoutSelect = makeFakeModel([], 0);
		await paginate(withoutSelect, {}, { page: {} });
		expect(withoutSelect._query.select).not.toHaveBeenCalled();
	});

	it('hasMore is false once the page reaches the total count', async () => {
		const items = [{ id: 'a' }, { id: 'b' }];
		const model = makeFakeModel(items, 2);

		const result = await paginate(model, {}, { page: { limit: 2, offset: 0 } });

		expect(result.pageInfo.hasMore).toBe(false);
	});

	it('propagates normalizePage\'s validation error before ever touching the model', async () => {
		const model = makeFakeModel([], 0);
		let thrown;
		try {
			await paginate(model, {}, { page: { limit: -1 } });
		} catch (err) {
			thrown = err;
		}
		expect(thrown).toBeDefined();
		expect(thrown.message).toBe('Errors');
		expect(thrown.extensions.errors.limit).toMatch(/limit must be a positive whole number/);
		expect(model.find).not.toHaveBeenCalled();
	});
});
