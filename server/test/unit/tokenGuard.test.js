// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.
const { guardTokenPayload, FIELDS_NOT_IN_TOKEN } = require('../../utils/check-auth');

/**
 * The JWT payload is {id, email, role}. Reading anything else off it returns undefined, which is
 * the problem: `user.userType === 'artist'` is a comparison that reads perfectly and is
 * permanently false, so a resolver silently does the wrong thing forever with nothing erroring.
 *
 * That shipped three times in one codebase - updateArtistRateSettings (broken from the day it was
 * written, no test, nobody knew), updateMyBookingSlug (copied from it, caught only because it had
 * tests), and attentionForUser (would have returned an empty list to every artist). Two were found
 * by accident.
 *
 * These tests exist so a fourth fails immediately instead of quietly.
 */
describe('guardTokenPayload', () => {
	const token = () => guardTokenPayload({ id: 'u1', email: 'a@b.com', role: 20 });

	it('leaves the fields the token actually carries alone', () => {
		const user = token();
		expect(user.id).toBe('u1');
		expect(user.email).toBe('a@b.com');
		expect(user.role).toBe(20);
	});

	it('throws on every field the token does not carry', () => {
		const user = token();
		for (const field of Object.keys(FIELDS_NOT_IN_TOKEN)) {
			expect(() => user[field]).toThrow(/not on the JWT/);
		}
	});

	it('says what to do instead, not just that it is wrong', () => {
		// An error that only says "don't" sends somebody looking for the answer. The answer is a
		// real database relationship, and it should be in the message they are already reading.
		const user = token();
		expect(() => user.userType).toThrow(/Artist\.exists/);
		expect(() => user.shopId).toThrow(/getShopIdsForUser/);
	});

	it('does not break spreading or serialising a token', () => {
		// Both walk OWN keys, and the guarded fields are absent rather than present-and-undefined,
		// so neither reads them. If this were implemented as a `has` trap instead, every
		// `{ ...user }` in the codebase would start throwing.
		const user = token();
		expect({ ...user }).toEqual({ id: 'u1', email: 'a@b.com', role: 20 });
		expect(JSON.parse(JSON.stringify(user))).toEqual({
			id: 'u1',
			email: 'a@b.com',
			role: 20,
		});
	});

	it('stays out of the way of fields nobody has claimed are a trap', () => {
		// Guarding everything would turn an ordinary typo into a crash and make the guard itself
		// the thing people work around.
		expect(token().somethingNobodyGuarded).toBeUndefined();
	});

	it('allows a payload that genuinely does carry the field', () => {
		// The guard is about the field being ABSENT, not about the name being forbidden. If the
		// token ever starts carrying userType, this stops firing on its own rather than needing to
		// be remembered and removed.
		const enriched = guardTokenPayload({ id: 'u1', userType: 'artist' });
		expect(enriched.userType).toBe('artist');
	});
});
