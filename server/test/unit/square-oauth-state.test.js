// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.

// globalSetup.js sets this for the integration run; set it here only if it is missing, so this
// file also passes when the unit suites are run on their own (no mongod, no globalSetup) without
// overwriting the value the rest of a full run is using.
if (!process.env.SECRET_KEY) {
	process.env.SECRET_KEY = 'test-secret-key-do-not-use-in-production';
}

const jwt = require('jsonwebtoken');
const { signState } = require('../../routes/squareOAuth');

/**
 * The `state` parameter is the only thing standing between "the owner who clicked connect" and
 * someone else's Square credentials landing on their row. Square hands it back to the callback
 * unmodified and unchecked, so every property that matters has to come from the signature.
 *
 * It used to carry a bare shopId. It now carries ownerType + ownerId (DECISIONS.md M9), and the
 * case these tests exist for is the new one: an attacker taking a legitimately-signed SHOP state
 * and flipping it to ARTIST, or vice versa. If ownerType were passed alongside the token rather
 * than inside it, that attack would work and nothing would look wrong.
 */

// verifyState is deliberately not exported - it is an implementation detail of the callback
// route. Decoding here with the same key exercises the same claims the route reads.
function decode(state) {
	return jwt.verify(state, process.env.SECRET_KEY);
}

describe('signState', () => {
	it('seals BOTH the owner type and the owner id, not just the id', () => {
		const decoded = decode(signState('SHOP', '507f1f77bcf86cd799439011'));
		expect(decoded.ownerType).toBe('SHOP');
		expect(decoded.ownerId).toBe('507f1f77bcf86cd799439011');
	});

	it('signs an artist owner the same way', () => {
		const decoded = decode(signState('ARTIST', '507f191e810c19729de860ea'));
		expect(decoded.ownerType).toBe('ARTIST');
		expect(decoded.ownerId).toBe('507f191e810c19729de860ea');
	});

	// ObjectIds arrive as Mongoose ObjectId instances at most call sites. Left unstringified they
	// serialize into the JWT as an object, and the callback then compares an object against a
	// string id and finds nothing - a connection that fails for a reason no log explains.
	it('stringifies an ObjectId-like owner id rather than embedding an object', () => {
		const objectIdLike = { toString: () => '507f1f77bcf86cd799439011' };
		const decoded = decode(signState('SHOP', objectIdLike));
		expect(decoded.ownerId).toBe('507f1f77bcf86cd799439011');
		expect(typeof decoded.ownerId).toBe('string');
	});

	it('carries the purpose claim that stops a login token being replayed here', () => {
		expect(decode(signState('SHOP', 'abc')).purpose).toBe('square_oauth_state');
	});

	it('expires, rather than being valid forever', () => {
		const decoded = decode(signState('SHOP', 'abc'));
		expect(decoded.exp).toBeDefined();
		expect(decoded.exp - decoded.iat).toBe(15 * 60);
	});

	// A typo'd owner type would otherwise be signed happily and only fail much later, inside the
	// callback, after the seller has already authorized on Square's page.
	it('refuses to sign an unknown owner type', () => {
		expect(() => signState('USER', 'abc')).toThrow(/ownerType/);
		expect(() => signState('shop', 'abc')).toThrow(/ownerType/);
		expect(() => signState(undefined, 'abc')).toThrow(/ownerType/);
	});

	// The whole point of putting ownerType inside the signature. Re-signing with a flipped type
	// requires the key; editing the payload without it invalidates the token.
	it('cannot have its owner type flipped without invalidating the signature', () => {
		const state = signState('SHOP', '507f1f77bcf86cd799439011');
		const [header, payload, signature] = state.split('.');
		const tampered = JSON.parse(Buffer.from(payload, 'base64url').toString());
		tampered.ownerType = 'ARTIST';
		const forged = [
			header,
			Buffer.from(JSON.stringify(tampered)).toString('base64url'),
			signature,
		].join('.');

		expect(() => decode(forged)).toThrow();
	});

	it('cannot have its owner id swapped for another shop', () => {
		const state = signState('SHOP', '507f1f77bcf86cd799439011');
		const [header, payload, signature] = state.split('.');
		const tampered = JSON.parse(Buffer.from(payload, 'base64url').toString());
		tampered.ownerId = '507f191e810c19729de860ea';
		const forged = [
			header,
			Buffer.from(JSON.stringify(tampered)).toString('base64url'),
			signature,
		].join('.');

		expect(() => decode(forged)).toThrow();
	});

	it('does not verify under a different key', () => {
		const state = signState('SHOP', 'abc');
		expect(() => jwt.verify(state, 'some-other-key')).toThrow();
	});
});
