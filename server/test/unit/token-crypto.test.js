// describe/it/expect/beforeEach come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.
const crypto = require('crypto');
const tokenCrypto = require('../../utils/token-crypto');

describe('token-crypto', () => {
	beforeEach(() => {
		// A real 32-byte key, base64-encoded - matches the exact generation command documented in
		// the module itself and used in production (a different real key, obviously).
		process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
	});

	it('round-trips a plaintext value exactly', () => {
		const plaintext = 'a-real-square-oauth-access-token-value';
		const encrypted = tokenCrypto.encrypt(plaintext);
		expect(tokenCrypto.decrypt(encrypted)).toBe(plaintext);
	});

	it('produces a different ciphertext each time (random IV per call)', () => {
		const plaintext = 'same-input-every-time';
		const first = tokenCrypto.encrypt(plaintext);
		const second = tokenCrypto.encrypt(plaintext);
		expect(first).not.toBe(second);
		// ...but both still decrypt to the same original value.
		expect(tokenCrypto.decrypt(first)).toBe(plaintext);
		expect(tokenCrypto.decrypt(second)).toBe(plaintext);
	});

	it('rejects a tampered ciphertext (GCM auth tag catches it)', () => {
		const encrypted = tokenCrypto.encrypt('sensitive-value');
		const [iv, authTag, ciphertext] = encrypted.split('.');
		// Flip the ciphertext to something else, same length, still valid base64.
		const tamperedCiphertext = Buffer.from(ciphertext, 'base64');
		tamperedCiphertext[0] = tamperedCiphertext[0] ^ 0xff;
		const tampered = [iv, authTag, tamperedCiphertext.toString('base64')].join('.');
		expect(() => tokenCrypto.decrypt(tampered)).toThrow();
	});

	it('rejects decryption with a different key than it was encrypted with', () => {
		const encrypted = tokenCrypto.encrypt('sensitive-value');
		process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
		expect(() => tokenCrypto.decrypt(encrypted)).toThrow();
	});

	it('throws if TOKEN_ENCRYPTION_KEY is not set', () => {
		delete process.env.TOKEN_ENCRYPTION_KEY;
		expect(() => tokenCrypto.encrypt('anything')).toThrow(/TOKEN_ENCRYPTION_KEY/);
	});

	it('throws if TOKEN_ENCRYPTION_KEY does not decode to exactly 32 bytes', () => {
		process.env.TOKEN_ENCRYPTION_KEY = Buffer.from('too-short').toString('base64');
		expect(() => tokenCrypto.encrypt('anything')).toThrow(/32 bytes/);
	});

	it('rejects encrypting an empty string', () => {
		expect(() => tokenCrypto.encrypt('')).toThrow(/non-empty string/);
	});

	it('rejects decrypting a malformed value (wrong number of parts)', () => {
		expect(() => tokenCrypto.decrypt('not-the-right-shape')).toThrow(/malformed/);
	});
});
