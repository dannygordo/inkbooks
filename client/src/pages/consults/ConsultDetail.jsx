import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { CircularProgress } from "@mui/material";
import { AppointmentService } from "../../services/AppointmentService";
import BookingRequestService from "../../services/BookingRequestService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
// Reuses ArtistBookingRequests.jsx's own stylesheet rather than duplicating near-identical
// classes - this app's CSS is global/unscoped by convention (see that file's own comment), and
// this page is deliberately styled to feel like "the same detail pane, for one specific request"
// rather than a new visual language.
import "../booking/artistBookingRequests.css";

const STATUS_LABELS = {
	consult_booked: "Consult booked",
	session_booked: "Session booked",
	not_booked: "Not booked",
	declined: "Declined",
};

/**
 * A consult Appointment has no Project of its own to view/edit through - unlike a session, which
 * always lives inside a Project page (see pages/projects/Project.jsx). This is that missing page:
 * shows the consult's date and its original intake details (pulled from the BookingRequest it was
 * created from - see Appointment.bookingRequestId / the bookingRequest field resolver in
 * resolvers/index.js), and, while the underlying BookingRequest is still at consult_booked, offers
 * "Convert to Session" - the same convertBookingRequest(outcome: 'session_booked') call
 * ArtistBookingRequests.jsx's own "Book Session" action uses, which auto-creates the real Project
 * from this same intake data (see mutations/bookingRequests.js).
 *
 * Reached from ArtistPerformancePanel.jsx's dashboard (a consult-type upcoming appointment row) -
 * previously those rows weren't clickable at all, since the dashboard's clickability only ever
 * checked appt.projectId, which a pure consult never has.
 */
const ConsultDetail = () => {
	const { appointmentId } = useParams();
	const navigate = useNavigate();
	const { setAlert } = useAuth();
	const [showConvertForm, setShowConvertForm] = useState(false);
	const [convertError, setConvertError] = useState(null);
	const appointmentDateInput = useRef();
	const projectTitleInput = useRef();

	const { data, loading, error } = AppointmentService.getAppointment(appointmentId);

	const [convertBookingRequest, { loading: converting }] = useMutation(
		BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION,
		{
			onCompleted(res) {
				setConvertError(null);
				const projectId = res.convertBookingRequest?.resultingAppointment?.projectId;
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
					message: "Session booked.",
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
				if (projectId) {
					navigate(`${ROUTE_CONSTANTS.PROJECT}${projectId}`);
				}
			},
			onError(err) {
				setConvertError(err.graphQLErrors?.[0]?.message || err.message);
			},
		}
	);

	if (loading) {
		return (
			<div className="artistBookingRequests">
				<CircularProgress color="inherit" size="30px" />
			</div>
		);
	}

	if (error || !data?.getAppointment) {
		return (
			<div className="artistBookingRequests">
				<p>Couldn't load this consult: {error?.message || "not found"}</p>
			</div>
		);
	}

	const appointment = data.getAppointment;
	const bookingRequest = appointment.bookingRequest;

	if (appointment.appointmentType !== "consult" || !bookingRequest) {
		// Not a consult, or created before Appointment.bookingRequestId existed (see
		// PRODUCTION_ROADMAP.md's Phase 7 follow-up notes on pre-fix records) - nothing here to
		// show or convert.
		return (
			<div className="artistBookingRequests">
				<div className="bookingRequestDetail">
					<p>
						This appointment doesn't have any consult details on file - it may have been
						created before this page existed.
					</p>
				</div>
			</div>
		);
	}

	const handleConfirmConvert = (e) => {
		e.preventDefault();
		const rawDate = appointmentDateInput.current.value;
		if (!rawDate) {
			setConvertError("Pick a date and time first.");
			return;
		}
		const projectTitle = projectTitleInput.current.value.trim();
		if (!projectTitle) {
			setConvertError("Give the project a title first.");
			return;
		}
		convertBookingRequest({
			variables: {
				bookingRequestId: bookingRequest.id,
				outcome: "session_booked",
				appointmentInput: {
					appointmentDate: new Date(rawDate).toISOString(),
					shopCutStatus: "unpaid",
					appointmentStatus: "scheduled",
				},
				projectTitle,
			},
		});
	};

	return (
		<div className="artistBookingRequests">
			<div className="bookingRequestDetail">
				<div className="bookingRequestDetailHeader">
					<h3>
						{bookingRequest.client?.firstName} {bookingRequest.client?.lastName}
					</h3>
					<span className="bookingRequestsListItemStatus">
						{STATUS_LABELS[bookingRequest.status] || bookingRequest.status}
					</span>
				</div>
				<div className="bookingRequestDetailContact">
					{bookingRequest.client?.email}
					{bookingRequest.client?.phone ? ` · ${bookingRequest.client.phone}` : ""}
				</div>
				<div className="bookingRequestDetailContact">
					{new Date(appointment.appointmentDate).toLocaleString(undefined, {
						dateStyle: "long",
						timeStyle: "short",
					})}
				</div>

				<div className="bookingRequestDetailFields">
					<p>{bookingRequest.description}</p>
					{bookingRequest.placement && <span>Placement: {bookingRequest.placement}</span>}
					{bookingRequest.size && <span>Size: {bookingRequest.size}</span>}
					{bookingRequest.budget && <span>Budget: {bookingRequest.budget}</span>}
					{bookingRequest.isCoverUp && <span>Cover-up / touch-up</span>}
				</div>

				{bookingRequest.referenceImages && bookingRequest.referenceImages.length > 0 && (
					<div className="bookingRequestDetailImages">
						{bookingRequest.referenceImages.map((url) => (
							<a href={url} target="_blank" rel="noreferrer" key={url}>
								<img src={url} alt="Reference" className="bookingRequestDetailImage" />
							</a>
						))}
					</div>
				)}

				{bookingRequest.status === "consult_booked" && !showConvertForm && (
					<div className="bookingRequestDetailActions">
						<button
							className="bookingRequestActionButton"
							onClick={() => {
								setShowConvertForm(true);
								setConvertError(null);
							}}
						>
							Convert to Session
						</button>
					</div>
				)}

				{showConvertForm && (
					<form className="bookingRequestConvertForm" onSubmit={handleConfirmConvert}>
						<label>
							Session date & time
							<input type="datetime-local" ref={appointmentDateInput} required />
						</label>
						<label>
							Project title
							<input type="text" ref={projectTitleInput} placeholder="e.g. Sleeve piece" required />
						</label>
						<div className="bookingRequestConvertFormButtons">
							<button type="submit" disabled={converting}>
								{converting ? <CircularProgress color="inherit" size="16px" /> : "Confirm"}
							</button>
							<button type="button" onClick={() => setShowConvertForm(false)}>
								Cancel
							</button>
						</div>
					</form>
				)}
				{convertError && <div className="bookingRequestError">{convertError}</div>}

				{bookingRequest.status === "session_booked" && (
					<div className="bookingRequestDetailContact">
						This consult already led to a booked session.
					</div>
				)}
			</div>
		</div>
	);
};

export default ConsultDetail;
