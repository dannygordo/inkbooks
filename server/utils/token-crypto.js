const crypto = require('crypto');

// Encrypts Square OAuth access/refresh tokens before they're stored on the Shop document (see
// models/Shop.js's squareAccessTokenEncrypted/squareRefreshTokenEncrypted). This isn't optional
// hardening - Square's own "Move OAuth to Production" requirements explicitly call for encrypting
// tokens at rest with a key that isn't accessible to anyone who doesn't need it, since the token
// this protects can perform any action on the connected shop's Square account.
//
// Unlike utils/email.js/utils/firebase-admin.js, this module does NOT degrade gracefully when
// unconfigured - those features are optional (the app still works with email/image-upload
// disabled), but silently storing an OAuth token in plaintext because the key was missing would be
// a real security regression, not a missing nice-to-have. encrypt()/decrypt() throw instead.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96-bit IV is the recommended/standard size for GCM

function getKey() {
  const keyBase64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set - cannot encrypt/decrypt Square OAuth tokens. Generate ' +
        'one with `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"` ' +
        'and set it as an env var (keep it secret - anyone with this key plus the encrypted ' +
        'tokens in the database can act as any connected shop\'s Square account).',
    );
  }
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256 - got ${key.length}. ` +
        'Regenerate it with the command above.',
    );
  }
  return key;
}

// Returns a single self-contained string ("iv.authTag.ciphertext", each base64) so callers don't
// need to manage/store IV and auth tag as separate fields alongside the ciphertext.
function encrypt(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encrypt() requires a non-empty string');
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
    '.',
  );
}

function decrypt(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error('decrypt() requires a non-empty string');
  }
  const parts = encoded.split('.');
  if (parts.length !== 3) {
    throw new Error('decrypt() received a malformed value - expected "iv.authTag.ciphertext"');
  }
  const [ivBase64, authTagBase64, ciphertextBase64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt };
