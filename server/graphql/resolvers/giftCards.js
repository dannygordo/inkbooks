const GiftCard = require('../../models/GiftCard');
const GiftCardRedemption = require('../../models/GiftCardRedemption');
const Appointment = require('../../models/Appointment');
const Artist = require('../../models/Artist');
const User = require('../../models/User');
const SquareAccount = require('../../models/SquareAccount');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
const { assertCanAccessShop, assertCanManageArtist } = require('../../utils/shop-membership');
const { getActiveShopIdForArtist } = require('../../utils/artist-shop');
const { findAccountForOwner } = require('../../utils/square-account');
const { applyShopCut, resolveShopCutPercentAt } = require('../../utils/shop-cut');
const { computeChargeBreakdown, resolveSquareSettings } = require('../../utils/square-pricing');
const {
  generateGiftCardCode,
  normalizeGiftCardCode,
  computeShopIssuedGiftCardPayoutCents,
} = require('../../utils/gift-card');
const { formatCents } = require('../../utils/money');
const { recordEvent } = require('../../utils/event-log');
const square = require('../../utils/square');
const {
  createArtistGiftCardInputSchema,
  createShopGiftCardInputSchema,
  redeemGiftCardInputSchema,
  giftCardIdInputSchema,
  createGiftCardShopCutInvoiceInputSchema,
  validate,
} = require('../../utils/validation');

/**
 * Gift cards. See DECISIONS.md M6 for the full design - this file is the mechanical half of it.
 *
 * ---------------------------------------------------------------------------------------------
 * NOTIFICATIONS ARE DELIBERATELY NOT WIRED UP HERE, unlike mutations/shopCutPayments.js and
 * mutations/deposits.js, which both send one on every state change. Stated rather than hidden,
 * matching this codebase's own convention (see HANDOFF.md's "Known gaps, not bugs"): the money
 * mechanics - sale, redemption, the issuer lock, the shop-cut settlement and its sign - are the
 * load-bearing part of this feature and are what M6 actually specifies. Which notification
 * catalogue entries a gift card event should produce is a NOTIFICATIONS_DESIGN.md decision this
 * shipped without, and guessing at it risks the exact mistake that section's own §4 correction
 * (shop_cut_invoiced) already document once - a wrong audience is worse than no notification.
 * ---------------------------------------------------------------------------------------------
 */

async function generateUniqueGiftCardCode() {
  // Collisions are astronomically unlikely (the alphabet is 33 characters, 12 of them per code)
  // but this is a bearer credential - two cards sharing a code would let one owner redeem the
  // other's balance - so it's checked and retried rather than trusted blindly. Capped so a
  // persistent unique-index problem fails loudly instead of looping forever.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateGiftCardCode();
    // eslint-disable-next-line no-await-in-loop
    const exists = await GiftCard.exists({ codeNormalized: normalizeGiftCardCode(code) });
    if (!exists) {
      return code;
    }
  }
  throw new Error('Could not generate a unique gift card code - please try again.');
}

/**
 * A plain object satisfying applyShopCut's read shape - subtotalCents, depositCreditCents,
 * shopId, userId, appointmentDate - see utils/shop-cut.js. A gift card sale is not an
 * Appointment, and reshaping applyShopCut to accept either would widen an already-tested
 * contract for every one of its existing callers rather than for this one new case.
 *
 * applyShopCut never inspects its argument's constructor - it only reads these five fields and
 * writes three back (shopCutCents, shopCutPercentApplied, shopCutStatus) - so anything with this
 * shape satisfies it whether or not it is a real Mongoose document. This is the judgment call the
 * build brief flagged explicitly: a small synthetic object here, rather than a refactor of
 * applyShopCut itself, so its existing appointment-facing behavior (and its existing tests) stay
 * exactly as they were.
 */
function buildSyntheticGiftCardSale(giftCard) {
  return {
    subtotalCents: giftCard.faceValueCents,
    depositCreditCents: 0,
    shopId: giftCard.shopId,
    userId: giftCard.issuerArtistId,
    appointmentDate: giftCard.soldAt,
    shopCutStatus: 'none',
  };
}

async function giftCardLiabilityReport(matchExtra) {
  const [agg] = await GiftCard.aggregate([
    { $match: { balanceCents: { $gt: 0 }, ...matchExtra } },
    {
      $group: {
        _id: null,
        outstandingBalanceCents: { $sum: '$balanceCents' },
        cardCount: { $sum: 1 },
        oldestIssuedAt: { $min: '$soldAt' },
      },
    },
  ]);
  return {
    outstandingBalanceCents: agg ? agg.outstandingBalanceCents : 0,
    cardCount: agg ? agg.cardCount : 0,
    oldestIssuedAt: agg ? agg.oldestIssuedAt : null,
  };
}

module.exports = {
  Query: {
    // "Anyone with the code" is the actual security boundary here, the same way it is for a real
    // gift card at a register - M6's whole reason for a random code over a hash is that knowing
    // the code is supposed to be sufficient. The ARTIST-or-better floor below is defense in depth
    // on top of that, not the boundary itself: it keeps a plain client account from being able to
    // probe codes at volume, nothing more.
    getGiftCardByCode: withAuth(async (_, { code }) => {
      return GiftCard.findOne({ codeNormalized: normalizeGiftCardCode(code) });
    }, Constants.ROLES.ARTIST),

    getGiftCardsByShop: withAuth(async (_, { shopId }, context, info, user) => {
      await assertCanAccessShop(user, shopId);
      return GiftCard.find({ shopId }).sort({ soldAt: -1 });
    }),

    getMyGiftCards: withAuth(async (_, __, context, info, user) => {
      return GiftCard.find({ issuerArtistId: user.id }).sort({ soldAt: -1 });
    }),

    getGiftCardRedemptions: withAuth(async (_, { giftCardId }, context, info, user) => {
      const giftCard = await GiftCard.findById(giftCardId);
      if (!giftCard) {
        throw new UserInputError('Errors', { errors: { giftCardId: 'Gift card not found' } });
      }
      // Readable by whoever could reasonably need to ask "what happened to this card's balance":
      // the artist who issued it, or a shop admin at the shop it's scoped to.
      const isIssuer =
        giftCard.issuerArtistId && String(user.id) === String(giftCard.issuerArtistId);
      if (!isIssuer) {
        if (!giftCard.shopId) {
          throw new AuthenticationError('Action not allowed');
        }
        await assertCanAccessShop(user, giftCard.shopId);
      }
      return GiftCardRedemption.find({ giftCardId }).sort({ redeemedAt: -1 });
    }),

    getGiftCardLiabilityReport: withAuth(async (_, { shopId }, context, info, user) => {
      await assertCanAccessShop(user, shopId);
      return giftCardLiabilityReport({ shopId });
    }),

    getMyGiftCardLiabilityReport: withAuth(async (_, __, context, info, user) => {
      return giftCardLiabilityReport({ issuerArtistId: user.id });
    }),
  },

  Mutation: {
    /**
     * Sold by one artist, for that artist alone (M6). issuerArtistId/soldByUserId are always the
     * caller - there is no argument for either, the same "can only ever act for the caller"
     * convention getMySquareAuthorizationUrl already uses, because nothing legitimate lets one
     * person sell a card attributed to somebody else.
     */
    createArtistGiftCard: withAuth(async (_, { input }, context, info, user) => {
      try {
        const { valid, errors, data } = validate(createArtistGiftCardInputSchema, input);
        if (!valid) {
          throw new UserInputError('Errors', { errors });
        }
        // withAuth's role floor (ARTIST-or-better numerically) lets SHOP_STAFF through too, who
        // may have no Artist profile at all - checked here rather than trusted from the role,
        // since "sold by one artist" is a fact about a real Artist row, not a role number.
        const isArtist = await Artist.exists({ userId: user.id });
        if (!isArtist) {
          throw new AuthenticationError('Only an artist can sell their own gift card.');
        }

        const shopId = await getActiveShopIdForArtist(user.id);

        // Priced the SAME SHAPE as a deposit charge (M11) but with tax deliberately zeroed rather
        // than resolved (M6/M8) - selling a card isn't a taxable event, nothing was delivered.
        const settings = await resolveSquareSettings(user.id);
        const breakdown = computeChargeBreakdown({
          subtotalCents: data.faceValueCents,
          hourlyRateCents: settings.hourlyRateCents,
          feeOffsetPerHourCents: settings.feeOffsetCents,
          taxRateBasisPoints: 0,
          applyFeeOffset: Boolean(data.applyFeeOffset),
        });

        const giftCard = new GiftCard({
          code: await generateUniqueGiftCardCode(),
          issuerType: 'ARTIST',
          issuerArtistId: user.id,
          shopId,
          faceValueCents: data.faceValueCents,
          // Full face value, regardless of the offset taken - M6: "does not load onto the
          // balance ... the client bought a $200 card and holds $200 of credit, whatever the sale
          // totalled."
          balanceCents: data.faceValueCents,
          feeOffsetCents: breakdown.feeOffsetCents,
          soldByUserId: user.id,
        });

        // The shop's cut is taken AT THE SALE, exactly as if this were a deposit (M3/M6) - via
        // applyShopCut against a synthetic sale-shaped object. See buildSyntheticGiftCardSale's
        // own comment for why a synthetic object rather than a change to applyShopCut itself.
        const synthetic = await applyShopCut(buildSyntheticGiftCardSale(giftCard));
        giftCard.shopCutCents = synthetic.shopCutCents;
        giftCard.shopCutPercentApplied = synthetic.shopCutPercentApplied;
        giftCard.shopCutStatus = synthetic.shopCutStatus;

        await giftCard.save();

        await recordEvent({
          entityType: 'GiftCard',
          entityId: giftCard._id,
          action: 'create',
          actorUserId: user.id,
          shopId: giftCard.shopId,
          summary: `Sold a ${formatCents(giftCard.faceValueCents)} artist-issued gift card`,
        });

        return giftCard;
      } catch (err) {
        rethrow(err);
      }
    }, Constants.ROLES.ARTIST),

    /**
     * Sold as a shop product (M6) - always by a shop admin, always at 100% of face value owed to
     * the shop, never the admin's own artist rate. SHOP_ADMIN-only floor, deliberately left bare
     * rather than moved onto hasAdminAuthority: this is genuinely shop-level (there is no
     * independent-artist equivalent of "the shop's own product"), matching S2's own list of
     * mutations that keep the bare floor (createStaffAccount, updateShop, confirmShopCutPaid).
     */
    createShopGiftCard: withAuth(async (_, { input }, context, info, user) => {
      try {
        const { valid, errors, data } = validate(createShopGiftCardInputSchema, input);
        if (!valid) {
          throw new UserInputError('Errors', { errors });
        }
        await assertCanAccessShop(user, data.shopId);

        const settings = await resolveSquareSettings(user.id);
        const breakdown = computeChargeBreakdown({
          subtotalCents: data.faceValueCents,
          hourlyRateCents: settings.hourlyRateCents,
          feeOffsetPerHourCents: settings.feeOffsetCents,
          taxRateBasisPoints: 0,
          applyFeeOffset: Boolean(data.applyFeeOffset),
        });

        const giftCard = new GiftCard({
          code: await generateUniqueGiftCardCode(),
          issuerType: 'SHOP',
          shopId: data.shopId,
          faceValueCents: data.faceValueCents,
          balanceCents: data.faceValueCents,
          feeOffsetCents: breakdown.feeOffsetCents,
          soldByUserId: user.id,
          // None of it is the admin's revenue - full face value, at 100%, owed to the shop (M6,
          // verbatim: "rather than whatever the admin's own artist rate happens to be").
          shopCutCents: data.faceValueCents,
          shopCutPercentApplied: 100,
          shopCutStatus: 'unpaid',
        });
        await giftCard.save();

        await recordEvent({
          entityType: 'GiftCard',
          entityId: giftCard._id,
          action: 'create',
          actorUserId: user.id,
          shopId: giftCard.shopId,
          summary: `Sold a ${formatCents(giftCard.faceValueCents)} shop-issued gift card`,
        });

        return giftCard;
      } catch (err) {
        rethrow(err);
      }
    }, Constants.ROLES.SHOP_ADMIN),

    /**
     * Spends (part of) a gift card against a session. The issuer lock is the load-bearing check
     * here - M6, quoted exactly: an artist-issued card is "locked to them at redemption - no
     * other artist at the shop, and the shop itself, will honour it. ... a redemption attempt
     * against any other artist's session is refused outright, not silently allowed."
     */
    redeemGiftCard: withAuth(async (_, args, context, info, user) => {
      try {
        const { valid, errors, data } = validate(redeemGiftCardInputSchema, args);
        if (!valid) {
          throw new UserInputError('Errors', { errors });
        }

        const appointment = await Appointment.findById(data.appointmentId);
        if (!appointment) {
          throw new UserInputError('Errors', { errors: { appointmentId: 'Appointment not found' } });
        }
        // Admin, or the appointment's own artist - same ownership shape as recordDeposit/
        // applyDeposit (mutations/deposits.js).
        await assertCanManageArtist(user, appointment.userId);

        const giftCard = await GiftCard.findOne({
          codeNormalized: normalizeGiftCardCode(data.code),
        });
        if (!giftCard) {
          throw new UserInputError('Errors', { errors: { code: 'Gift card not found' } });
        }

        if (data.amountCents > giftCard.balanceCents) {
          throw new UserInputError('Errors', {
            errors: { amountCents: "That is more than the card's remaining balance." },
          });
        }

        if (giftCard.issuerType === 'ARTIST') {
          if (String(appointment.userId) !== String(giftCard.issuerArtistId)) {
            // M6, quoted exactly - "no other artist at the shop, and the shop itself, will
            // honour it." A real rejection, not client-side copy: the check runs regardless of
            // what the UI would have prevented.
            throw new UserInputError('Errors', {
              errors: {
                code:
                  'This gift card is locked to the artist who issued it - no other artist, and not the shop itself, will honour it.',
              },
            });
          }
        } else {
          // SHOP-issued: redeemable against ANY artist's session AT THE SHOP (M6) - not at some
          // other shop, and not against an independent artist's session with no shop at all.
          if (!appointment.shopId || String(appointment.shopId) !== String(giftCard.shopId)) {
            throw new UserInputError('Errors', {
              errors: { code: 'This gift card can only be redeemed at the shop that issued it.' },
            });
          }
        }

        // The M6 payout formula, shop-issued cards only - computed BEFORE any write, using the
        // rate as of the APPOINTMENT'S OWN DATE (M7 forward-only), the same argument applyShopCut
        // itself passes.
        let shopPayoutCents = null;
        if (giftCard.issuerType === 'SHOP') {
          const shopCutPercent = await resolveShopCutPercentAt(
            appointment.userId,
            appointment.shopId,
            appointment.appointmentDate,
          );
          shopPayoutCents = computeShopIssuedGiftCardPayoutCents({
            sessionTotalCents: appointment.subtotalCents || 0,
            shopCutPercent,
            giftCardAppliedCents: data.amountCents,
          });
        }

        giftCard.balanceCents -= data.amountCents;
        await giftCard.save();

        const redemption = await new GiftCardRedemption({
          giftCardId: giftCard._id,
          appointmentId: appointment._id,
          amountCents: data.amountCents,
          redeemedByUserId: user.id,
          shopPayoutCents,
        }).save();

        // Fed into getChargeQuote/the real charge via utils/charge-quote.js's giftCardCents slot.
        appointment.giftCardCreditCents =
          (appointment.giftCardCreditCents || 0) + data.amountCents;
        if (giftCard.issuerType === 'ARTIST') {
          // Only the artist-issued portion excludes itself from the cuttable base - see
          // models/Appointment.js and utils/shop-cut.js's own comments on why a shop-issued
          // card's applied amount must NOT also land here.
          appointment.artistIssuedGiftCardCreditCents =
            (appointment.artistIssuedGiftCardCreditCents || 0) + data.amountCents;
        }
        // Always recompute the session's OWN cut here, not just for an artist-issued card. This
        // used to run only inside the ARTIST branch above, on the mistaken assumption that a
        // shop-issued redemption had nothing left for applyShopCut to do since it doesn't touch
        // the cuttable base. True of the AMOUNT, but not of whether the cut has been assessed at
        // all - applyShopCut is what actually WRITES shopCutCents/shopCutStatus onto this
        // appointment, and nothing else in this mutation did that for a shop-issued redemption,
        // which is why it came back 0 instead of the session's real cut. shopPayoutCents above
        // (the shop-vs-artist net on the card itself, M6's own formula) is entirely separate from
        // this - the session still owes its ordinary cut on the full subtotal regardless of which
        // kind of card paid part of it, and this is what actually writes that. applyShopCut
        // itself refuses to move a cut whose invoice is already out (see its own comment on
        // settledStatuses), so a session already settled stays as it was - a pre-existing rule
        // this redemption doesn't change.
        await applyShopCut(appointment);
        await appointment.save();

        await recordEvent({
          entityType: 'GiftCard',
          entityId: giftCard._id,
          action: 'update',
          actorUserId: user.id,
          shopId: giftCard.shopId,
          summary: `Redeemed ${formatCents(data.amountCents)} of a gift card against a session`,
          changes: [{ field: 'balanceCents', from: giftCard.balanceCents + data.amountCents, to: giftCard.balanceCents }],
        });

        return { giftCard, appointment, redemption };
      } catch (err) {
        rethrow(err);
      }
    }),

    /**
     * Mirrors createShopCutInvoice (mutations/shopCutPayments.js) exactly, for a GiftCard's shop
     * cut instead of an Appointment's - see models/GiftCard.js's own comment on why the same
     * field shape lets the same dual-control mechanism apply to both. Billed to soldByUserId, not
     * issuerArtistId: for a SHOP-issued card those differ (soldByUserId is whichever admin rang
     * it up), and it is genuinely the seller who owes this, since it was their Square account
     * that took the client's payment (M9).
     */
    createGiftCardShopCutInvoice: withAuth(async (_, args, context, info, user) => {
      try {
        const { valid, errors, data } = validate(createGiftCardShopCutInvoiceInputSchema, args);
        if (!valid) {
          throw new UserInputError('Errors', { errors });
        }
        const giftCard = await GiftCard.findById(data.giftCardId);
        if (!giftCard) {
          throw new UserInputError('Errors', { errors: { giftCardId: 'Gift card not found' } });
        }
        if (String(user.id) !== String(giftCard.soldByUserId)) {
          throw new AuthenticationError('Only the person who sold this gift card can invoice its shop cut.');
        }
        if (!giftCard.shopId) {
          throw new UserInputError('Errors', { errors: { giftCardId: 'This gift card has no shop attached.' } });
        }
        if (!giftCard.shopCutCents || giftCard.shopCutCents <= 0) {
          throw new UserInputError('Errors', { errors: { giftCardId: 'This gift card has no shop cut amount set.' } });
        }
        if (giftCard.shopCutStatus === 'paid') {
          throw new UserInputError('Errors', { errors: { giftCardId: 'This shop cut has already been paid.' } });
        }
        if (giftCard.shopCutStatus === 'invoice_sent') {
          throw new UserInputError('Errors', { errors: { giftCardId: 'An invoice has already been sent for this shop cut.' } });
        }
        if (giftCard.shopCutStatus === 'pending_confirmation') {
          throw new UserInputError('Errors', {
            errors: { giftCardId: "This shop cut is already marked as paid, awaiting the shop's confirmation." },
          });
        }

        const account = await findAccountForOwner('SHOP', giftCard.shopId);
        if (!SquareAccount.isUsable(account)) {
          throw new UserInputError('Errors', { errors: { giftCardId: 'This shop has not connected a Square account yet.' } });
        }

        const seller = await User.findById(giftCard.soldByUserId);
        if (!seller) {
          throw new UserInputError('Errors', { errors: { giftCardId: 'Seller account not found.' } });
        }

        const paymentMethod = data.paymentMethod || 'ach';
        const targetAmountCents = giftCard.shopCutCents;

        const invoiceResult = await square.createAndPublishShopCutInvoice({
          account,
          artistEmail: seller.email,
          artistFirstName: seller.firstName,
          artistLastName: seller.lastName,
          targetAmountCents,
          description:
            giftCard.issuerType === 'SHOP'
              ? `Gift card ${giftCard.code} - shop product sale`
              : `Gift card ${giftCard.code} - artist-issued shop cut`,
          paymentMethod,
        });

        giftCard.shopCutSquareInvoiceId = invoiceResult.invoiceId;
        giftCard.shopCutStatus = 'invoice_sent';
        giftCard.shopCutPaymentMethod = 'square_invoice';
        await giftCard.save();

        await recordEvent({
          entityType: 'GiftCard',
          entityId: giftCard._id,
          action: 'update',
          actorUserId: user.id,
          shopId: giftCard.shopId,
          summary: `Invoiced ${formatCents(targetAmountCents)} gift card shop cut via Square`,
          changes: [{ field: 'shopCutStatus', from: 'unpaid', to: 'invoice_sent' }],
        });

        return { giftCard, invoiceUrl: invoiceResult.publicUrl };
      } catch (err) {
        rethrow(err);
      }
    }),

    // Mirrors markShopCutPaidManually exactly - see that mutation's own comment on why this does
    // NOT flip straight to 'paid'.
    markGiftCardShopCutPaidManually: withAuth(async (_, args, context, info, user) => {
      try {
        const { valid, errors, data } = validate(giftCardIdInputSchema, args);
        if (!valid) {
          throw new UserInputError('Errors', { errors });
        }
        const giftCard = await GiftCard.findById(data.giftCardId);
        if (!giftCard) {
          throw new UserInputError('Errors', { errors: { giftCardId: 'Gift card not found' } });
        }
        if (String(user.id) !== String(giftCard.soldByUserId)) {
          throw new AuthenticationError('Only the person who sold this gift card can mark it paid.');
        }
        if (!giftCard.shopId) {
          throw new UserInputError('Errors', { errors: { giftCardId: 'This gift card has no shop attached.' } });
        }
        if (giftCard.shopCutStatus === 'paid') {
          throw new UserInputError('Errors', { errors: { giftCardId: 'This shop cut has already been paid.' } });
        }
        if (giftCard.shopCutStatus === 'pending_confirmation') {
          throw new UserInputError('Errors', {
            errors: { giftCardId: "This shop cut is already awaiting the shop's confirmation." },
          });
        }

        giftCard.shopCutStatus = 'pending_confirmation';
        giftCard.shopCutPaymentMethod = 'manual';
        giftCard.shopCutMarkedPaidBy = user.id;
        giftCard.shopCutMarkedPaidAt = new Date();
        await giftCard.save();

        await recordEvent({
          entityType: 'GiftCard',
          entityId: giftCard._id,
          action: 'update',
          actorUserId: user.id,
          shopId: giftCard.shopId,
          summary: `Marked ${formatCents(giftCard.shopCutCents)} gift card shop cut paid manually`,
          changes: [{ field: 'shopCutStatus', from: 'unpaid', to: 'pending_confirmation' }],
        });

        return giftCard;
      } catch (err) {
        rethrow(err);
      }
    }),

    // Mirrors confirmShopCutPaid exactly - the shop's independent half of the dual-control
    // design, same SHOP_ADMIN floor for the same reason.
    confirmGiftCardShopCutPaid: withAuth(async (_, args, context, info, user) => {
      try {
        const { valid, errors, data } = validate(giftCardIdInputSchema, args);
        if (!valid) {
          throw new UserInputError('Errors', { errors });
        }
        const giftCard = await GiftCard.findById(data.giftCardId);
        if (!giftCard) {
          throw new UserInputError('Errors', { errors: { giftCardId: 'Gift card not found' } });
        }
        await assertCanAccessShop(user, giftCard.shopId);
        if (giftCard.shopCutStatus !== 'pending_confirmation') {
          throw new UserInputError('Errors', {
            errors: { giftCardId: 'This shop cut is not awaiting confirmation.' },
          });
        }

        giftCard.shopCutStatus = 'paid';
        giftCard.shopCutConfirmedBy = user.id;
        giftCard.shopCutConfirmedAt = new Date();
        await giftCard.save();

        await recordEvent({
          entityType: 'GiftCard',
          entityId: giftCard._id,
          action: 'update',
          actorUserId: user.id,
          shopId: giftCard.shopId,
          summary: `Confirmed ${formatCents(giftCard.shopCutCents)} gift card shop cut received`,
          changes: [{ field: 'shopCutStatus', from: 'pending_confirmation', to: 'paid' }],
        });

        return giftCard;
      } catch (err) {
        rethrow(err);
      }
    }, Constants.ROLES.SHOP_ADMIN),
  },
};
