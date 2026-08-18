const ExpenseType = require('../../models/ExpenseType');
const Expense = require('../../models/Expense');
const RecurringExpense = require('../../models/RecurringExpense');
const withAuth = require('../../utils/with-auth');
const { UserInputError } = require('../../utils/errors');
const { paginate } = require('../../utils/pagination');
const {
  resolveBusinessOwner,
  assertCanManageBusinessRecord,
} = require('../../utils/shop-membership');
const { recordEvent } = require('../../utils/event-log');
const {
  createExpenseTypeInputSchema,
  updateExpenseTypeInputSchema,
  recordExpenseInputSchema,
  updateExpenseInputSchema,
  createRecurringExpenseInputSchema,
  updateRecurringExpenseInputSchema,
  validate,
} = require('../../utils/validation');

/**
 * Expenses, expense types, and recurring expenses - see typeDefs.js's own header comment on this
 * whole section and models/Expense.js / models/ExpenseType.js / models/RecurringExpense.js for
 * the shapes. Every function here follows the same two-step authorization shape:
 *
 *   CREATE - resolveBusinessOwner(user, input.shopId) decides and validates the owner in one call.
 *   READ/UPDATE/DELETE - the row (or the shopId/artistUserId args, for a list) already says whose
 *   it is; assertCanManageBusinessRecord re-checks the caller against THAT owner, every time.
 *
 * Neither function is reimplemented per mutation - see utils/shop-membership.js.
 */

// A read scoped by neither shopId nor artistUserId, or by both at once, isn't a real question -
// see typeDefs.js's own note that exactly one is required.
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

// Refuses attaching a row to a type owned by someone else's scope - the only thing standing
// between "pick a category" and "guess another shop's private ExpenseType id and log against it".
async function assertTypeBelongsToOwner(expenseTypeId, owner) {
  const type = await ExpenseType.findById(expenseTypeId);
  if (!type) {
    throw new UserInputError('Errors', { errors: { expenseTypeId: 'Expense type not found' } });
  }
  const sameShop = owner.shopId && String(type.shopId) === String(owner.shopId);
  const sameArtist = owner.artistUserId && String(type.artistUserId) === String(owner.artistUserId);
  if (!sameShop && !sameArtist) {
    throw new UserInputError('Errors', {
      errors: { expenseTypeId: 'That expense type does not belong to this scope' },
    });
  }
  return type;
}

module.exports = {
  Query: {
    getExpenseTypes: withAuth(
      async (_, { shopId, artistUserId, includeInactive }, context, info, user) => {
        requireOneOwnerArg(shopId, artistUserId);
        await assertCanManageBusinessRecord(user, { shopId, artistUserId });
        const filter = shopId ? { shopId } : { artistUserId };
        if (!includeInactive) {
          filter.active = true;
        }
        return ExpenseType.find(filter).sort({ name: 1 });
      },
    ),

    getExpenses: withAuth(
      async (_, { shopId, artistUserId, start, end, page }, context, info, user) => {
        requireOneOwnerArg(shopId, artistUserId);
        await assertCanManageBusinessRecord(user, { shopId, artistUserId });
        const filter = shopId ? { shopId } : { artistUserId };
        if (start || end) {
          filter.date = {};
          if (start) filter.date.$gte = new Date(start);
          if (end) filter.date.$lt = new Date(end);
        }
        return paginate(Expense, filter, { sort: { date: -1 }, page });
      },
    ),

    getRecurringExpenses: withAuth(
      async (_, { shopId, artistUserId, includeInactive }, context, info, user) => {
        requireOneOwnerArg(shopId, artistUserId);
        await assertCanManageBusinessRecord(user, { shopId, artistUserId });
        const filter = shopId ? { shopId } : { artistUserId };
        if (!includeInactive) {
          filter.active = true;
        }
        return RecurringExpense.find(filter).sort({ nextRunDate: 1 });
      },
    ),
  },

  Mutation: {
    createExpenseType: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(createExpenseTypeInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const owner = await resolveBusinessOwner(user, input.shopId);
      try {
        const type = await new ExpenseType({
          ...owner,
          name: input.name,
          description: input.description || '',
        }).save();
        await recordEvent({
          entityType: 'ExpenseType',
          entityId: type._id,
          action: 'create',
          actorUserId: user.id,
          shopId: owner.shopId,
          summary: `Added expense category "${type.name}"`,
        });
        return type;
      } catch (err) {
        // The partial unique index on {shopId|artistUserId, name} - see models/ExpenseType.js.
        if (err && err.code === 11000) {
          throw new UserInputError('Errors', {
            errors: { name: 'A category with this name already exists' },
          });
        }
        throw err;
      }
    }),

    updateExpenseType: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(updateExpenseTypeInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const type = await ExpenseType.findById(input.expenseTypeId);
      if (!type) {
        throw new UserInputError('Errors', { errors: { expenseTypeId: 'Expense type not found' } });
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

    recordExpense: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(recordExpenseInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const owner = await resolveBusinessOwner(user, input.shopId);
      await assertTypeBelongsToOwner(input.expenseTypeId, owner);
      const expense = await new Expense({
        ...owner,
        expenseTypeId: input.expenseTypeId,
        amountCents: input.amountCents,
        description: input.description || '',
        date: new Date(input.date),
        createdByUserId: user.id,
      }).save();
      await recordEvent({
        entityType: 'Expense',
        entityId: expense._id,
        action: 'create',
        actorUserId: user.id,
        shopId: owner.shopId,
        summary: `Logged a $${(input.amountCents / 100).toFixed(2)} expense`,
      });
      return expense;
    }),

    updateExpense: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(updateExpenseInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const expense = await Expense.findById(input.expenseId);
      if (!expense) {
        throw new UserInputError('Errors', { errors: { expenseId: 'Expense not found' } });
      }
      const owner = { shopId: expense.shopId, artistUserId: expense.artistUserId };
      await assertCanManageBusinessRecord(user, owner);
      if (input.expenseTypeId) {
        await assertTypeBelongsToOwner(input.expenseTypeId, owner);
        expense.expenseTypeId = input.expenseTypeId;
      }
      if (input.amountCents !== undefined && input.amountCents !== null) {
        expense.amountCents = input.amountCents;
      }
      if (input.description !== undefined) expense.description = input.description || '';
      if (input.date) expense.date = new Date(input.date);
      await expense.save();
      await recordEvent({
        entityType: 'Expense',
        entityId: expense._id,
        action: 'update',
        actorUserId: user.id,
        shopId: owner.shopId,
        summary: 'Edited an expense entry',
      });
      return expense;
    }),

    deleteExpense: withAuth(async (_, { expenseId }, context, info, user) => {
      const expense = await Expense.findById(expenseId);
      if (!expense) {
        return true;
      }
      await assertCanManageBusinessRecord(user, {
        shopId: expense.shopId,
        artistUserId: expense.artistUserId,
      });
      await Expense.deleteOne({ _id: expenseId });
      await recordEvent({
        entityType: 'Expense',
        entityId: expense._id,
        action: 'delete',
        actorUserId: user.id,
        shopId: expense.shopId,
        summary: 'Deleted an expense entry',
      });
      return true;
    }),

    createRecurringExpense: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(createRecurringExpenseInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const owner = await resolveBusinessOwner(user, input.shopId);
      await assertTypeBelongsToOwner(input.expenseTypeId, owner);
      const startDate = new Date(input.startDate);
      const endDate = input.endDate ? new Date(input.endDate) : null;
      if (endDate && endDate < startDate) {
        throw new UserInputError('Errors', {
          errors: { endDate: 'End date cannot be before the start date' },
        });
      }
      const recurring = await new RecurringExpense({
        ...owner,
        expenseTypeId: input.expenseTypeId,
        amountCents: input.amountCents,
        description: input.description || '',
        frequency: input.frequency,
        startDate,
        // nextRunDate starts equal to startDate - the first occurrence is generated by the
        // scheduler once this is actually due, not written immediately here. See
        // utils/recurring-expenses.js.
        nextRunDate: startDate,
        endDate,
        createdByUserId: user.id,
      }).save();
      await recordEvent({
        entityType: 'RecurringExpense',
        entityId: recurring._id,
        action: 'create',
        actorUserId: user.id,
        shopId: owner.shopId,
        summary: `Set up a recurring ${input.frequency} expense of $${(input.amountCents / 100).toFixed(2)}`,
      });
      return recurring;
    }),

    updateRecurringExpense: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(updateRecurringExpenseInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const recurring = await RecurringExpense.findById(input.recurringExpenseId);
      if (!recurring) {
        throw new UserInputError('Errors', {
          errors: { recurringExpenseId: 'Recurring expense not found' },
        });
      }
      const owner = { shopId: recurring.shopId, artistUserId: recurring.artistUserId };
      await assertCanManageBusinessRecord(user, owner);
      if (input.expenseTypeId) {
        await assertTypeBelongsToOwner(input.expenseTypeId, owner);
        recurring.expenseTypeId = input.expenseTypeId;
      }
      if (input.amountCents !== undefined && input.amountCents !== null) {
        recurring.amountCents = input.amountCents;
      }
      if (input.description !== undefined) recurring.description = input.description || '';
      // Changing frequency does NOT re-anchor nextRunDate - the next occurrence still lands on
      // whatever date was already due, just measured in the new cadence from there on. Re-basing
      // it off "today" instead would silently skip or duplicate whatever was due between the last
      // occurrence and now.
      if (input.frequency) recurring.frequency = input.frequency;
      if (input.endDate !== undefined) {
        recurring.endDate = input.endDate ? new Date(input.endDate) : null;
      }
      if (input.active !== undefined && input.active !== null) {
        recurring.active = input.active;
      }
      await recurring.save();
      await recordEvent({
        entityType: 'RecurringExpense',
        entityId: recurring._id,
        action: 'update',
        actorUserId: user.id,
        shopId: owner.shopId,
        summary: 'Edited a recurring expense',
      });
      return recurring;
    }),

    deleteRecurringExpense: withAuth(async (_, { recurringExpenseId }, context, info, user) => {
      const recurring = await RecurringExpense.findById(recurringExpenseId);
      if (!recurring) {
        return true;
      }
      await assertCanManageBusinessRecord(user, {
        shopId: recurring.shopId,
        artistUserId: recurring.artistUserId,
      });
      // The template only - see typeDefs.js's own comment on deleteRecurringExpense. Every
      // Expense it already generated is a real, independent row and stays exactly where it is.
      await RecurringExpense.deleteOne({ _id: recurringExpenseId });
      await recordEvent({
        entityType: 'RecurringExpense',
        entityId: recurring._id,
        action: 'delete',
        actorUserId: user.id,
        shopId: recurring.shopId,
        summary: 'Deleted a recurring expense',
      });
      return true;
    }),
  },
};
