// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.
//
// WRITTEN BUT NOT YET RUN - same globalSetup/MongoMemoryServer download caveat as
// test/unit/money.test.js (see that file's own header comment for the full explanation). This
// file needs no real database either - mongoose.Types.ObjectId is a plain class usable with no
// connection - but the shared vitest.config.js runs the same blocked globalSetup before it either.
const mongoose = require('mongoose');
const { toObjectId, toObjectIds } = require('../../utils/object-id');

const VALID_ID = '507f1f77bcf86cd799439011';

describe('toObjectId', () => {
	it('converts a valid hex-string id into a real ObjectId instance', () => {
		const result = toObjectId(VALID_ID);
		expect(result).toBeInstanceOf(mongoose.Types.ObjectId);
		expect(result.toString()).toBe(VALID_ID);
	});

	// The whole reason this function exists (see its own header comment on the unread-badge
	// incident): aggregate() pipelines don't auto-cast strings the way find()/countDocuments() do,
	// so a raw string surviving into a $match silently never equals a real ObjectId in BSON.
	it('the result is NOT the same as the original string once coerced', () => {
		const result = toObjectId(VALID_ID);
		expect(result).not.toBe(VALID_ID);
		expect(typeof result).not.toBe('string');
	});

	it('passes an already-real ObjectId instance through unchanged', () => {
		const existing = new mongoose.Types.ObjectId(VALID_ID);
		const result = toObjectId(existing);
		expect(result).toBe(existing);
	});

	it('returns falsy input unchanged rather than throwing (null/undefined/empty string)', () => {
		expect(toObjectId(null)).toBeNull();
		expect(toObjectId(undefined)).toBeUndefined();
		expect(toObjectId('')).toBe('');
	});

	it('accepts an ObjectId-shaped Mongoose document id (coerces via String())', () => {
		// Mirrors how this is actually called in resolvers - `toObjectId(someDoc.userId)` where
		// userId came off a Mongoose document and may not be a plain string, but does respond to
		// String(). A number would also technically survive `String()` here; that's this function
		// trusting its caller to only ever pass something ObjectId-shaped, same as `new
		// mongoose.Types.ObjectId(x)` always has.
		const result = toObjectId({ toString: () => VALID_ID });
		expect(result.toString()).toBe(VALID_ID);
	});
});

describe('toObjectIds', () => {
	it('converts every id in a list', () => {
		const otherId = '5f8d0d55b54764421b7156c3';
		const result = toObjectIds([VALID_ID, otherId]);
		expect(result).toHaveLength(2);
		expect(result[0].toString()).toBe(VALID_ID);
		expect(result[1].toString()).toBe(otherId);
	});

	it('filters out falsy entries rather than converting them', () => {
		const result = toObjectIds([VALID_ID, null, undefined, '']);
		expect(result).toHaveLength(1);
		expect(result[0].toString()).toBe(VALID_ID);
	});

	it('returns an empty array for null/undefined input, not an error', () => {
		expect(toObjectIds(null)).toEqual([]);
		expect(toObjectIds(undefined)).toEqual([]);
	});

	it('returns an empty array for an already-empty list', () => {
		expect(toObjectIds([])).toEqual([]);
	});
});
