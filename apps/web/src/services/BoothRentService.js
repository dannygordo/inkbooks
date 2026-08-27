import { gql, useMutation, useQuery } from "@apollo/client";

/**
 * Feature 5 - booth rent vs. percentage cut. The flat-fee counterpart to ShopCutRateService.js:
 * same read/write asymmetry (an artist reads their own terms and charges; only a shop admin ever
 * sets the terms), plus the two-step markBoothRentPaidManually -> confirmBoothRentPaid lifecycle
 * mirroring shopCutPayments.js's own mark/confirm mutations for the percentage side.
 */
const PLAN_FIELDS = `
	id
	artistId
	shopId
	amountCents
	dueDayOfMonth
	effectiveFrom
	setByUserId
	active
	createdAt
`;

const CHARGE_FIELDS = `
	id
	artistId
	shopId
	amountCents
	periodMonth
	dueDate
	status
	markedPaidAt
	markedPaidByUserId
	confirmedAt
	confirmedByUserId
	expenseId
	incomeId
	createdAt
`;

const GET_BOOTH_RENT_PLANS = gql`
	query GetBoothRentPlans($artistId: ID!, $shopId: ID!) {
		getBoothRentPlans(artistId: $artistId, shopId: $shopId) {
			${PLAN_FIELDS}
		}
	}
`;

const GET_BOOTH_RENT_CHARGES = gql`
	query GetBoothRentCharges($artistId: ID, $shopId: ID, $status: String, $page: PageInput) {
		getBoothRentCharges(artistId: $artistId, shopId: $shopId, status: $status, page: $page) {
			items {
				${CHARGE_FIELDS}
			}
			pageInfo {
				totalCount
				hasMore
				limit
				offset
			}
		}
	}
`;

const SET_BOOTH_RENT_PLAN = gql`
	mutation SetBoothRentPlan(
		$artistId: ID!
		$shopId: ID!
		$amountCents: Int!
		$dueDayOfMonth: Int!
		$effectiveFrom: DateTime
	) {
		setBoothRentPlan(
			artistId: $artistId
			shopId: $shopId
			amountCents: $amountCents
			dueDayOfMonth: $dueDayOfMonth
			effectiveFrom: $effectiveFrom
		) {
			${PLAN_FIELDS}
		}
	}
`;

const MARK_BOOTH_RENT_PAID_MANUALLY = gql`
	mutation MarkBoothRentPaidManually($boothRentChargeId: ID!) {
		markBoothRentPaidManually(boothRentChargeId: $boothRentChargeId) {
			${CHARGE_FIELDS}
		}
	}
`;

const CONFIRM_BOOTH_RENT_PAID = gql`
	mutation ConfirmBoothRentPaid($boothRentChargeId: ID!) {
		confirmBoothRentPaid(boothRentChargeId: $boothRentChargeId) {
			${CHARGE_FIELDS}
		}
	}
`;

const getBoothRentPlans = (artistId, shopId, options = {}) =>
	useQuery(GET_BOOTH_RENT_PLANS, {
		variables: { artistId, shopId },
		skip: !artistId || !shopId,
		fetchPolicy: "cache-and-network",
		...options,
	});

const getBoothRentCharges = (scope, options = {}) =>
	useQuery(GET_BOOTH_RENT_CHARGES, {
		variables: { ...scope },
		skip: !scope?.artistId && !scope?.shopId,
		fetchPolicy: "cache-and-network",
		...options,
	});

const useSetBoothRentPlan = () =>
	useMutation(SET_BOOTH_RENT_PLAN, { refetchQueries: ["GetBoothRentPlans"] });

const useMarkBoothRentPaidManually = () =>
	useMutation(MARK_BOOTH_RENT_PAID_MANUALLY, { refetchQueries: ["GetBoothRentCharges"] });

const useConfirmBoothRentPaid = () =>
	useMutation(CONFIRM_BOOTH_RENT_PAID, { refetchQueries: ["GetBoothRentCharges"] });

export default {
	getBoothRentPlans,
	getBoothRentCharges,
	useSetBoothRentPlan,
	useMarkBoothRentPaidManually,
	useConfirmBoothRentPaid,
	GET_BOOTH_RENT_PLANS,
	GET_BOOTH_RENT_CHARGES,
	SET_BOOTH_RENT_PLAN,
	MARK_BOOTH_RENT_PAID_MANUALLY,
	CONFIRM_BOOTH_RENT_PAID,
};
