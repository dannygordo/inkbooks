// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.
//
// WRITTEN BUT NOT YET RUN - same globalSetup/MongoMemoryServer download caveat as
// test/unit/money.test.js (see that file's own header comment for the full explanation). None of
// these classes touch a database at all.
const { GraphQLError } = require('graphql');
const {
	AuthenticationError,
	UserInputError,
	ForbiddenError,
	RateLimitError,
	rethrow,
} = require('../../utils/errors');

describe('the four GraphQLError subclasses', () => {
	it('AuthenticationError carries the UNAUTHENTICATED code and the given message', () => {
		const err = new AuthenticationError('Action not allowed');
		expect(err).toBeInstanceOf(GraphQLError);
		expect(err.name).toBe('AuthenticationError');
		expect(err.message).toBe('Action not allowed');
		expect(err.extensions.code).toBe('UNAUTHENTICATED');
	});

	it('UserInputError carries the BAD_USER_INPUT code and the given message', () => {
		const err = new UserInputError('Errors');
		expect(err.name).toBe('UserInputError');
		expect(err.extensions.code).toBe('BAD_USER_INPUT');
	});

	it('ForbiddenError carries the FORBIDDEN code', () => {
		const err = new ForbiddenError('Nope');
		expect(err.name).toBe('ForbiddenError');
		expect(err.extensions.code).toBe('FORBIDDEN');
	});

	it('RateLimitError carries the RATE_LIMITED code', () => {
		const err = new RateLimitError('Slow down');
		expect(err.name).toBe('RateLimitError');
		expect(err.extensions.code).toBe('RATE_LIMITED');
	});

	// The whole reason a second constructor arg exists at all: apollo-server's real behavior put
	// the caller's keys at the TOP LEVEL of extensions, not nested under a further `extensions`
	// key - and client/src/pages/register/Register.js (among others) reads
	// `err.graphQLErrors[0].extensions.errors.email` directly, so getting this nesting wrong
	// would silently break every form that highlights a specific field's error.
	it('spreads the second constructor argument\'s keys directly onto extensions, not nested', () => {
		const err = new UserInputError('Errors', { errors: { email: 'is required' } });
		expect(err.extensions.errors).toEqual({ email: 'is required' });
		// The code is still there alongside it - not clobbered by the spread.
		expect(err.extensions.code).toBe('BAD_USER_INPUT');
	});

	it('defaults to an empty extensions input when none is given', () => {
		const err = new ForbiddenError('Nope');
		expect(err.extensions).toEqual({ code: 'FORBIDDEN' });
	});
});

describe('rethrow', () => {
	it('rethrows a GraphQLError (and its subclasses) completely unchanged', () => {
		const original = new UserInputError('Errors', { errors: { email: 'bad' } });
		try {
			rethrow(original);
			throw new Error('rethrow should have thrown');
		} catch (caught) {
			// The SAME object, not a copy - a resolver's catch block re-throwing this must preserve
			// extensions.errors exactly, which a stringify-and-rewrap would destroy (see this
			// function's own header comment on the getShop/getClient/update-mutations bug this
			// fixed).
			expect(caught).toBe(original);
		}
	});

	it('rethrows a plain GraphQLError instance (not just this file\'s named subclasses)', () => {
		const original = new GraphQLError('Something specific went wrong');
		expect(() => rethrow(original)).toThrow(original);
	});

	// The old, broken pattern this replaces was `throw new Error(err)` unconditionally - which
	// this function still does, but ONLY for a non-GraphQLError, so a genuine unexpected failure
	// (a Mongoose cast error, say) keeps behaving exactly like it always did.
	it('wraps a plain Error in a new Error, preserving the old (if awkward) behavior', () => {
		const original = new Error('a mongoose cast error, e.g.');
		expect(() => rethrow(original)).toThrow(Error);
		try {
			rethrow(original);
		} catch (caught) {
			expect(caught).not.toBe(original);
			expect(caught).not.toBeInstanceOf(GraphQLError);
		}
	});

	it('wraps a plain string the same way', () => {
		expect(() => rethrow('a bare string error')).toThrow('a bare string error');
	});
});
