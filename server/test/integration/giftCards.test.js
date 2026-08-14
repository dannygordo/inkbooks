// Integration tests for the gift card feature (graphql/resolvers/giftCards.js) - see
// DECISIONS.md M6 for the design and test/integration/shopCutLedger.test.js for the closest
// existing analog this mirrors in style (dual-control money flow, real GraphQL mutations end to
// end via createTestServer/executeOperation rather than calling resolvers directly).
//
// describe/it/expect/beforeEach come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
  createArtistUser,
  createShopAdminUser,
  connectArtistToShop,
  createAppointment,
} = require('../helpers/factories');
const GiftCard = require('../../models/GiftCard');
const GiftCardRedemption = require('../../models/GiftCardRedemption');
const Appointment = require('../../models/Appointment');

const CREATE_ARTIST_GIFT_CARD = `
  mutation CreateArtistGiftCard($input: CreateArtistGiftCardInput!) {
    createArtistGiftCard(input: $input) {
      id
      code
      issuerType
      issuerArtistId
      shopId
      faceValueCents
      balanceCents
      shopCutCents
      shopCutPercentApplied
      shopCutStatus
    }
  }
`;

const CREATE_SHOP_GIFT_CARD = `
  mutation CreateShopGiftCard($input: CreateShopGiftCardInput!) {
    createShopGiftCard(input: $input) {
      id
      code
      issuerType
      shopId
      faceValueCents
      balanceCents
      shopCutCents
      shopCutPercentApplied
      shopCutStatus
    }
  }
`;

const REDEEM_GIFT_CARD = `
  mutation RedeemGiftCard($appointmentId: ID!, $code: String!, $amountCents: Int!) {
    redeemGiftCard(appointmentId: $appointmentId, code: $code, amountCents: $amountCents) {
      giftCard { id balanceCents }
      appointment {
        id
        shopCutCents
        shopCutPercentApplied
        giftCardCreditCents
        artistIssuedGiftCardCreditCents
      }
      redemption { id amountCents shopPayoutCents }
    }
  }
`;

// A shop plus one artist connected to it at a known cut percent - the shape almost every test
// below needs. Mirrors shopCutLedger.test.js's connectedShop() helper, minus the Square account
// (nothing here invoices through Square - see giftCards.js's own comment on why notifications and
// the invoice mutations are out of scope for this pass).
async function shopWithArtist(shopCutPercent = 40) {
  const { user: shopAdmin, shop } = await createShopAdminUser();
  const { user: artist } = await createArtistUser();
  await connectArtistToShop(artist._id, shop._id, { shopCutPercent });
  return { shopAdmin, shop, artist };
}

describe('createArtistGiftCard', () => {
  it('takes the shop cut immediately, at the artist\'s own configured rate', async () => {
    const { artist, shop } = await shopWithArtist(40);
    const token = signTestToken(artist);
    const server = createTestServer();

    const response = await server.executeOperation(
      { query: CREATE_ARTIST_GIFT_CARD, variables: { input: { faceValueCents: 10000 } } },
      { contextValue: contextWithToken(token) },
    );

    const { errors, data } = response.body.singleResult;
    expect(errors).toBeUndefined();
    const card = data.createArtistGiftCard;
    expect(card.issuerType).toBe('ARTIST');
    expect(String(card.issuerArtistId)).toBe(String(artist.id));
    expect(String(card.shopId)).toBe(String(shop.id));
    expect(card.faceValueCents).toBe(10000);
    // Full face value on the balance, per M6 - never reduced by anything at the point of sale.
    expect(card.balanceCents).toBe(10000);
    // 40% of the $100 face value - taken AT THE SALE (M3/M6), not deferred to redemption.
    expect(card.shopCutCents).toBe(4000);
    expect(card.shopCutPercentApplied).toBe(40);
    expect(card.shopCutStatus).toBe('unpaid');

    const stored = await GiftCard.findById(card.id);
    expect(stored.code).toBeTruthy();
    expect(stored.codeNormalized).toBe(stored.code.replace(/-/g, ''));
  });

  it('carries no cut at all for an independent artist - M1\'s 0-with-no-shop case', async () => {
    const { user: artist } = await createArtistUser(); // no shop connection
    const token = signTestToken(artist);
    const server = createTestServer();

    const response = await server.executeOperation(
      { query: CREATE_ARTIST_GIFT_CARD, variables: { input: { faceValueCents: 5000 } } },
      { contextValue: contextWithToken(token) },
    );

    const { errors, data } = response.body.singleResult;
    expect(errors).toBeUndefined();
    const card = data.createArtistGiftCard;
    expect(card.shopId).toBeNull();
    expect(card.shopCutCents).toBe(0);
    expect(card.shopCutStatus).toBe('none');
  });
});

describe('createShopGiftCard', () => {
  it('records the full face value as owed to the shop, at 100% - never the admin\'s own rate', async () => {
    const { shopAdmin, shop } = await shopWithArtist(40);
    const token = signTestToken(shopAdmin);
    const server = createTestServer();

    const response = await server.executeOperation(
      {
        query: CREATE_SHOP_GIFT_CARD,
        variables: { input: { shopId: shop.id, faceValueCents: 20000 } },
      },
      { contextValue: contextWithToken(token) },
    );

    const { errors, data } = response.body.singleResult;
    expect(errors).toBeUndefined();
    const card = data.createShopGiftCard;
    expect(card.issuerType).toBe('SHOP');
    expect(card.faceValueCents).toBe(20000);
    expect(card.balanceCents).toBe(20000);
    // 100% - not 40%, the shop's configured rate for this shop's artists. This is a shop
    // product; none of it is the selling admin's own revenue (M6, verbatim).
    expect(card.shopCutCents).toBe(20000);
    expect(card.shopCutPercentApplied).toBe(100);
    expect(card.shopCutStatus).toBe('unpaid');
  });

  it('rejects a caller who is not an admin at the named shop', async () => {
    const { artist } = await shopWithArtist(40); // ARTIST role, not SHOP_ADMIN
    const { shop: otherShop } = await createShopAdminUser();
    const token = signTestToken(artist);
    const server = createTestServer();

    const response = await server.executeOperation(
      {
        query: CREATE_SHOP_GIFT_CARD,
        variables: { input: { shopId: otherShop.id, faceValueCents: 20000 } },
      },
      { contextValue: contextWithToken(token) },
    );

    const { errors, data } = response.body.singleResult;
    expect(data).toBeNull();
    expect(errors[0].message).toMatch(/Action not allowed/);
  });
});

describe('redeemGiftCard - artist-issued', () => {
  it('excludes the applied amount from the session\'s own cuttable base, so it is not cut twice', async () => {
    const { artist, shop } = await shopWithArtist(40);
    const token = signTestToken(artist);
    const server = createTestServer();

    const saleResponse = await server.executeOperation(
      { query: CREATE_ARTIST_GIFT_CARD, variables: { input: { faceValueCents: 10000 } } }, // $100
      { contextValue: contextWithToken(token) },
    );
    const card = saleResponse.body.singleResult.data.createArtistGiftCard;
    expect(card.shopCutCents).toBe(4000); // the cut already taken at the sale

    // The SAME artist's later session - a $200 subtotal, at the shop's 40% rate.
    const appointment = await createAppointment(artist.id, {
      shopId: shop.id,
      subtotalCents: 20000,
    });

    const response = await server.executeOperation(
      {
        query: REDEEM_GIFT_CARD,
        variables: { appointmentId: appointment.id, code: card.code, amountCents: 10000 },
      },
      { contextValue: contextWithToken(token) },
    );

    const { errors, data } = response.body.singleResult;
    expect(errors).toBeUndefined();
    const result = data.redeemGiftCard;
    expect(result.giftCard.balanceCents).toBe(0);
    expect(result.appointment.giftCardCreditCents).toBe(10000);
    expect(result.appointment.artistIssuedGiftCardCreditCents).toBe(10000);
    // (20000 - 10000) x 40% = 4000 - NOT 20000 x 40% = 8000. The $100 already had its cut taken
    // at the sale; cutting it again here would be the exact double-cut M6 warns about.
    expect(result.appointment.shopCutCents).toBe(4000);
    // No shop-payout figure for an artist-issued redemption - it never reaches a second party to
    // net against (M6).
    expect(result.redemption.shopPayoutCents).toBeNull();

    const storedAppointment = await Appointment.findById(appointment.id);
    expect(storedAppointment.shopCutCents).toBe(4000);
  });

  it('refuses a redemption against any other artist\'s session - not silently allowed', async () => {
    const { artist: issuer, shop } = await shopWithArtist(40);
    const { user: otherArtist } = await createArtistUser();
    await connectArtistToShop(otherArtist._id, shop._id, { shopCutPercent: 40 });

    const issuerToken = signTestToken(issuer);
    const server = createTestServer();
    const saleResponse = await server.executeOperation(
      { query: CREATE_ARTIST_GIFT_CARD, variables: { input: { faceValueCents: 10000 } } },
      { contextValue: contextWithToken(issuerToken) },
    );
    const card = saleResponse.body.singleResult.data.createArtistGiftCard;

    // A session belonging to the OTHER artist at the same shop.
    const otherAppointment = await createAppointment(otherArtist.id, {
      shopId: shop.id,
      subtotalCents: 20000,
    });
    const otherToken = signTestToken(otherArtist);

    const response = await server.executeOperation(
      {
        query: REDEEM_GIFT_CARD,
        variables: { appointmentId: otherAppointment.id, code: card.code, amountCents: 5000 },
      },
      { contextValue: contextWithToken(otherToken) },
    );

    const { errors, data } = response.body.singleResult;
    expect(data).toBeNull();
    expect(errors[0].extensions.errors.code).toMatch(/locked to the artist who issued it/);

    // Refused outright - the balance must not have moved.
    const stored = await GiftCard.findById(card.id);
    expect(stored.balanceCents).toBe(10000);
  });
});

describe('redeemGiftCard - shop-issued', () => {
  // DECISIONS.md M6: "$200 session, 40%, $100 card: 80 - 100 = -20, shop owes the artist $20."
  it('the shop owes the artist $20 when a $100 card is redeemed against a $200/40% session', async () => {
    const { shopAdmin, shop, artist } = await shopWithArtist(40);
    const adminToken = signTestToken(shopAdmin);
    const server = createTestServer();

    const saleResponse = await server.executeOperation(
      {
        query: CREATE_SHOP_GIFT_CARD,
        variables: { input: { shopId: shop.id, faceValueCents: 10000 } }, // $100
      },
      { contextValue: contextWithToken(adminToken) },
    );
    const card = saleResponse.body.singleResult.data.createShopGiftCard;

    // Redeemed by the ARTIST doing the work, who never sold this card - "any artist's session at
    // the shop" (M6).
    const appointment = await createAppointment(artist.id, { shopId: shop.id, subtotalCents: 20000 });
    const artistToken = signTestToken(artist);

    const response = await server.executeOperation(
      {
        query: REDEEM_GIFT_CARD,
        variables: { appointmentId: appointment.id, code: card.code, amountCents: 10000 },
      },
      { contextValue: contextWithToken(artistToken) },
    );

    const { errors, data } = response.body.singleResult;
    expect(errors).toBeUndefined();
    const result = data.redeemGiftCard;
    expect(result.giftCard.balanceCents).toBe(0);
    // Negative: the shop owes the artist $20 (DECISIONS.md M6's sign convention, verbatim).
    expect(result.redemption.shopPayoutCents).toBe(-2000);
    // A shop-issued card's applied amount does NOT reduce the appointment's own cuttable base -
    // that cut still runs on the full $200 subtotal, per M6.
    expect(result.appointment.shopCutCents).toBe(8000);
    expect(result.appointment.artistIssuedGiftCardCreditCents).toBe(0);
    expect(result.appointment.giftCardCreditCents).toBe(10000);
  });

  // DECISIONS.md M6: "Same session, $50 card: 80 - 50 = +30, artist owes the shop $30."
  it('the artist owes the shop $30 when a $50 card is redeemed against the same session shape', async () => {
    const { shopAdmin, shop, artist } = await shopWithArtist(40);
    const adminToken = signTestToken(shopAdmin);
    const server = createTestServer();

    const saleResponse = await server.executeOperation(
      { query: CREATE_SHOP_GIFT_CARD, variables: { input: { shopId: shop.id, faceValueCents: 5000 } } }, // $50
      { contextValue: contextWithToken(adminToken) },
    );
    const card = saleResponse.body.singleResult.data.createShopGiftCard;

    const appointment = await createAppointment(artist.id, { shopId: shop.id, subtotalCents: 20000 });
    const artistToken = signTestToken(artist);

    const response = await server.executeOperation(
      {
        query: REDEEM_GIFT_CARD,
        variables: { appointmentId: appointment.id, code: card.code, amountCents: 5000 },
      },
      { contextValue: contextWithToken(artistToken) },
    );

    const { errors, data } = response.body.singleResult;
    expect(errors).toBeUndefined();
    // Positive: the artist owes the shop $30.
    expect(data.redeemGiftCard.redemption.shopPayoutCents).toBe(3000);
  });

  it('refuses redemption at a different shop than the one it was issued for', async () => {
    const { shopAdmin, shop } = await shopWithArtist(40);
    const { user: otherArtist } = await createArtistUser();
    const { shop: otherShop } = await createShopAdminUser();
    await connectArtistToShop(otherArtist._id, otherShop._id, { shopCutPercent: 40 });

    const adminToken = signTestToken(shopAdmin);
    const server = createTestServer();

    const saleResponse = await server.executeOperation(
      { query: CREATE_SHOP_GIFT_CARD, variables: { input: { shopId: shop.id, faceValueCents: 10000 } } },
      { contextValue: contextWithToken(adminToken) },
    );
    const card = saleResponse.body.singleResult.data.createShopGiftCard;

    // A session at the OTHER shop - not the one this card was sold for.
    const appointment = await createAppointment(otherArtist.id, {
      shopId: otherShop.id,
      subtotalCents: 20000,
    });
    const otherArtistToken = signTestToken(otherArtist);

    const response = await server.executeOperation(
      {
        query: REDEEM_GIFT_CARD,
        variables: { appointmentId: appointment.id, code: card.code, amountCents: 5000 },
      },
      { contextValue: contextWithToken(otherArtistToken) },
    );

    const { errors, data } = response.body.singleResult;
    expect(data).toBeNull();
    expect(errors[0].extensions.errors.code).toMatch(/can only be redeemed at the shop that issued it/);

    const stored = await GiftCard.findById(card.id);
    expect(stored.balanceCents).toBe(10000); // untouched
  });
});

describe('redeemGiftCard - partial redemption', () => {
  it('leaves the correct remaining balance across two partial redemptions', async () => {
    const { shopAdmin, shop, artist } = await shopWithArtist(40);
    const adminToken = signTestToken(shopAdmin);
    const server = createTestServer();

    const saleResponse = await server.executeOperation(
      { query: CREATE_SHOP_GIFT_CARD, variables: { input: { shopId: shop.id, faceValueCents: 10000 } } },
      { contextValue: contextWithToken(adminToken) },
    );
    const card = saleResponse.body.singleResult.data.createShopGiftCard;

    const appointmentOne = await createAppointment(artist.id, { shopId: shop.id, subtotalCents: 5000 });
    const appointmentTwo = await createAppointment(artist.id, { shopId: shop.id, subtotalCents: 5000 });
    const artistToken = signTestToken(artist);

    const first = await server.executeOperation(
      {
        query: REDEEM_GIFT_CARD,
        variables: { appointmentId: appointmentOne.id, code: card.code, amountCents: 3000 },
      },
      { contextValue: contextWithToken(artistToken) },
    );
    expect(first.body.singleResult.errors).toBeUndefined();
    expect(first.body.singleResult.data.redeemGiftCard.giftCard.balanceCents).toBe(7000);

    const second = await server.executeOperation(
      {
        query: REDEEM_GIFT_CARD,
        variables: { appointmentId: appointmentTwo.id, code: card.code, amountCents: 3000 },
      },
      { contextValue: contextWithToken(artistToken) },
    );
    expect(second.body.singleResult.errors).toBeUndefined();
    expect(second.body.singleResult.data.redeemGiftCard.giftCard.balanceCents).toBe(4000);

    const stored = await GiftCard.findById(card.id);
    expect(stored.balanceCents).toBe(4000);

    const redemptions = await GiftCardRedemption.find({ giftCardId: card.id }).sort({ redeemedAt: 1 });
    expect(redemptions).toHaveLength(2);
    expect(redemptions[0].amountCents).toBe(3000);
    expect(redemptions[1].amountCents).toBe(3000);
  });

  it('refuses a redemption larger than the remaining balance', async () => {
    const { shopAdmin, shop, artist } = await shopWithArtist(40);
    const adminToken = signTestToken(shopAdmin);
    const server = createTestServer();

    const saleResponse = await server.executeOperation(
      { query: CREATE_SHOP_GIFT_CARD, variables: { input: { shopId: shop.id, faceValueCents: 2000 } } },
      { contextValue: contextWithToken(adminToken) },
    );
    const card = saleResponse.body.singleResult.data.createShopGiftCard;

    const appointment = await createAppointment(artist.id, { shopId: shop.id, subtotalCents: 5000 });
    const artistToken = signTestToken(artist);

    const response = await server.executeOperation(
      {
        query: REDEEM_GIFT_CARD,
        variables: { appointmentId: appointment.id, code: card.code, amountCents: 5000 },
      },
      { contextValue: contextWithToken(artistToken) },
    );

    const { errors, data } = response.body.singleResult;
    expect(data).toBeNull();
    expect(errors[0].extensions.errors.amountCents).toMatch(/more than the card's remaining balance/);

    const stored = await GiftCard.findById(card.id);
    expect(stored.balanceCents).toBe(2000); // untouched
  });
});
