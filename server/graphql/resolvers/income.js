const IncomeType = require('../../models/IncomeType');
const Income = require('../../models/Income');
const withAuth = require('../../utils/with-auth');
const { UserInputError } = require('../../utils/errors');
const { paginate } = require('../../utils/pagination');
const {
  resolveBusinessOwner,
  assertCanManageBusinessRecord,
} = require('../../utils/shop-membership');
const { recordEvent } = require('../../utils/event-log');
const {
  createIncomeTypeInputSchema,
  updateIncomeTypeInputSchema,
  recordIncomeInputSchema,
  updateIncomeInputSchema,
  validate,
} = require('../../utils/validation');

/**
 * Non-tattoo income and income types - the income-side mirror of resolvers/expenses.js. See that
 * file's own header for the shared authorization shape (resolveBusinessOwner on create,
 * assertCanManageBusinessRecord on everything else) and models/Income.js / models/IncomeType.js
 * for what these rows are for.
 */

function requireOneOwnerArg(shopId, artistUserId) {
  if (!shopId && !artistUserId) {
    throw new UserInputError('Errors', {
      errors: { shopId: 'Provide a shopId or an artistUserId' },
    });
  }
  if (shopId && artistUserId) {
    throw new UserInputError('Errors', {
      errors: { shopId: 'Provide only one of shopId or artistUserId, not both' },
    });
  }
}

async function assertTypeBelongsToOwner(incomeTypeId, owner) {
  const type = await IncomeType.findById(incomeTypeId);
  if (!type) {
    throw new UserInputError('Errors', { errors: { incomeTypeId: 'Income type not found' } });
  }
  const sameShop = owner.shopId && String(type.shopId) === String(owner.shopId);
  const sameArtist = owner.artistUserId && String(type.artistUserId) === String(owner.artistUserId);
  if (!sameShop && !sameArtist) {
    throw new UserInputError('Errors', {
      errors: { incomeTypeId: 'That income type does not belong to this scope' },
    });
  }
  return type;
}

module.exports = {
  Query: {
    getIncomeTypes: withAuth(
      async (_, { shopId, artistUserId, includeInactive }, context, info, user) => {
        requireOneOwnerArg(shopId, artistUserId);
        await assertCanManageBusinessRecord(user, { shopId, artistUserId });
        const filter = shopId ? { shopId } : { artistUserId };
        if (!includeInactive) {
          filter.active = true;
        }
        return IncomeType.find(filter).sort({ name: 1 });
      },
    ),

    getIncomes: withAuth(
      async (_, { shopId, artistUserId, start, end, page }, context, info, user) => {
        requireOneOwnerArg(shopId, artistUserId);
        await assertCanManageBusinessRecord(user, { shopId, artistUserId });
        const filter = shopId ? { shopId } : { artistUserId };
        if (start || end) {
          filter.date = {};
          if (start) filter.date.$gte = new Date(start);
          if (end) filter.date.$lt = new Date(end);
        }
        return paginate(Income, filter, { sort: { date: -1 }, page });
      },
    ),
  },

  Mutation: {
    createIncomeType: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(createIncomeTypeInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const owner = await resolveBusinessOwner(user, input.shopId);
      try {
        const type = await new IncomeType({
          ...owner,
          name: input.name,
          description: input.description || '',
        }).save();
        await recordEvent({
          entityType: 'IncomeType',
          entityId: type._id,
          action: 'create',
          actorUserId: user.id,
          shopId: owner.shopId,
          summary: `Added income category "${type.name}"`,
        });
        return type;
      } catch (err) {
        if (err && err.code === 11000) {
          throw new UserInputError('Errors', {
            errors: { name: 'A category with this name already exists' },
          });
        }
        throw err;
      }
    }),

    updateIncomeType: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(updateIncomeTypeInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const type = await IncomeType.findById(input.incomeTypeId);
      if (!type) {
        throw new UserInputError('Errors', { errors: { incomeTypeId: 'Income type not found' } });
      }
      await assertCanManageBusinessRecord(user, { shopId: type.shopId, artistUserId: type.artistUserId });
      if (input.name !== undefined && input.name !== null) type.name = input.name;
      if (input.description !== undefined) type.description = input.description || '';
      if (input.active !== undefined && input.active !== null) type.active = input.active;
      try {
        await type.save();
      } catch (err) {
        if (err && err.code === 11000) {
          throw new UserInputError('Errors', {
            errors: { name: 'A category with this name already exists' },
          });
        }
        throw err;
      }
      return type;
    }),

    recordIncome: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(recordIncomeInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const owner = await resolveBusinessOwner(user, input.shopId);
      await assertTypeBelongsToOwner(input.incomeTypeId, owner);
      const income = await new Income({
        ...owner,
        incomeTypeId: input.incomeTypeId,
        amountCents: input.amountCents,
        description: input.description || '',
        date: new Date(input.date),
        createdByUserId: user.id,
      }).save();
      await recordEvent({
        entityType: 'Income',
        entityId: income._id,
        action: 'create',
        actorUserId: user.id,
        shopId: owner.shopId,
        summary: `Logged a $${(input.amountCents / 100).toFixed(2)} non-tattoo income entry`,
      });
      return income;
    }),

    updateIncome: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(updateIncomeInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const income = await Income.findById(input.incomeId);
      if (!income) {
        throw new UserInputError('Errors', { errors: { incomeId: 'Income entry not found' } });
      }
      const owner = { shopId: income.shopId, artistUserId: income.artistUserId };
      await assertCanManageBusinessRecord(user, owner);
      if (input.incomeTypeId) {
        await assertTypeBelongsToOwner(input.incomeTypeId, owner);
        income.incomeTypeId = input.incomeTypeId;
      }
      if (input.amountCents !== undefined && input.amountCents !== null) {
        income.amountCents = input.amountCents;
      }
      if (input.description !== undefined) income.description = input.description || '';
      if (input.date) income.date = new Date(input.date);
      await income.save();
      await recordEvent({
        entityType: 'Income',
        entityId: income._id,
        action: 'update',
        actorUserId: user.id,
        shopId: owner.shopId,
        summary: 'Edited a non-tattoo income entry',
      });
      return income;
    }),

    deleteIncome: withAuth(async (_, { incomeId }, context, info, user) => {
      const income = await Income.findById(incomeId);
      if (!income) {
        return true;
      }
      await assertCanManageBusinessRecord(user, {
        shopId: income.shopId,
        artistUserId: income.artistUserId,
      });
      await Income.deleteOne({ _id: incomeId });
      await recordEvent({
        entityType: 'Income',
        entityId: income._id,
        action: 'delete',
        actorUserId: user.id,
        shopId: income.shopId,
        summary: 'Deleted a non-tattoo income entry',
      });
      return true;
    }),
  },
};
