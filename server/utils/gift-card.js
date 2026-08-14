const crypto = require('crypto');
const { percentOfCents } = require('./money');

/**
 * Gift card arithmetic and code generation - the pure half, same split as square-pricing.js
 * (arithmetic, checkable with no network call) and shop-cut.js (percentages, checkable with no
 * Square call). Nothing here touches Mongo or Square.
 *
 * See DECISIONS.md M6 for the full design this implements. The short version: a gift card records
 * WHO issued it (an artist, for themselves alone, or the shop, as a product) and that answers who
 * carries the liability and who the shop's cut is settled against, and when.
 */

// Excludes 0/O and 1/I - the two pairs a person reading a code aloud at a register, or typing one
// off a receipt, actually confuses. Uppercase only, for the same reason receipts are traditionally
// printed in caps: it reads the same handwritten, printed, or spoken.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_GROUP_LENGTH = 4;
const CODE_GROUPS = 3;

/**
 * A random gift card code - NOT derived from the card's own attributes.
 *
 * DECISIONS.md M6, verbatim: "Random code plus a database record. Not a hash of the attributes -
 * a hash is opaque, so you need the record anyway, and guessable inputs make codes enumerable."
 * A hash of (issuerArtistId, faceValueCents, soldAt) would still need a database row to mean
 * anything, so hashing buys nothing, and it turns "guess a plausible sale" into "guess a code" -
 * exactly the property a bearer instrument must not have. crypto.randomInt is a CSPRNG; Math.random
 * is not, and a gift card code is a bearer credential, not a display id.
 *
 * Formatted in groups (XXXX-XXXX-XXXX) purely for legibility at a register - the dashes carry no
 * meaning and are stripped by normalizeGiftCardCode before a lookup.
 */
function generateGiftCardCode() {
  const groups = [];
  for (let g = 0; g < CODE_GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < CODE_GROUP_LENGTH; i += 1) {
      group += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/**
 * Codes are looked up case- and formatting-insensitively - a client typing a code back in without
 * the dashes, or in lowercase, is not "a different code that happens to not exist". Stored form
 * keeps the dashes (generateGiftCardCode's own format); this is only applied at lookup/comparison
 * time, never persisted as a second field, so there is exactly one stored representation.
 */
function normalizeGiftCardCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * The shop's net settlement with the artist when a SHOP-ISSUED gift card is redeemed against a
 * session - DECISIONS.md M6, quoted exactly rather than re-derived:
 *
 *   (session_total x shop_rate) - gift_card_applied
 *
 * POSITIVE means the artist owes the shop. NEGATIVE means the shop owes the artist. Get that
 * backwards and it is found three months late, per the doc's own warning - so every caller of this
 * function is expected to test the sign, not just the magnitude.
 *
 * ARTIST-ISSUED cards never call this. They never reach a second party to net against - the cut was
 * already taken at the sale (see applyShopCut / DECISIONS.md M3), and the card's own artist is both
 * the seller and the one doing the redeeming work, so there is nothing left to settle between two
 * people.
 *
 * `sessionTotalCents` is the session's pre-tax subtotal (the SAME figure the ordinary shop cut is
 * computed on - DECISIONS.md M2), not the taxed total and not net of the gift card. The gift card
 * comes off the taxed TOTAL (M8), which is a different number entirely and not this function's
 * concern.
 */
function computeShopIssuedGiftCardPayoutCents({
  sessionTotalCents,
  shopCutPercent,
  giftCardAppliedCents,
}) {
  const ordinaryCut = percentOfCents(sessionTotalCents || 0, shopCutPercent || 0);
  return ordinaryCut - (giftCardAppliedCents || 0);
}

module.exports = {
  generateGiftCardCode,
  normalizeGiftCardCode,
  computeShopIssuedGiftCardPayoutCents,
};
