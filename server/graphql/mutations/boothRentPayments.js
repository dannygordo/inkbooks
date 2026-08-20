const BoothRentCharge = require('../../models/BoothRentCharge');
const Shop = require('../../models/Shop');
const Expense = require('../../models/Expense');
const Income = require('../../models/Income');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const { assertCanAccessShop } = require('../../utils/shop-membership');
const { notifySafely } = require('../../utils/notifications');
const { shopAdminUserIds } = require('../../utils/notification-audience');
const { actorName } = require('../../utils/notification-copy');
const { formatCents } = require('../../utils/money');
const { recordEvent } = require('../../utils/event-log');
const {
  findOrCreateBoothRentExpenseType,
  findOrCreateBoothRentIncomeType,
} = require('../../utils/booth-rent');
const { boothRentChargeIdInputSchema, validate } = require('../../utils/validation');

/**
 * The booth-rent payment lifecycle - due -> marked_paid -> confirmed, the direct structural
 * mirror of mutations/shopCutPayments.js's markShopCutPaidManually/confirmShopCutPaid (see that
 * file's own header comment on the dual-control reasoning: an artist's own claim of "I paid" is
 * not enough, the shop confirms independently before the ledger counts it as settled).
 */
module.exports = {
  // The artist's own claim that they paid this month's rent - deliberately does NOT flip status
  // straight to 'confirmed'. See confirmBoothRentPaid below, the shop's independent half.
  markBoothRentPaidManually: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(boothRentChargeIdInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    const charge = await BoothRentCharge.findById(data.boothRentChargeId);
    if (!charge) {
      throw new UserInputError('Errors', { errors: { boothRentChargeId: 'Charge not found' } });
    }
    if (String(user.id) !== String(charge.artistId)) {
      throw new AuthenticationError('Only the artist this charge belongs to can mark it paid.');
    }
    if (charge.status === 'confirmed') {
      throw new UserInputError('Errors', {
        errors: { boothRentChargeId: 'This charge has already been confirmed paid.' },
      });
    }
    if (charge.status === 'marked_paid') {
      throw new UserInputError('Errors', {
        errors: { boothRentChargeId: "This charge is already awaiting the shop's confirmation." },
      });
    }

    const previousStatus = charge.status;
    charge.status = 'marked_paid';
    charge.markedPaidAt = new Date();
    charge.markedPaidByUserId = user.id;
    await charge.save();

    await recordEvent({
      entityType: 'BoothRentCharge',
      entityId: charge._id,
      action: 'update',
      actorUserId: user.id,
      shopId: charge.shopId,
      summary: `Marked ${formatCents(charge.amountCents)} booth rent paid manually`,
      changes: [{ field: 'status', from: previousStatus, to: 'marked_paid' }],
    });

    // Needs the shop's action, so it goes to the people who can take it - the same "who can act"
    // audience shopCutPayments.js's own markShopCutPaidManually notifies.
    await notifySafely({
      actorId: user.id,
      recipientIds: await shopAdminUserIds(charge.shopId),
      type: 'booth_rent_marked_paid',
      category: 'money',
      subjectType: 'boothRentCharge',
      subjectId: charge._id,
      amountCents: charge.amountCents,
      title: `${await actorName(user.id)} marked ${formatCents(charge.amountCents)} booth rent paid`,
      body: 'Waiting on your confirmation before it counts as settled.',
    });

    return charge;
  }),

  // The shop's independent confirmation - the other half of the dual-control design. Shop admin
  // AND at this charge's shop: the role says they're senior enough to confirm a payment,
  // assertCanAccessShop says it's their shop's money.
  confirmBoothRentPaid: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(boothRentChargeIdInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    const charge = await BoothRentCharge.findById(data.boothRentChargeId);
    if (!charge) {
      throw new UserInputError('Errors', { errors: { boothRentChargeId: 'Charge not found' } });
    }
    await assertCanAccessShop(user, charge.shopId);
    if (charge.status !== 'marked_paid') {
      throw new UserInputError('Errors', {
        errors: { boothRentChargeId: 'This charge is not awaiting confirmation.' },
      });
    }

    // The real ledger rows - artist-owned Expense (rent, an expense of theirs) and shop-owned
    // Income (rent collected, income of theirs). Generated ONLY here, at confirmation - an
    // invoiced-but-unconfirmed charge isn't real revenue yet, the same timing rule applyShopCut's
    // own ledger already follows for the percentage side.
    const [expenseType, incomeType] = await Promise.all([
      findOrCreateBoothRentExpenseType(charge.artistId),
      findOrCreateBoothRentIncomeType(charge.shopId),
    ]);
    const periodLabel = charge.periodMonth.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    const expense = await new Expense({
      artistUserId: charge.artistId,
      shopId: null,
      expenseTypeId: expenseType._id,
      amountCents: charge.amountCents,
      description: `Booth rent - ${periodLabel}`,
      date: charge.dueDate,
      createdByUserId: user.id,
    }).save();

    const income = await new Income({
      shopId: charge.shopId,
      artistUserId: null,
      incomeTypeId: incomeType._id,
      amountCents: charge.amountCents,
      description: `Booth rent - ${periodLabel}`,
      date: charge.dueDate,
      createdByUserId: user.id,
    }).save();

    charge.status = 'confirmed';
    charge.confirmedAt = new Date();
    charge.confirmedByUserId = user.id;
    charge.expenseId = expense._id;
    charge.incomeId = income._id;
    await charge.save();

    await recordEvent({
      entityType: 'BoothRentCharge',
      entityId: charge._id,
      action: 'update',
      actorUserId: user.id,
      shopId: charge.shopId,
      summary: `Confirmed ${formatCents(charge.amountCents)} booth rent received`,
      changes: [{ field: 'status', from: 'marked_paid', to: 'confirmed' }],
    });

    const shop = await Shop.findById(charge.shopId);
    // The other direction, and the reverse audience - the admin confirming is the actor, the
    // artist is the one who has been waiting to hear their payment landed.
    await notifySafely({
      actorId: user.id,
      recipientIds: [charge.artistId],
      type: 'booth_rent_confirmed',
      category: 'money',
      subjectType: 'boothRentCharge',
      subjectId: charge._id,
      amountCents: charge.amountCents,
      title: `${shop ? shop.name : 'Your shop'} confirmed your ${formatCents(charge.amountCents)} booth rent`,
      body: 'Settled - nothing further owed for this month.',
    });

    return charge;
  }, Constants.ROLES.SHOP_ADMIN),
};
