import { gql } from "@apollo/client";

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
			}
		}
	`;

	return {
		CREATE_BOOKING_REQUEST_MUTATION: _CREATE_BOOKING_REQUEST_MUTATION,
		CONVERT_BOOKING_REQUEST_MUTATION: _CONVERT_BOOKING_REQUEST_MUTATION,
	};
})();

export default BookingRequestService;
