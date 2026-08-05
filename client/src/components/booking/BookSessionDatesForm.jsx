import { useState } from "react";
import moment from "moment";
import { useApolloClient, useMutation } from "@apollo/client";
import { Button, IconButton } from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import IBDateTimePicker from "../inputs/IBDateTimePicker";
import IBInput from "../inputs/IBInput";
import BookingRequestService from "../../services/BookingRequestService";
import { AppointmentService } from "../../services/AppointmentService";
import DepositService from "../../services/DepositService";
import { useAuth } from "../../context/auth";
import { dollarsToCents } from "../../utils/money";
import "./bookSessionDatesForm.css";

/**
 * Shared "book a session" sub-form - used by both ArtistBookingRequests.jsx (a still-pending
 * request) and ConsultDetail.jsx (an already-consult_booked request that's moving forward). Two
 * things this replaces:
 *
 * - The plain `<input type="datetime-local">` each caller used to build inline - not a real date
 *   picker, no calendar/time-scroll UI, looked and behaved nothing like the rest of the app's
 *   actual scheduling surface (see IBDateTimePicker, already used by AppointmentWizard.jsx's own
 *   date/time step). This uses that same component instead.
 * - Booking exactly one session date at a time. A real tattoo project is very often multiple
 *   sittings agreed on up front (a sleeve, a large back piece) - this now allows adding as many
 *   session dates as needed in one go.
 *
 * Mechanically: the *first* date always goes through convertBookingRequest (outcome:
 * 'session_booked') - that's still the one call that creates the real Project from this
 * BookingRequest's own intake fields (see mutations/bookingRequests.js). Every additional date
 * then reuses the same plain createAppointment mutation the wizard's "session against an
 * existing project" path already uses (see AppointmentWizard.jsx's
 * handleSubmitExistingProjectSession) - same title/userId/shopId/appointmentType shape, just
 * pointed at the Project convertBookingRequest just created, so a second call here doesn't need
 * to reinvent that. No new server-side capability was needed for any of this.
 */
const BookSessionDatesForm = ({
	bookingRequestId,
	initialDate,
	onSuccess,
	onCancel,
	// The consult appointment this conversion is happening from, when there is one. A deposit is
	// recorded against it - see the deposit field below.
	consultAppointmentId,
}) => {
	const { user } = useAuth();
	const shopId = user.userInfo?.shop?.id;
	const [sessionDates, setSessionDates] = useState([initialDate || moment()]);
	const [projectTitle, setProjectTitle] = useState("");
	// A deposit is taken when the consult actually happens and the work is agreed - which is this
	// moment, not when the consult was booked. A consult sitting in the calendar for next Tuesday
	// has no deposit against it because nobody has met yet.
	//
	// Optional: plenty of jobs don't take one.
	const [depositDollars, setDepositDollars] = useState("");
	const [error, setError] = useState(null);
	const [submitting, setSubmitting] = useState(false);

	const [convertBookingRequest] = useMutation(BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION);
	const [createAppointment] = useMutation(AppointmentService.CREATE_APPOINTMENT);
	// See AppointmentService.CALENDAR_REFETCH_QUERIES - by operation name, all of them, because
	// refetchQueries skips whatever isn't mounted and this form is reached from two different
	// places (the consult page and the calendar's event dialog) watching different queries.
	const client = useApolloClient();
	const refetchAppointments = () =>
		client.refetchQueries({ include: AppointmentService.CALENDAR_REFETCH_QUERIES });
	const [recordDeposit] = useMutation(DepositService.RECORD_DEPOSIT);

	const updateDate = (index, val) => {
		setSessionDates((prev) => prev.map((d, i) => (i === index ? val : d)));
	};

	const addDate = () => {
		// Defaults the next session a week after the last one entered - a common real cadence for
		// multi-sitting work, and easy to adjust from there rather than starting from "now" again.
		const last = sessionDates[sessionDates.length - 1];
		setSessionDates((prev) => [...prev, moment(last).add(1, "week")]);
	};

	const removeDate = (index) => {
		setSessionDates((prev) => prev.filter((_, i) => i !== index));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!projectTitle.trim()) {
			setError("Give the project a title first.");
			return;
		}
		if (sessionDates.some((d) => !d || !moment(d).isValid())) {
			setError("Pick a valid date and time for every session.");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const [firstDate, ...restDates] = sessionDates;
			const { data } = await convertBookingRequest({
				variables: {
					bookingRequestId,
					outcome: "session_booked",
					appointmentInput: {
						appointmentDate: moment(firstDate).toISOString(),
						shopCutStatus: "unpaid",
						appointmentStatus: "scheduled",
					},
					projectTitle,
				},
			});
			const projectId = data.convertBookingRequest.resultingAppointment?.projectId;
			// Every additional date is just another session Appointment against the same,
			// already-real Project - same shape as the wizard's existing-project session path.
			for (const date of restDates) {
				const now = new Date().toISOString();
				await createAppointment({
					variables: {
						appointmentInput: {
							projectId,
							userId: user.id,
							shopId,
							title: projectTitle,
							appointmentType: "session",
							shopCutStatus: "unpaid",
							appointmentStatus: "scheduled",
							createdAt: now,
							updatedAt: now,
							appointmentDate: moment(date).toISOString(),
						},
					},
				});
			}
			// Recorded AFTER the conversion succeeds, and against the consult rather than the new
			// session: the money was taken at the consult, so that's the transaction it belongs
			// to, and recording it there is what makes it show up as revenue on the day it was
			// actually collected (see server/graphql/mutations/deposits.js).
			//
			// A failure here doesn't roll back the booking. The sessions are real and on the
			// calendar; losing them because a deposit amount was mistyped would be a far worse
			// outcome than an unrecorded deposit, which can be added afterwards.
			const depositCents = depositDollars ? dollarsToCents(depositDollars) : 0;
			if (depositCents > 0 && consultAppointmentId) {
				try {
					await recordDeposit({
						variables: { appointmentId: consultAppointmentId, depositCents },
					});
				} catch (depositErr) {
					setError(
						`Sessions booked, but the deposit couldn't be recorded: ${
							depositErr.graphQLErrors?.[0]?.message || depositErr.message
						}`
					);
					setSubmitting(false);
					return;
				}
			}

			// One refresh at the end, after every appointment and the deposit have landed - rather
			// than a refetch per createAppointment inside the loop above, which would fire N
			// identical round trips for a multi-sitting booking and still miss the deposit. None
			// of these mutations refreshed anything before, so a session booked from a consult
			// only appeared on the calendar after a hard reload.
			await refetchAppointments();

			if (onSuccess) {
				onSuccess(projectId);
			}
		} catch (err) {
			setError(err.graphQLErrors?.[0]?.message || err.message);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<form className="bookSessionDatesForm" onSubmit={handleSubmit}>
			<IBInput
				label="Project title"
				placeholder="e.g. Sleeve piece"
				onChange={(e) => setProjectTitle(e.target.value)}
				required
			/>
			<div className="bookSessionDatesList">
				{sessionDates.map((date, index) => (
					<div className="bookSessionDateRow" key={index}>
						<IBDateTimePicker
							label={`Session ${index + 1}`}
							val={date}
							setVal={(val) => updateDate(index, val)}
						/>
						{sessionDates.length > 1 && (
							<IconButton
								size="small"
								aria-label="Remove this session"
								onClick={() => removeDate(index)}
							>
								<Close fontSize="small" />
							</IconButton>
						)}
					</div>
				))}
			</div>
			<Button startIcon={<Add />} onClick={addDate} size="small" sx={{ alignSelf: "flex-start" }}>
				Add another session
			</Button>
			{/* Only offered when there's a consult to attach it to. Without one there's no
			    transaction the money belongs to, and a deposit floating free of the appointment
			    that took it is exactly what the ledger design avoids. */}
			{consultAppointmentId && (
				<IBInput
					label="Deposit taken today $"
					type="number"
					placeholder="0"
					helperText="Optional - credited against the client's final session"
					onChange={(e) => setDepositDollars(e.target.value)}
				/>
			)}
			{error && <div className="bookingRequestError">{error}</div>}
			<div className="bookSessionDatesFormButtons">
				<Button type="submit" variant="contained" disabled={submitting}>
					{submitting ? "Booking..." : "Confirm"}
				</Button>
				{onCancel && (
					<Button type="button" onClick={onCancel} disabled={submitting}>
						Cancel
					</Button>
				)}
			</div>
		</form>
	);
};

export default BookSessionDatesForm;
