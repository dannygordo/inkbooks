import { gql, useQuery } from "@apollo/client";

/**
 * The Booking Requests nav badge: how many requests the caller still owes an answer on.
 *
 * WHY THIS IS A COUNT OF REQUESTS AND NOT OF UNREAD MESSAGES. It used to be the latter, and that
 * was wrong twice over. "Have I read it" is answered by opening the thread, so the badge cleared
 * while the request was still pending and still undecided - the one number telling an artist
 * somebody was waiting vanished the moment they glanced at it. And it read ZERO for a brand new
 * request, because createBookingRequest writes a Conversation and a BookingRequest but no Message:
 * the intake text lives on the request itself, so there was nothing to be unread until the client
 * sent a follow-up. That is the reported symptom - a new request arriving with no badge at all.
 *
 * The server answers this with the same filter the Booking Requests page uses for its default
 * view, from one function - see server/utils/booking-inbox.js. A badge is a promise that a list
 * will have something in it, so the badge and the list have to be the same question.
 */
export const GET_PENDING_BOOKING_REQUEST_COUNT = gql`
	query GetPendingBookingRequestCount {
		getPendingBookingRequestCount
	}
`;

/**
 * Refetched by everything that can move a request out of pending.
 *
 * NAMED IN ONE PLACE rather than typed as a string literal at each call site. Apollo matches
 * refetchQueries by operation name, so a typo is not an error - it is silently no refetch, and the
 * symptom is a badge that stays wrong until the poll catches up. One export means one thing to
 * grep when a new call site appears.
 */
export const BOOKING_BADGE_REFETCH = ["GetPendingBookingRequestCount", "GetUnreadMessageCount"];

/**
 * Polled as well as cached, because the event that INCREMENTS this happens in somebody else's
 * browser - a client submitting the public intake form. Nothing in this tab can refetch off that.
 * Decrements are driven by BOOKING_BADGE_REFETCH above, since those do happen here.
 */
export const usePendingBookingRequestCount = () =>
	useQuery(GET_PENDING_BOOKING_REQUEST_COUNT, {
		fetchPolicy: "cache-and-network",
		pollInterval: 60000,
	});

// Shared gql documents for the booking-request pipeline - previously each caller
// (BookingRequest.jsx's public intake form, ArtistBookingRequests.jsx's dashboard) declared its
// own inline copies of these strings. Added as a real shared service now that a third caller
// needs them: AppointmentWizard.jsx's "Consult" path, which reuses this same
// createBookingRequest -> convertBookingRequest pipeline for an artist entering a walk-in client
// themselves, instead of inventing a second, parallel way to create a consult appointment.
const BookingRequestService = (() => {
	const _CREATE_BOOKING_REQUEST_MUTATION = gql`
		mutation createBookingRequest($bookingRequestInput: BookingRequestInput!) {
			createBookingRequest(bookingRequestInput: $bookingRequestInput) {
				id
				status
			}
		}
	`;

	const _CONVERT_BOOKING_REQUEST_MUTATION = gql`
		mutation convertBookingRequest(
			$bookingRequestId: ID!
			$outcome: String!
			$appointmentInput: AppointmentInput
			$projectTitle: String
		) {
			convertBookingRequest(
				bookingRequestId: $bookingRequestId
				outcome: $outcome
				appointmentInput: $appointmentInput
				projectTitle: $projectTitle
			) {
				id
				status
				resultingAppointmentId
				# Only ConsultDetail.jsx's "Convert to Session" action reads this (to navigate
				# straight to the new Project) - harmless for the other two callers to fetch and
				# ignore rather than needing a second, near-identical query document just for that.
				resultingAppointment {
					id
					projectId
				}
			}
		}
	`;

	return {
		CREATE_BOOKING_REQUEST_MUTATION: _CREATE_BOOKING_REQUEST_MUTATION,
		CONVERT_BOOKING_REQUEST_MUTATION: _CONVERT_BOOKING_REQUEST_MUTATION,
	};
})();

export default BookingRequestService;
