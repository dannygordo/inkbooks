// utils/loaders.js is hand-rolled per-request batching/memoization (deliberately not the
// `dataloader` package - see its own header comment on why), instantiated in every GraphQL
// request via test/helpers/testServer.js's context, but its own actual batching/caching/error
// behavior - the reason it exists at all - had never been directly tested anywhere. A test suite
// that only ever calls createLoaders() as boilerplate context setup would never notice createLoader
// batching zero calls, or caching nothing, or failing only one of several pending callers.
//
// IMPORTANT: this file mocks via vi.spyOn on the required module object, not vi.mock(module,
// factory) + a destructured import. Confirmed by direct reproduction (2026-09-04, see DECISIONS.md)
// that Vitest's vi.mock() does not intercept plain CommonJS require() calls in this project's setup
// - it only reliably replaces ESM import bindings. createUnreadLoader() below reaches its
// dependencies via `require('./conversation-reads')` (this whole codebase is CJS), so a
// vi.mock(...)-based version of this file silently ran against the REAL, unmocked functions and
// threw "X.mockResolvedValue is not a function" the moment a test tried to program a return value
// - caught only once `npm test` was finally run for real. vi.spyOn(moduleObject, 'fnName') works
// instead because it mutates the already-`require()`'d module's own object in place, which is
// exactly the object createUnreadLoader()'s own `require()` call resolves to (Node caches modules
// by resolved path), whether that require happens at this file's top or lazily inside the function.
//
// describe/it/expect/vi/beforeEach/afterEach come from Vitest's `globals: true` config.
const conversationReads = require('../../utils/conversation-reads');
const conversationRouting = require('../../utils/conversation-routing');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const { createLoader, createLoaders } = require('../../utils/loaders');
const { createArtistUser, createShopAdminUser, connectArtistToShop } = require('../helpers/factories');

let unreadSummaryForUser;
let bookingInboxConversationIds;

beforeEach(() => {
	unreadSummaryForUser = vi.spyOn(conversationReads, 'unreadSummaryForUser');
	bookingInboxConversationIds = vi.spyOn(conversationRouting, 'bookingInboxConversationIds');
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('createLoader', () => {
	it('batches every key requested in the same tick into one batchFn call', async () => {
		const batchFn = vi.fn(async (keys) => new Map(keys.map((k) => [k, `value-for-${k}`])));
		const loader = createLoader(batchFn);

		const [a, b, c] = await Promise.all([loader.load('1'), loader.load('2'), loader.load('3')]);

		expect(batchFn).toHaveBeenCalledTimes(1);
		expect(batchFn).toHaveBeenCalledWith(['1', '2', '3']);
		expect([a, b, c]).toEqual(['value-for-1', 'value-for-2', 'value-for-3']);
	});

	it('caches repeated calls for the same key - batchFn sees it only once', async () => {
		const batchFn = vi.fn(async (keys) => new Map(keys.map((k) => [k, `value-for-${k}`])));
		const loader = createLoader(batchFn);

		const [first, second] = await Promise.all([loader.load('1'), loader.load('1')]);

		expect(batchFn).toHaveBeenCalledTimes(1);
		expect(batchFn).toHaveBeenCalledWith(['1']);
		expect(first).toBe(second);
	});

	it('treats a string key and an ObjectId-shaped key for the same id as one cache entry', async () => {
		const batchFn = vi.fn(async (keys) => new Map(keys.map((k) => [k, `value-for-${k}`])));
		const loader = createLoader(batchFn);
		const objectIdLike = { toString: () => '1' };

		await Promise.all([loader.load('1'), loader.load(objectIdLike)]);

		expect(batchFn).toHaveBeenCalledTimes(1);
		expect(batchFn).toHaveBeenCalledWith(['1']);
	});

	it('resolves undefined for a null or undefined key without ever calling batchFn', async () => {
		const batchFn = vi.fn(async () => new Map());
		const loader = createLoader(batchFn);

		const [a, b] = await Promise.all([loader.load(null), loader.load(undefined)]);

		expect(a).toBeUndefined();
		expect(b).toBeUndefined();
		expect(batchFn).not.toHaveBeenCalled();
	});

	// "One failed batch fails every caller in it, rather than hanging them" per the function's
	// own header comment - a promise nobody settles is a request that never returns.
	it('rejects every pending caller in the batch when batchFn itself throws', async () => {
		const batchFn = vi.fn(async () => {
			throw new Error('batch query failed');
		});
		const loader = createLoader(batchFn);

		await expect(loader.load('1')).rejects.toThrow('batch query failed');
	});
});

describe('createArtistShopIdLoader (via createLoaders)', () => {
	it('resolves each requested artist to their own active shopId, in a single query', async () => {
		const { user: artistOne } = await createArtistUser();
		const { user: artistTwo } = await createArtistUser();
		const { user: artistUnconnected } = await createArtistUser();
		const { shop: shopOne } = await createShopAdminUser();
		const { shop: shopTwo } = await createShopAdminUser();
		await connectArtistToShop(artistOne._id, shopOne._id);
		await connectArtistToShop(artistTwo._id, shopTwo._id);
		const findSpy = vi.spyOn(ArtistShopConnection, 'find');

		const loaders = createLoaders();
		const [shopIdOne, shopIdTwo, shopIdNone] = await Promise.all([
			loaders.artistShopId.load(artistOne._id),
			loaders.artistShopId.load(artistTwo._id),
			loaders.artistShopId.load(artistUnconnected._id),
		]);

		expect(String(shopIdOne)).toBe(String(shopOne._id));
		expect(String(shopIdTwo)).toBe(String(shopTwo._id));
		expect(shopIdNone).toBeUndefined();
		// The whole point of this file - twenty callers still cost one query, not twenty.
		expect(findSpy).toHaveBeenCalledTimes(1);
		findSpy.mockRestore();
	});
});

describe('createUnreadLoader (via createLoaders)', () => {
	it('memoizes per user+scope - a second call for the same key does not re-run the summary', async () => {
		unreadSummaryForUser.mockResolvedValue({ total: 3 });
		const loaders = createLoaders();

		const [first, second] = await Promise.all([
			loaders.unread.summaryFor('user-1', 'all'),
			loaders.unread.summaryFor('user-1', 'all'),
		]);

		expect(first).toBe(second);
		expect(unreadSummaryForUser).toHaveBeenCalledTimes(1);
	});

	it('keys the cache by scope, not just userId - "messages" and "all" get independent answers', async () => {
		unreadSummaryForUser.mockResolvedValue({ total: 5 });
		bookingInboxConversationIds.mockResolvedValue(['conv-1', 'conv-2']);
		const loaders = createLoaders();

		await loaders.unread.summaryFor('user-1', 'all');
		await loaders.unread.summaryFor('user-1', 'messages');

		expect(unreadSummaryForUser).toHaveBeenCalledTimes(2);
		expect(unreadSummaryForUser).toHaveBeenNthCalledWith(1, 'user-1');
		expect(unreadSummaryForUser).toHaveBeenNthCalledWith(2, 'user-1', { excluding: ['conv-1', 'conv-2'] });
	});

	it('resolves bookingInboxConversationIds only once even across multiple "messages"-scope calls', async () => {
		unreadSummaryForUser.mockResolvedValue({ total: 1 });
		bookingInboxConversationIds.mockResolvedValue(['conv-1']);
		const loaders = createLoaders();

		await loaders.unread.summaryFor('user-1', 'messages');
		await loaders.unread.summaryFor('user-1', 'messages');

		expect(bookingInboxConversationIds).toHaveBeenCalledTimes(1);
	});
});
