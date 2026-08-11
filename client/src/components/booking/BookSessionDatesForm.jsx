// React imported explicitly: under Vitest, @vitejs/plugin-react compiles JSX with the CLASSIC
// runtime, so a component rendered by a test needs React in scope or it throws "React is not
// defined" - in that test's file, not this one. See vite.config.js and
// scripts/check-react-in-tested-components.mjs.
import React, { useState } from "react";
import moment from "moment";
import { useApolloClient, useMutation } from "@apollo/client";
import { Button, IconButton, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import IBDateTimePicker from "../inputs/IBDateTimePicker";
import IBInput from "../inputs/IBInput";
import BookingRequestService, {
	BOOKING_BADGE_REFETCH,
} from "../../services/BookingRequestService";
import { AppointmentService } from "../../services/AppointmentService";
import DepositService from "../../services/DepositService";
import IBSquarePaymentForm from "../IBSquarePayments/IBSquarePaymentForm";
import DaySchedule from "../appointments/DaySchedule";
import DurationPicker, { SESSION_DEFAULT_MINUTES } from "../appointments/DurationPicker";
import { useAuth } from "../../context/auth";
import { dollarsToCents, formatCents } from "../../utils/money";
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
	// Each sitting carries its own length. A back piece is often a long first sitting and shorter
	// follow-ups, so one duration for the whole set would be wrong for most of them - and a wrong
	// duration is worse than none, because the conflict check then confidently blocks or clears the
	// wrong slot. SESSION_DEFAULT_MINUTES mirrors the server's default for a session
	// (models/Appointment.js); the server still decides when nothing is sent.
	const [sessionDates, setSessionDates] = useState([
		{ date: initialDate || moment(), durationMinutes: SESSION_DEFAULT_MINUTES },
	]);
	const [projectTitle, setProjectTitle] = useState("");
	// A deposit is taken when the consult actually happens and the work is agreed - which is this
	// moment, not when the consult was booked. A consult sitting in the calendar for next Tuesday
	// has no deposit against it because nobody has met yet.
	//
	// Optional: plenty of jobs don't take one.
	const [depositDollars, setDepositDollars] = useState("");
	// How the money was taken. No default, deliberately - "cash" preselected is a wrong answer
	// that gets accepted by everyone in a hurry, and the whole point of recording the method is
	// that the shop can reconcile the drawer against it. The Confirm button stays disabled until
	// this is answered, but only when there's actually a deposit to describe.
	const [depositMethod, setDepositMethod] = useState(null);
	// Set once the sessions are booked and a Square deposit still needs charging. Holds what the
	// card form needs; its presence is what swaps the form out for the card field.
	const [pendingCardDeposit, setPendingCardDeposit] = useState(null);
	const [error, setError] = useState(null);
	const [submitting, setSubmitting] = useState(false);

	const depositCents = depositDollars ? dollarsToCents(depositDollars) : 0;
	const needsMethod = depositCents > 0 && Boolean(consultAppointmentId);

	// Booking the session is what takes this request out of the pending inbox, so the nav badge has
	// to be refetched here too - not only on the Booking Requests page. This form is reached from
	// the consult page and from the calendar's event dialog, neither of which has that list mounted.
	const [convertBookingRequest] = useMutation(
		BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION,
		{ refetchQueries: BOOKING_BADGE_REFETCH },
	);
	const [createAppointment] = useMutation(AppointmentService.CREATE_APPOINTMENT);
	// See AppointmentService.CALENDAR_REFETCH_QUERIES - by operation name, all of them, because
	// refetchQueries skips whatever isn't mounted and this form is reached from two different
	// places (the consult page and the calendar's event dialog) watching different queries.
	const client = useApolloClient();
	const refetchAppointments = () =>
		client.refetchQueries({ include: AppointmentService.CALENDAR_REFETCH_QUERIES });
	const [recordDeposit] = useMutation(DepositService.RECORD_DEPOSIT);

	// RECORD FIRST, THEN CHARGE. This is the reverse of what it used to be, and the reversal is the
	// point: the amount is written to the consult as a PENDING deposit before any card is taken,
	// and the charge route then charges the figure it finds there (see
	// server/utils/charge-quote.js). The browser no longer says what to charge, so the amount
	// charged and the amount recorded cannot be two different numbers.
	//
	// It also removes the failure this file used to have to apologise for. Charging first meant a
	// failed recordDeposit left money taken with no record, and the only honest thing to show was
	// "the card was charged but recording failed - fix it by hand". Now the worst case is a pending
	// deposit that was never collected: visible, harmless, and not spendable, since applyDeposit
	// and getAvailableDeposits both require 'available'.
	const handleCardDepositSuccess = async () => {
		await refetchAppointments();
		if (onSuccess) {
			onSuccess(pendingCardDeposit.projectId);
		}
	};

	const updateDate = (index, val) => {
		setSessionDates((prev) =>
			prev.map((s, i) => (i === index ? { ...s, date: val } : s))
		);
	};

	const updateDuration = (index, minutes) => {
		setSessionDates((prev) =>
			prev.map((s, i) => (i === index ? { ...s, durationMinutes: minutes } : s))
		);
	};

	const addDate = () => {
		// Defaults the next session a week after the last one entered - a common real cadence for
		// multi-sitting work, and easy to adjust from there rather than starting from "now" again.
		// Carries the previous sitting's LENGTH forward too, for the same reason: whatever the
		// artist just decided is a far better guess for the next one than a constant.
		const last = sessionDates[sessionDates.length - 1];
		setSessionDates((prev) => [
			...prev,
			{
				date: moment(last.date).add(1, "week"),
				durationMinutes: last.durationMinutes,
			},
		]);
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
		if (sessionDates.some((s) => !s.date || !moment(s.date).isValid())) {
			setError("Pick a valid date and time for every session.");
			return;
		}
		if (sessionDates.some((s) => !(s.durationMinutes > 0))) {
			setError("Give every session a length.");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const [firstSitting, ...restSittings] = sessionDates;
			const { data } = await convertBookingRequest({
				variables: {
					bookingRequestId,
					outcome: "session_booked",
					appointmentInput: {
						appointmentDate: moment(firstSitting.date).toISOString(),
						durationMinutes: firstSitting.durationMinutes,
						shopCutStatus: "unpaid",
						appointmentStatus: "scheduled",
					},
					projectTitle,
				},
			});
			const projectId = data.convertBookingRequest.resultingAppointment?.projectId;
			// Every additional date is just another session Appointment against the same,
			// already-real Project - same shape as the wizard's existing-project session path.
			for (const sitting of restSittings) {
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
							appointmentDate: moment(sitting.date).toISOString(),
							durationMinutes: sitting.durationMinutes,
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
			//
			// Cash is recorded here and now, because cash IS an assertion - somebody handed over
			// notes and the artist is saying so. A card is not: it has a system of record, and a
			// "Square" deposit with no Square payment behind it is a number typed into a box
			// wearing a payment method's name.
			//
			// So the card path records the amount as PENDING and then charges it. Pending is the
			// honest description of that state - agreed, not collected - and it is what gives the
			// charge a stored figure to work from instead of one this component sends alongside
			// the card. It is not spendable until the payment lands.
			if (depositCents > 0 && consultAppointmentId) {
				if (depositMethod === "square") {
					try {
						await recordDeposit({
							variables: {
								appointmentId: consultAppointmentId,
								depositCents,
								paymentMethod: "square",
								pending: true,
							},
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
					await refetchAppointments();
					setPendingCardDeposit({ depositCents, projectId });
					setSubmitting(false);
					return;
				}
				try {
					await recordDeposit({
						variables: {
							appointmentId: consultAppointmentId,
							depositCents,
							paymentMethod: "cash",
						},
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

	// The sessions are already booked by this point; only the card charge is outstanding. Shown
	// instead of the form rather than beside it, so there is no Confirm button left to press that
	// would do the booking a second time.
	if (pendingCardDeposit) {
		return (
			<div className="bookSessionDatesForm">
				<p className="bookSessionDepositBooked">
					Sessions booked. Take the {formatCents(pendingCardDeposit.depositCents)} deposit
					to finish.
				</p>
				<IBSquarePaymentForm
					// Display only. The server charges the pending deposit recorded on the consult,
					// not this figure - see server/utils/charge-quote.js's quoteDepositCharge.
					amountCents={pendingCardDeposit.depositCents}
					// The consult IS passed now, with chargeType 'deposit'. It used to be withheld
					// so the route wouldn't write session money fields against it; the route now
					// distinguishes the two transactions explicitly instead, which is what lets the
					// deposit be charged from a stored amount at all.
					appointmentId={consultAppointmentId}
					chargeType="deposit"
					note="InkBooks deposit"
					onSuccess={handleCardDepositSuccess}
					onError={(message) => setError(message)}
				/>
				{error && <div className="bookingRequestError">{error}</div>}
				{/* No Cancel here. The sessions exist; backing out of this screen doesn't unbook
				    them, and offering "Cancel" would imply it does. The deposit can be recorded
				    later from the consult if the card fails now. */}
				<div className="bookSessionDatesFormButtons">
					<Button
						type="button"
						onClick={() => onSuccess && onSuccess(pendingCardDeposit.projectId)}
					>
						Skip the deposit for now
					</Button>
				</div>
			</div>
		);
	}

	return (
		<form className="bookSessionDatesForm" onSubmit={handleSubmit}>
			<IBInput
				label="Project title"
				placeholder="e.g. Sleeve piece"
				onChange={(e) => setProjectTitle(e.target.value)}
				required
			/>
			<div className="bookSessionDatesList">
				{sessionDates.map((sitting, index) => (
					// Keyed on the index so the schedule hint stays attached to its own row - it
					// belongs to that sitting, not to the group.
					<div className="bookSessionDateGroup" key={index}>
						<div className="bookSessionDateRow">
							<IBDateTimePicker
								label={`Session ${index + 1}`}
								val={sitting.date}
								setVal={(val) => updateDate(index, val)}
							/>
							<DurationPicker
								value={sitting.durationMinutes}
								onChange={(minutes) => updateDuration(index, minutes)}
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
						{/* What's already on the books that day, and whether any of it actually
						    overlaps this sitting. Renders nothing when the day is clear, so a clean
						    schedule stays silent rather than printing an empty panel under every
						    row. Without this the artist had to leave the project, open their
						    calendar, and come back - or guess. */}
						<DaySchedule
							artistUserId={user.id}
							date={sitting.date}
							durationMinutes={sitting.durationMinutes}
						/>
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
				<>
					<IBInput
						label="Deposit taken today $"
						type="number"
						placeholder="0"
						helperText="Optional - credited against the client's final session"
						onChange={(e) => setDepositDollars(e.target.value)}
					/>
					{/* Only asked once there's an amount. A payment-method question above an empty
					    deposit field is a question about nothing. */}
					{needsMethod && (
						<div className="bookSessionDepositMethod">
							<span className="bookSessionDepositMethodLabel">
								How was it taken?
							</span>
							<ToggleButtonGroup
								exclusive
								size="small"
								value={depositMethod}
								onChange={(_, next) => next && setDepositMethod(next)}
							>
								<ToggleButton value="cash">Cash</ToggleButton>
								<ToggleButton value="square">Card (Square)</ToggleButton>
							</ToggleButtonGroup>
							<span className="bookSessionDepositMethodHint">
								{depositMethod === "square"
									? "You'll enter the card on the next step."
									: "Recorded against this consult either way."}
							</span>
						</div>
					)}
				</>
			)}
			{error && <div className="bookingRequestError">{error}</div>}
			<div className="bookSessionDatesFormButtons">
				<Button
					type="submit"
					variant="contained"
					// Blocked on the method rather than defaulting to one. A deposit recorded with
					// the wrong method is worse than one that made the artist answer a question.
					disabled={submitting || (needsMethod && !depositMethod)}
				>
					{submitting
						? "Booking..."
						: needsMethod && depositMethod === "square"
						? "Book and take payment"
						: "Confirm"}
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
