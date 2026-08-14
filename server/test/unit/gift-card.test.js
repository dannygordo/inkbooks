// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
//
// Same convention as test/unit/square-pricing.test.js: every expected number below is either
// lifted verbatim from DECISIONS.md M6's worked examples or hand-computed from the rule the
// section states, and named where it comes from a worked example - so that if this file and
// DECISIONS.md ever disagree, it's obvious which one moved.
const {
  generateGiftCardCode,
  normalizeGiftCardCode,
  computeShopIssuedGiftCardPayoutCents,
} = require('../../utils/gift-card');

describe('generateGiftCardCode', () => {
  it('produces a 3x4 grouped code from the unambiguous alphabet', () => {
    const code = generateGiftCardCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  // Not a hard guarantee (it's random), but a sample this size never colliding is the whole point
  // of a CSPRNG-backed 33^12 space - this is a smoke check, not a statistical proof.
  it('is different every call', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateGiftCardCode()));
    expect(codes.size).toBe(200);
  });

  it('never contains the excluded look-alike characters', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateGiftCardCode()).not.toMatch(/[01OI]/);
    }
  });
});

describe('normalizeGiftCardCode', () => {
  it('strips dashes and uppercases', () => {
    expect(normalizeGiftCardCode('abcd-efgh-jklm')).toBe('ABCDEFGHJKLM');
  });

  it('treats a code typed without dashes the same as the display form', () => {
    expect(normalizeGiftCardCode('ABCD-EFGH-JKLM')).toBe(normalizeGiftCardCode('ABCDEFGHJKLM'));
  });

  it('handles stray whitespace a copy-paste from an email might introduce', () => {
    expect(normalizeGiftCardCode('  abcd efgh jklm  ')).toBe('ABCDEFGHJKLM');
  });

  it('is empty for null/undefined rather than throwing', () => {
    expect(normalizeGiftCardCode(null)).toBe('');
    expect(normalizeGiftCardCode(undefined)).toBe('');
  });
});

describe('computeShopIssuedGiftCardPayoutCents', () => {
  // DECISIONS.md M6, quoted exactly: "Worked both directions. $200 session, 40%, $100 card:
  // 80 - 100 = -20, shop owes the artist $20."
  it('the shop owes the artist when the card covers more than the ordinary cut - $200/40%/$100 card', () => {
    const payout = computeShopIssuedGiftCardPayoutCents({
      sessionTotalCents: 20000,
      shopCutPercent: 40,
      giftCardAppliedCents: 10000,
    });
    expect(payout).toBe(-2000);
    expect(payout).toBeLessThan(0); // negative = shop owes the artist, per M6's sign convention
  });

  // DECISIONS.md M6, quoted exactly: "Same session, $50 card: 80 - 50 = +30, artist owes the
  // shop $30."
  it('the artist owes the shop when the card covers less than the ordinary cut - $200/40%/$50 card', () => {
    const payout = computeShopIssuedGiftCardPayoutCents({
      sessionTotalCents: 20000,
      shopCutPercent: 40,
      giftCardAppliedCents: 5000,
    });
    expect(payout).toBe(3000);
    expect(payout).toBeGreaterThan(0); // positive = artist owes the shop, per M6's sign convention
  });

  // When the card covers EXACTLY the ordinary cut, nobody owes anybody anything - the boundary
  // between the two worked examples above.
  it('nets to zero when the card exactly covers the ordinary cut', () => {
    expect(
      computeShopIssuedGiftCardPayoutCents({
        sessionTotalCents: 20000,
        shopCutPercent: 40,
        giftCardAppliedCents: 8000,
      }),
    ).toBe(0);
  });

  it('is zero-safe for a shop with no configured cut (M1\'s 0-with-no-shop case)', () => {
    expect(
      computeShopIssuedGiftCardPayoutCents({
        sessionTotalCents: 20000,
        shopCutPercent: 0,
        giftCardAppliedCents: 5000,
      }),
    ).toBe(-5000);
  });
});
