import { gql, useQuery } from "@apollo/client";

/**
 * Deposits - recording one at a consult, and spending it against a session.
 *
 * The fields selected back from both mutations are the ones that change as a side effect:
 * applying a deposit rewrites the target's totalCents AND its shop cut (the cut follows the
 * reduced figure - see server/utils/shop-cut.js), and flips the source deposit's status. Selecting
 * them means Apollo writes the new values straight into the cache by id, so the session view and
 * any list showing that appointment update without a refetch.
 */
export const DepositService = (() => {
	const _FETCH_AVAILABLE_DEPOSITS = gql`
		query GetAvailableDeposits($appointmentId: ID!) {
			getAvailableDeposits(appointmentId: $appointmentId) {
				id
				title
				appointmentType
				appointmentDate
				depositCents
				depositStatus
				depositCollectedAt
			}
		}
	`;

	const _getAvailableDeposits = (appointmentId, options = {}) => {
		return useQuery(_FETCH_AVAILABLE_DEPOSITS, {
			variables: { appointmentId },
			...options,
			skip: !appointmentId || options.skip,
			// A deposit applied from one session must disappear from every other session's list of
			// available deposits immediately - a stale cached list offering an already-spent
			// deposit is exactly the mistake the single-use rule exists to prevent, and being told
			// "already applied" only after clicking is a bad way to learn it.
			fetchPolicy: "cache-and-network",
		});
	};

	const _RECORD_DEPOSIT = gql`
		mutation RecordDeposit(
			$appointmentId: ID!
			$depositCents: Int!
			$paymentMethod: String!
			$squarePaymentId: String
		) {
			recordDeposit(
				appointmentId: $appointmentId
				depositCents: $depositCents
				paymentMethod: $paymentMethod
				squarePaymentId: $squarePaymentId
			) {
				id
				depositCents
				depositStatus
				depositCollectedAt
				depositPaymentMethod
				depositSquarePaymentId
				subtotalCents
				totalCents
				shopCutCents
				shopCutStatus
			}
		}
	`;

	const _APPLY_DEPOSIT = gql`
		mutation ApplyDeposit($depositAppointmentId: ID!, $targetAppointmentId: ID!) {
			applyDeposit(
				depositAppointmentId: $depositAppointmentId
				targetAppointmentId: $targetAppointmentId
			) {
				id
				depositCreditCents
				depositCreditFromAppointmentId
				subtotalCents
				totalCents
				shopCutCents
				shopCutPercentApplied
				shopCutStatus
			}
		}
	`;

	return {
		FETCH_AVAILABLE_DEPOSITS: _FETCH_AVAILABLE_DEPOSITS,
		getAvailableDeposits: _getAvailableDeposits,
		RECORD_DEPOSIT: _RECORD_DEPOSIT,
		APPLY_DEPOSIT: _APPLY_DEPOSIT,
	};
})();

export default DepositService;
