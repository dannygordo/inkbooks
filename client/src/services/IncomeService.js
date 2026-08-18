import { gql, useQuery } from "@apollo/client";

/**
 * Non-tattoo income types and income entries - the income-side mirror of ExpenseService.js. Same
 * scope-object convention: pass `{ shopId }` or `{ artistUserId }`, never both.
 */
const IncomeService = (() => {
	const _INCOME_TYPE_FIELDS = `
		id
		shopId
		artistUserId
		name
		description
		active
		createdAt
	`;

	const _FETCH_INCOME_TYPES = gql`
		query GetIncomeTypes($shopId: ID, $artistUserId: ID, $includeInactive: Boolean) {
			getIncomeTypes(shopId: $shopId, artistUserId: $artistUserId, includeInactive: $includeInactive) {
				${_INCOME_TYPE_FIELDS}
			}
		}
	`;
	const _getIncomeTypes = (scope, includeInactive = false, options = {}) => {
		return useQuery(_FETCH_INCOME_TYPES, {
			variables: { ...scope, includeInactive },
			skip: !scope?.shopId && !scope?.artistUserId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _CREATE_INCOME_TYPE = gql`
		mutation CreateIncomeType($input: CreateIncomeTypeInput!) {
			createIncomeType(input: $input) {
				${_INCOME_TYPE_FIELDS}
			}
		}
	`;
	const _UPDATE_INCOME_TYPE = gql`
		mutation UpdateIncomeType($input: UpdateIncomeTypeInput!) {
			updateIncomeType(input: $input) {
				${_INCOME_TYPE_FIELDS}
			}
		}
	`;

	const _INCOME_FIELDS = `
		id
		shopId
		artistUserId
		incomeTypeId
		incomeType {
			id
			name
		}
		amountCents
		description
		date
		createdAt
		createdBy {
			id
			firstName
			lastName
		}
	`;

	const _FETCH_INCOMES = gql`
		query GetIncomes(
			$shopId: ID
			$artistUserId: ID
			$start: DateTime
			$end: DateTime
			$page: PageInput
		) {
			getIncomes(shopId: $shopId, artistUserId: $artistUserId, start: $start, end: $end, page: $page) {
				items {
					${_INCOME_FIELDS}
				}
				pageInfo { totalCount hasMore limit offset }
			}
		}
	`;
	const _getIncomes = (scope, range, page, options = {}) => {
		return useQuery(_FETCH_INCOMES, {
			variables: { ...scope, start: range?.start, end: range?.end, page },
			skip: !scope?.shopId && !scope?.artistUserId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _RECORD_INCOME = gql`
		mutation RecordIncome($input: RecordIncomeInput!) {
			recordIncome(input: $input) {
				${_INCOME_FIELDS}
			}
		}
	`;
	const _UPDATE_INCOME = gql`
		mutation UpdateIncome($input: UpdateIncomeInput!) {
			updateIncome(input: $input) {
				${_INCOME_FIELDS}
			}
		}
	`;
	const _DELETE_INCOME = gql`
		mutation DeleteIncome($incomeId: ID!) {
			deleteIncome(incomeId: $incomeId)
		}
	`;

	return {
		getIncomeTypes: _getIncomeTypes,
		CREATE_INCOME_TYPE: _CREATE_INCOME_TYPE,
		UPDATE_INCOME_TYPE: _UPDATE_INCOME_TYPE,
		FETCH_INCOME_TYPES: _FETCH_INCOME_TYPES,
		getIncomes: _getIncomes,
		FETCH_INCOMES: _FETCH_INCOMES,
		RECORD_INCOME: _RECORD_INCOME,
		UPDATE_INCOME: _UPDATE_INCOME,
		DELETE_INCOME: _DELETE_INCOME,
	};
})();

export default IncomeService;
