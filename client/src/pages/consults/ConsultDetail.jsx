import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import moment from "moment";
import { AppointmentService } from "../../services/AppointmentService";
import BookSessionDatesForm from "../../components/booking/BookSessionDatesForm";
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
 * "Convert to Session" via the shared BookSessionDatesForm (see that component's own comment) -
 * lets the artist book one or several session dates in one go, with a real date/time picker
 * instead of a plain native input.
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

	const { data, loading, error } = AppointmentService.getAppointment(appointmentId);

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

	const handleConverted = (projectId) => {
		setShowConvertForm(false);
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
						<button className="bookingRequestActionButton" onClick={() => setShowConvertForm(true)}>
							Convert to Session
						</button>
					</div>
				)}

				{showConvertForm && (
					<BookSessionDatesForm
						bookingRequestId={bookingRequest.id}
						initialDate={moment(appointment.appointmentDate)}
						onSuccess={handleConverted}
						onCancel={() => setShowConvertForm(false)}
						// This IS the consult, so a deposit taken today is recorded against it.
						consultAppointmentId={appointment.id}
					/>
				)}

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
