import { gql, useQuery } from "@apollo/client";

/**
 * Expense types, expenses, and recurring expenses - see server/graphql/typeDefs.js's own header
 * on this whole feature for the ownership model every query/mutation here follows: exactly one of
 * `shopId`/`artistUserId` scopes every call, and the server re-checks the caller against it every
 * time (utils/shop-membership.js's assertCanManageBusinessRecord). Callers of this service pass
 * the scope explicitly rather than this file guessing it - see components/settings/
 * ExpenseTypesPanel.jsx for how a panel decides which one to send.
 */
const ExpenseService = (() => {
	const _EXPENSE_TYPE_FIELDS = `
		id
		shopId
		artistUserId
		name
		description
		active
		createdAt
	`;

	const _FETCH_EXPENSE_TYPES = gql`
		query GetExpenseTypes($shopId: ID, $artistUserId: ID, $includeInactive: Boolean) {
			getExpenseTypes(shopId: $shopId, artistUserId: $artistUserId, includeInactive: $includeInactive) {
				${_EXPENSE_TYPE_FIELDS}
			}
		}
	`;
	const _getExpenseTypes = (scope, includeInactive = false, options = {}) => {
		return useQuery(_FETCH_EXPENSE_TYPES, {
			variables: { ...scope, includeInactive },
			skip: !scope?.shopId && !scope?.artistUserId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _CREATE_EXPENSE_TYPE = gql`
		mutation CreateExpenseType($input: CreateExpenseTypeInput!) {
			createExpenseType(input: $input) {
				${_EXPENSE_TYPE_FIELDS}
			}
		}
	`;
	const _UPDATE_EXPENSE_TYPE = gql`
		mutation UpdateExpenseType($input: UpdateExpenseTypeInput!) {
			updateExpenseType(input: $input) {
				${_EXPENSE_TYPE_FIELDS}
			}
		}
	`;

	const _EXPENSE_FIELDS = `
		id
		shopId
		artistUserId
		expenseTypeId
		expenseType {
			id
			name
		}
		amountCents
		description
		date
		recurringExpenseId
		createdAt
		createdBy {
			id
			firstName
			lastName
		}
	`;

	const _FETCH_EXPENSES = gql`
		query GetExpenses(
			$shopId: ID
			$artistUserId: ID
			$start: DateTime
			$end: DateTime
			$page: PageInput
		) {
			getExpenses(shopId: $shopId, artistUserId: $artistUserId, start: $start, end: $end, page: $page) {
				items {
					${_EXPENSE_FIELDS}
				}
				pageInfo { totalCount hasMore limit offset }
			}
		}
	`;
	const _getExpenses = (scope, range, page, options = {}) => {
		return useQuery(_FETCH_EXPENSES, {
			variables: { ...scope, start: range?.start, end: range?.end, page },
			skip: !scope?.shopId && !scope?.artistUserId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _RECORD_EXPENSE = gql`
		mutation RecordExpense($input: RecordExpenseInput!) {
			recordExpense(input: $input) {
				${_EXPENSE_FIELDS}
			}
		}
	`;
	const _UPDATE_EXPENSE = gql`
		mutation UpdateExpense($input: UpdateExpenseInput!) {
			updateExpense(input: $input) {
				${_EXPENSE_FIELDS}
			}
		}
	`;
	const _DELETE_EXPENSE = gql`
		mutation DeleteExpense($expenseId: ID!) {
			deleteExpense(expenseId: $expenseId)
		}
	`;

	const _RECURRING_EXPENSE_FIELDS = `
		id
		shopId
		artistUserId
		expenseTypeId
		expenseType {
			id
			name
		}
		amountCents
		description
		frequency
		startDate
		nextRunDate
		endDate
		active
		createdAt
	`;

	const _FETCH_RECURRING_EXPENSES = gql`
		query GetRecurringExpenses($shopId: ID, $artistUserId: ID, $includeInactive: Boolean) {
			getRecurringExpenses(shopId: $shopId, artistUserId: $artistUserId, includeInactive: $includeInactive) {
				${_RECURRING_EXPENSE_FIELDS}
			}
		}
	`;
	const _getRecurringExpenses = (scope, includeInactive = false, options = {}) => {
		return useQuery(_FETCH_RECURRING_EXPENSES, {
			variables: { ...scope, includeInactive },
			skip: !scope?.shopId && !scope?.artistUserId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _CREATE_RECURRING_EXPENSE = gql`
		mutation CreateRecurringExpense($input: CreateRecurringExpenseInput!) {
			createRecurringExpense(input: $input) {
				${_RECURRING_EXPENSE_FIELDS}
			}
		}
	`;
	const _UPDATE_RECURRING_EXPENSE = gql`
		mutation UpdateRecurringExpense($input: UpdateRecurringExpenseInput!) {
			updateRecurringExpense(input: $input) {
				${_RECURRING_EXPENSE_FIELDS}
			}
		}
	`;
	const _DELETE_RECURRING_EXPENSE = gql`
		mutation DeleteRecurringExpense($recurringExpenseId: ID!) {
			deleteRecurringExpense(recurringExpenseId: $recurringExpenseId)
		}
	`;

	return {
		getExpenseTypes: _getExpenseTypes,
		CREATE_EXPENSE_TYPE: _CREATE_EXPENSE_TYPE,
		UPDATE_EXPENSE_TYPE: _UPDATE_EXPENSE_TYPE,
		FETCH_EXPENSE_TYPES: _FETCH_EXPENSE_TYPES,
		getExpenses: _getExpenses,
		FETCH_EXPENSES: _FETCH_EXPENSES,
		RECORD_EXPENSE: _RECORD_EXPENSE,
		UPDATE_EXPENSE: _UPDATE_EXPENSE,
		DELETE_EXPENSE: _DELETE_EXPENSE,
		getRecurringExpenses: _getRecurringExpenses,
		FETCH_RECURRING_EXPENSES: _FETCH_RECURRING_EXPENSES,
		CREATE_RECURRING_EXPENSE: _CREATE_RECURRING_EXPENSE,
		UPDATE_RECURRING_EXPENSE: _UPDATE_RECURRING_EXPENSE,
		DELETE_RECURRING_EXPENSE: _DELETE_RECURRING_EXPENSE,
	};
})();

export default ExpenseService;
