import React, { useEffect, useMemo, useState } from "react";
import { DialogActions, DialogContent } from "@mui/material";
import moment from "moment";
import { useMutation } from "@apollo/client";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import AppointmentSlotPicker from "../appointments/AppointmentSlotPicker";
import {
	CONSULT_DEFAULT_MINUTES,
	SESSION_DEFAULT_MINUTES,
} from "../appointments/DurationPicker";
import IBInput from "../inputs/IBInput";
import IBMultilineInput from "../inputs/IBMultilineInput";
import IBSelect from "../inputs/IBSelect";
import IBProjectsByArtistSelect from "../inputs/IBProjectsByArtistSelect";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import FormField from "../formField/FormField";
import { AppointmentService } from "../../services/AppointmentService";
import ProjectService from "../../services/ProjectService";
import ClientService from "../../services/ClientService";
import BookingRequestService from "../../services/BookingRequestService";
import UtilsService from "../../services/UtilsService";

// Replaces CreateEventDialog's single flat form for consult/session with a short wizard - see
// PRODUCTION_ROADMAP.md's Phase 7 section for the full design discussion this came out of.
// Step 1 always asks what's being scheduled; each type then gets exactly the steps it actually
// needs, rather than one form trying to cover all three at once:
//   - Consult AND a brand-new-project Session now share the *same* pipeline end to end
//     (email-lookup client step -> intake-details step -> date/time -> createBookingRequest ->
//     convertBookingRequest) - the only difference is the `outcome` ('consult_booked' vs
//     'session_booked') and that a session also collects a Project title, since convertBookingRequest
//     already auto-creates the Project from that same intake data for session_booked (see
//     mutations/bookingRequests.js). This replaced an earlier version where Session had its own
//     separate client-dropdown + inline create-project mutation - two parallel intake paths that
//     could drift from each other, and a picker-based client step real users found confusing (see
//     the "email lookup" note below for why that was replaced).
//   - Session can *also* attach to an already-existing Project instead (no client step needed -
//     the project already has one) - that path is unchanged, simple, and direct
//     (pick project -> date/time -> createAppointment).
//
// CALENDAR: SHOP vs PERSONAL. A new dropdown on the type step, defaulting to Shop. Personal has no
// Consult/Session choice at all - a private calendar entry ("dentist", "kid's recital") isn't
// either one, and asking would just be a question with no right answer. Picking Personal replaces
// the "what are you scheduling?" prompt with a single Continue button straight into a flat title/
// description/date form (personal-form below), skipping the client-intake/booking-request
// pipeline entirely - that pipeline creates real Clients and Projects and sends real confirmation
// emails, and forcing a private entry through machinery built for a client relationship would
// create records that don't belong to any real work, or worse, send a confirmation email for an
// appointment that was never a booking. createAppointment is called directly with isPersonal:
// true, appointmentType: 'other' (an internal bucket only - see AppointmentTypeChip.jsx, which
// renders the label "Personal" for any personal appointment regardless of this value) and no
// shopId/projectId - the same call shape the old "Other" TYPE used to make, which this replaces
// (see this file's git history - "Other" as a selectable type for a SHOP appointment is gone; the
// appointments page only offers Consult/Session there now).
//
// Email-lookup client step: replaces the old radio-button "existing client (dropdown) / new
// client" picker for both Consult and new-Session. A real user testing this reported the dropdown
// itself as confusing (see PRODUCTION_ROADMAP.md), and separately reported a consult silently
// failing to save - tracing that down, the old flow let you click "Next" out of the client step
// with nothing actually selected (no validation on that button), so the *only* feedback on a
// missing client was a small red error line on the final Save step, easy to miss entirely if you
// didn't look right at it - indistinguishable from "nothing happened." This version replaces the
// dropdown with a single email field: type an email, and if it matches an already-known client
// (checked client-side against the already-fetched client list - no new query), that client's
// name/phone are shown read-only immediately; if it doesn't match, name/phone fields appear to
// collect a new client. Either way the *same* email/firstName/lastName/phone fields end up in
// createBookingRequest's input - the server's own findOrCreateGuestClient (already used by the
// public intake form) does the actual find-or-create by email, so this step is purely a client-
// side convenience (autofill on match), not new server logic. On top of that, every save now also
// raises a real global alert (see setAlert calls below) on both success and failure, not just the
// small in-dialog error line - so a failure is never silently missable again.
const AppointmentWizard = ({ selectedDay }) => {
	const { setModal, modal, user, setAlert } = useAuth();
	const shopId = user.userInfo?.shop?.id;

	const [type, setType] = useState(null); // 'consult' | 'session' | null
	const [step, setStep] = useState("type");
	// Shop vs personal - see this file's header comment. Defaults to Shop: that's the common case
	// (booking real client work), and a default that silently hid an appointment from the shop's
	// own calendar would be a much worse mistake to make by accident than the reverse.
	const [calendarChoice, setCalendarChoice] = useState("shop");
	// LOCAL, not moment.utc(). A utc-mode moment makes the picker interpret whatever the artist
	// picks as a UTC wall clock, so "10:00" is stored as 10:00Z - seven hours early in PDT. The
	// appointment is an INSTANT; the picker works in the viewer's zone and toISOString() converts.
	const [startDateTime, setStartDateTime] = useState(moment(selectedDay));
	// One duration for whichever appointment this wizard ends up creating. Seeded per TYPE the
	// moment the type is chosen (see setTypeAndDefaultDuration below) rather than left at a single
	// constant, because a consult and a session are wildly different lengths and a default that is
	// wrong half the time is a default people learn to overwrite without reading - which is how a
	// three-hour session gets booked as forty-five minutes.
	const [durationMinutes, setDurationMinutes] = useState(CONSULT_DEFAULT_MINUTES);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState(null);

	// --- Personal (see this file's header comment) ---
	const [personalTitle, setPersonalTitle] = useState("");
	const [personalDescription, setPersonalDescription] = useState("");

	// --- Shared client-email step (Consult, and a brand-new-project Session) ---
	const [clientEmail, setClientEmail] = useState("");
	const [clientFirstName, setClientFirstName] = useState("");
	const [clientLastName, setClientLastName] = useState("");
	const [clientPhone, setClientPhone] = useState("");

	// --- Shared intake-details step (Consult, and a brand-new-project Session) ---
	const [intakeDescription, setIntakeDescription] = useState("");
	const [intakePlacement, setIntakePlacement] = useState("");
	const [intakeSize, setIntakeSize] = useState("");
	const [intakeBudget, setIntakeBudget] = useState("");
	const [isCoverUp, setIsCoverUp] = useState(false);
	// Project.title is required and BookingRequest never collects one - only relevant when
	// type === 'session' (see convertBookingRequest's own projectTitle requirement).
	const [projectTitle, setProjectTitle] = useState("");

	// --- Session: existing-project path only ---
	const [projectMode, setProjectMode] = useState("existing"); // 'existing' | 'new'
	const [existingProjectId, setExistingProjectId] = useState("");

	// The full client list used to be fetched here purely so the email match below could scan it.
	// That's a server lookup now, so this component no longer pulls a client directory it never
	// renders.
	const { data: projectsData, loading: projectsLoading } = ProjectService.fetchProjectsByArtist(
		user.id
	);

	const [createAppointment] = useMutation(AppointmentService.CREATE_APPOINTMENT);
	const [createBookingRequest] = useMutation(
		BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION
	);
	// NO BOOKING_BADGE_REFETCH here, unlike the other two callers of this mutation, and deliberately
	// so. This wizard creates its own request with source: 'artist_created' and converts it in the
	// same breath - such a request is never in the pending inbox (see utils/booking-inbox.js), so
	// the badge cannot have changed. Refetching would be a query that can only ever return the same
	// number, and it would suggest to the next reader that this path does affect the inbox.
	const [convertBookingRequest] = useMutation(
		BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION
	);

	// Asks the server, rather than scanning a fetched list.
	//
	// This used to match against ClientService.fetchClients()'s result. That worked while the list
	// was every client; once it paged, the match could only ever find someone on the first page -
	// and a miss here is not cosmetic. The wizard would ask for a first and last name,
	// createClientAccount would find the existing person by email regardless, and the freshly
	// typed name would overwrite the real one. See findClientByEmail in server/resolvers/clients.js.
	const normalizedEmail = clientEmail.trim().toLowerCase();
	const [findClientByEmail, { data: matchData }] = ClientService.useLazyFindClientByEmail();

	useEffect(() => {
		if (!normalizedEmail || !normalizedEmail.includes("@")) {
			return undefined;
		}
		// Debounced: this runs per keystroke otherwise, and an email is only meaningful once
		// somebody has stopped typing it.
		const timer = setTimeout(() => {
			findClientByEmail({ variables: { email: normalizedEmail } });
		}, 350);
		return () => clearTimeout(timer);
	}, [normalizedEmail, findClientByEmail]);

	// Guarded against a stale response: the query is debounced and asynchronous, so a result for a
	// previously-typed address can land after the field has moved on. Without this the wizard
	// could prefill somebody else's name.
	const matchedClient = useMemo(() => {
		const found = matchData?.findClientByEmail;
		if (!found) {
			return null;
		}
		return (found.email || "").trim().toLowerCase() === normalizedEmail ? found : null;
	}, [matchData, normalizedEmail]);

	// Refreshes every appointment list there is - see AppointmentService.CALENDAR_REFETCH_QUERIES
	// for why it's by operation name and why it doesn't branch on shopId. This used to be a
	// `{ query, variables: { shopId } }` descriptor, which is what made saving an appointment do
	// nothing visible until a hard reload.
	const appointmentsRefetch = AppointmentService.CALENDAR_REFETCH_QUERIES;

	const closeModal = () => setModal({ ...modal, isOpen: false });

	const showSuccessAlert = (message) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};
	// Raised in addition to the in-dialog `error` line, not instead of it - a global alert is much
	// harder to miss than a small red line inside a modal that might already be mid-scroll. See
	// this file's own header comment on why that mattered here.
	const showErrorAlert = (message) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.ERROR,
			message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MODAL,
		});
	};

	// Shop path only - Personal has no type choice at all (see this file's header comment and
	// handleContinuePersonal just below), so this is never reached when calendarChoice is
	// "personal".
	const handleTypeSelect = (selectedType) => {
		setType(selectedType);
		setError(null);
		// Seed the length from the type, since that is the only thing known at this point and it is
		// a much better guess than a constant.
		setDurationMinutes(
			selectedType === "session" ? SESSION_DEFAULT_MINUTES : CONSULT_DEFAULT_MINUTES
		);
		if (selectedType === "consult") {
			setStep("client-email");
		} else {
			setStep("session-project");
		}
	};

	// Personal's only path forward from the type step - no Consult/Session question, since neither
	// answer means anything for a private calendar entry. Straight to the flat title/description/
	// date form.
	const handleContinuePersonal = () => {
		setError(null);
		setStep("personal-form");
	};

	const handleSubmitPersonal = async (e) => {
		e.preventDefault();
		if (!personalTitle.trim()) {
			setError("Give it a title first.");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const now = UtilsService.formatDateToISO(Date.now());
			await createAppointment({
				variables: {
					appointmentInput: {
						userId: user.id,
						// Deliberately NO shopId and NO projectId - the server rejects a personal
						// appointment carrying either (see mutations/appointments.js). Omitting them
						// here rather than sending null/undefined explicitly is the same thing as far
						// as the resolver's own checks are concerned, but matches how every other
						// field this form doesn't collect is already handled below.
						isPersonal: true,
						title: personalTitle,
						description: personalDescription,
						shopCutStatus: "none",
						appointmentStatus: "scheduled",
						// An internal bucket only - a personal appointment has no Consult/Session
						// question to answer (see handleContinuePersonal above), and the chip never
						// reads this for a personal appointment anyway: AppointmentTypeChip renders
						// the label "Personal" whenever its `personal` prop is set, regardless of
						// appointmentType. 'other' rather than a new enum value because the schema
						// already has one for "not consult, not session" - see utils/validation.js.
						appointmentType: "other",
						createdAt: now,
						updatedAt: now,
						appointmentDate: UtilsService.formatDateToISO(startDateTime),
						durationMinutes,
					},
				},
				refetchQueries: appointmentsRefetch,
				awaitRefetchQueries: true,
			});
			showSuccessAlert("Personal appointment saved.");
			closeModal();
		} catch (err) {
			setError(err.message);
			showErrorAlert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	// Shared by Consult and a brand-new-project Session - see this file's header comment on why
	// these two now go through the exact same pipeline.
	const handleSubmitIntake = async (e) => {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const createRes = await createBookingRequest({
				variables: {
					bookingRequestInput: {
						artistId: user.id,
						firstName: clientFirstName,
						lastName: clientLastName,
						email: clientEmail,
						phone: clientPhone,
						description: intakeDescription,
						placement: intakePlacement,
						size: intakeSize,
						budget: intakeBudget,
						isCoverUp,
						// This wizard is the artist scheduling their own consult/session directly -
						// not a real inbound submission from the public intake form. Tagged so
						// getBookingRequests (the artist's "Booking Requests" inbox) can exclude it -
						// see BookingRequest.js's own comment on why these are kept distinct.
						source: "artist_created",
					},
				},
			});
			const bookingRequestId = createRes.data.createBookingRequest.id;
			await convertBookingRequest({
				variables: {
					bookingRequestId,
					outcome: type === "session" ? "session_booked" : "consult_booked",
					projectTitle: type === "session" ? projectTitle : undefined,
					appointmentInput: {
						appointmentDate: UtilsService.formatDateToISO(startDateTime),
						durationMinutes,
						shopCutStatus: "unpaid",
						appointmentStatus: "scheduled",
					},
				},
				refetchQueries: appointmentsRefetch,
				awaitRefetchQueries: true,
			});
			showSuccessAlert(type === "session" ? "Session saved." : "Consult saved.");
			closeModal();
		} catch (err) {
			setError(err.message);
			showErrorAlert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	// Session, existing-project path only - unchanged direct createAppointment (the project
	// already has a client, so no client/intake step is needed here at all).
	const handleSubmitExistingProjectSession = async (e) => {
		e.preventDefault();
		if (!existingProjectId) {
			setError("Pick a project first.");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const now = UtilsService.formatDateToISO(Date.now());
			// This Appointment has no BookingRequest to derive a title from (unlike the
			// consult/new-project-session path - see convertBookingRequest's own comment on why
			// that one sets a title) - borrowing the already-picked Project's own title here is
			// the same fix for the same underlying bug: ibCalendar/Day.jsx's template string
			// shows the literal text "null" for an untitled Appointment.
			const selectedProject = (projectsData?.getProjectsByArtist || []).find(
				(p) => p.id === existingProjectId
			);
			await createAppointment({
				variables: {
					appointmentInput: {
						projectId: existingProjectId,
						userId: user.id,
						shopId,
						title: selectedProject?.title,
						shopCutStatus: "unpaid",
						appointmentStatus: "scheduled",
						appointmentType: "session",
						createdAt: now,
						updatedAt: now,
						appointmentDate: UtilsService.formatDateToISO(startDateTime),
						durationMinutes,
					},
				},
				refetchQueries: appointmentsRefetch,
				awaitRefetchQueries: true,
			});
			showSuccessAlert("Session saved.");
			closeModal();
		} catch (err) {
			setError(err.message);
			showErrorAlert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	// Every step below returns its own root element keyed on `step`. Without it, React reconciles
	// by tree POSITION and component type, not by which step this visually is - and two unrelated
	// steps can have identical shapes at the top (e.g. client-email's first field is an IBInput
	// FormField, and so is intake-details' Project Title field when type is 'session'). That match
	// let React reuse the same underlying <input> DOM node across the step change instead of
	// mounting a fresh one - and since these are UNCONTROLLED inputs (defaultValue, not value - see
	// IBInput.jsx), a changed defaultValue prop does nothing to a node that already exists, so
	// whatever the artist typed as their client's email was still sitting in the DOM when they
	// started typing a project title next, silently prefixing it. Found via AppointmentWizard's own
	// tests, not by inspection - this codebase's usual pattern for a real functional bug (see e.g.
	// the getChargeQuote incident this file's header comment references).
	if (step === "type") {
		const isPersonalChoice = calendarChoice === "personal";
		return (
			<DialogContent key={step} dividers className="appointmentWizardDialogContent">
				{/* Shop vs Personal - see this file's header comment. IBSelect, not a bare <select> -
				    every control in this app that has an IB equivalent uses it, so a future styling
				    or behaviour fix to IBSelect reaches this dropdown automatically. */}
				<FormField id="wizardCalendarChoice" label="Calendar">
					<IBSelect
						id="wizardCalendarChoice"
						data={[
							{ value: "shop", label: "Shop" },
							{ value: "personal", label: "Personal" },
						]}
						label="Calendar"
						selectedVal={calendarChoice}
						onChange={(e) => setCalendarChoice(e.target.value)}
					/>
				</FormField>
				{isPersonalChoice ? (
					// No Consult/Session question for a personal entry - neither answer means
					// anything for it (see this file's header comment). Just move on.
					<div className="appointmentWizardTypeButtons">
						<button type="button" className="ibButton" onClick={handleContinuePersonal}>
							Continue
						</button>
					</div>
				) : (
					<>
						<p>What are you scheduling?</p>
						<div className="appointmentWizardTypeButtons">
							<button
								type="button"
								className="ibButton"
								onClick={() => handleTypeSelect("consult")}
							>
								Consult
							</button>
							<button
								type="button"
								className="ibButton"
								onClick={() => handleTypeSelect("session")}
							>
								Session
							</button>
						</div>
					</>
				)}
			</DialogContent>
		);
	}

	if (step === "personal-form") {
		return (
			<form key={step} onSubmit={handleSubmitPersonal}>
				<DialogContent dividers className="appointmentWizardDialogContent">
					<AppointmentSlotPicker
						label="Select Date"
						date={startDateTime}
						onDateChange={setStartDateTime}
						durationMinutes={durationMinutes}
						onDurationChange={setDurationMinutes}
						artistUserId={user.id}
					/>
					<FormField id="personalTitle" label="Title">
						<IBInput
							id="personalTitle"
							placeholder="e.g. Dentist appointment"
							onChange={(e) => setPersonalTitle(e.target.value)}
						/>
					</FormField>
					<FormField id="personalDescription" label="Description">
						<IBMultilineInput
							id="personalDescription"
							onChange={(e) => setPersonalDescription(e.target.value)}
						/>
					</FormField>
					{error && <div className="bookingRequestError">{error}</div>}
				</DialogContent>
				<DialogActions className="appointmentWizardDialogActions">
					<button type="button" className="ibButton" onClick={() => setStep("type")}>
						Back
					</button>
					<button type="submit" className="ibButton" disabled={submitting}>
						{submitting ? "Saving..." : "Save"}
					</button>
				</DialogActions>
			</form>
		);
	}

	if (step === "client-email") {
		// No loading gate here any more: there's no list to wait for. The email lookup resolves
		// after the field is typed and only ever adds a "Found:" line - blocking the step on it
		// would make the user wait to type.
		return (
			<DialogContent key={step} dividers className="appointmentWizardDialogContent">
				<FormField id="clientEmail" label="Client email">
					<IBInput
						id="clientEmail"
						type="email"
						defaultValue={clientEmail}
						onChange={(e) => setClientEmail(e.target.value)}
						placeholder="jon.snow@example.com"
					/>
				</FormField>
				{matchedClient ? (
					<div className="clientEmailMatchCard">
						Found: {matchedClient.firstName} {matchedClient.lastName}
						{matchedClient.phone ? ` - ${matchedClient.phone}` : ""}
						<button
							type="button"
							className="ibButton"
							style={{ marginLeft: 10 }}
							onClick={() => setClientEmail("")}
						>
							Not them? Clear
						</button>
					</div>
				) : (
					normalizedEmail && (
						<>
							<div className="clientEmailNoMatchNote">
								No existing client found for this email - enter their details to create
								one.
							</div>
							<FormField id="clientFirstName" label="First Name">
								<IBInput
									id="clientFirstName"
									defaultValue={clientFirstName}
									onChange={(e) => setClientFirstName(e.target.value)}
								/>
							</FormField>
							<FormField id="clientLastName" label="Last Name">
								<IBInput
									id="clientLastName"
									defaultValue={clientLastName}
									onChange={(e) => setClientLastName(e.target.value)}
								/>
							</FormField>
							<FormField id="clientPhone" label="Phone (optional)">
								<IBInput
									id="clientPhone"
									defaultValue={clientPhone}
									onChange={(e) => setClientPhone(e.target.value)}
								/>
							</FormField>
						</>
					)
				)}
				{error && <div className="bookingRequestError">{error}</div>}
				<DialogActions className="appointmentWizardDialogActions">
					<button
						type="button"
						className="ibButton"
						onClick={() => setStep(type === "session" ? "session-project" : "type")}
					>
						Back
					</button>
					<button
						type="button"
						className="ibButton"
						onClick={() => {
							if (!normalizedEmail || !normalizedEmail.includes("@")) {
								setError("Enter a valid client email first.");
								return;
							}
							if (!matchedClient && (!clientFirstName.trim() || !clientLastName.trim())) {
								setError("First and last name are required for a new client.");
								return;
							}
							if (matchedClient) {
								setClientFirstName(matchedClient.firstName);
								setClientLastName(matchedClient.lastName);
								setClientPhone(matchedClient.phone || "");
							}
							setError(null);
							setStep("intake-details");
						}}
					>
						Next
					</button>
				</DialogActions>
			</DialogContent>
		);
	}

	if (step === "intake-details") {
		return (
			<DialogContent key={step} dividers className="appointmentWizardDialogContent">
				{type === "session" && (
					<FormField id="projectTitle" label="Project Title">
						<IBInput
							id="projectTitle"
							defaultValue={projectTitle}
							onChange={(e) => setProjectTitle(e.target.value)}
						/>
					</FormField>
				)}
				<FormField id="intakeDescription" label="What's the idea? (required)">
					<IBMultilineInput
						id="intakeDescription"
						defaultValue={intakeDescription}
						onChange={(e) => setIntakeDescription(e.target.value)}
					/>
				</FormField>
				<FormField id="intakePlacement" label="Placement">
					<IBInput
						id="intakePlacement"
						defaultValue={intakePlacement}
						onChange={(e) => setIntakePlacement(e.target.value)}
					/>
				</FormField>
				<FormField id="intakeSize" label="Size">
					<IBInput
						id="intakeSize"
						defaultValue={intakeSize}
						onChange={(e) => setIntakeSize(e.target.value)}
					/>
				</FormField>
				<FormField id="intakeBudget" label="Budget">
					<IBInput
						id="intakeBudget"
						defaultValue={intakeBudget}
						onChange={(e) => setIntakeBudget(e.target.value)}
					/>
				</FormField>
				<label className="appointmentWizardCheckboxRow">
					<input type="checkbox" checked={isCoverUp} onChange={(e) => setIsCoverUp(e.target.checked)} />{" "}
					Cover-up / touch-up
				</label>
				{error && <div className="bookingRequestError">{error}</div>}
				<DialogActions className="appointmentWizardDialogActions">
					<button type="button" className="ibButton" onClick={() => setStep("client-email")}>
						Back
					</button>
					<button
						type="button"
						className="ibButton"
						onClick={() => {
							if (!intakeDescription.trim()) {
								setError("Describe the idea first.");
								return;
							}
							if (type === "session" && !projectTitle.trim()) {
								setError("A project title is required for a session.");
								return;
							}
							setError(null);
							setStep("datetime");
						}}
					>
						Next
					</button>
				</DialogActions>
			</DialogContent>
		);
	}

	if (step === "datetime") {
		return (
			<form key={step} onSubmit={handleSubmitIntake}>
				<DialogContent dividers className="appointmentWizardDialogContent">
					<AppointmentSlotPicker
						label="Select Date"
						date={startDateTime}
						onDateChange={setStartDateTime}
						durationMinutes={durationMinutes}
						onDurationChange={setDurationMinutes}
						artistUserId={user.id}
					/>
					{error && <div className="bookingRequestError">{error}</div>}
				</DialogContent>
				<DialogActions className="appointmentWizardDialogActions">
					<button type="button" className="ibButton" onClick={() => setStep("intake-details")}>
						Back
					</button>
					<button type="submit" className="ibButton" disabled={submitting}>
						{submitting ? "Saving..." : "Save"}
					</button>
				</DialogActions>
			</form>
		);
	}

	if (step === "session-project") {
		if (projectsLoading) {
			return <IBPageLoader />;
		}
		return (
			<DialogContent key={step} dividers className="appointmentWizardDialogContent">
				<div className="appointmentWizardRadioRow">
					<label>
						<input
							type="radio"
							checked={projectMode === "existing"}
							onChange={() => setProjectMode("existing")}
						/>{" "}
						Existing project
					</label>
					<label>
						<input
							type="radio"
							checked={projectMode === "new"}
							onChange={() => setProjectMode("new")}
						/>{" "}
						New project
					</label>
				</div>
				{projectMode === "existing" && (
					<IBProjectsByArtistSelect
						data={projectsData?.getProjectsByArtist || []}
						label="Project"
						selectedVal={existingProjectId}
						onChange={(e) => setExistingProjectId(e.target.value)}
					/>
				)}
				{error && <div className="bookingRequestError">{error}</div>}
				<DialogActions className="appointmentWizardDialogActions">
					<button type="button" className="ibButton" onClick={() => setStep("type")}>
						Back
					</button>
					<button
						type="button"
						className="ibButton"
						onClick={() => {
							if (projectMode === "existing") {
								if (!existingProjectId) {
									setError("Pick a project first.");
									return;
								}
								setError(null);
								setStep("session-existing-datetime");
							} else {
								setError(null);
								setStep("client-email");
							}
						}}
					>
						Next
					</button>
				</DialogActions>
			</DialogContent>
		);
	}

	if (step === "session-existing-datetime") {
		return (
			<form key={step} onSubmit={handleSubmitExistingProjectSession}>
				<DialogContent dividers className="appointmentWizardDialogContent">
					<AppointmentSlotPicker
						label="Select Date"
						date={startDateTime}
						onDateChange={setStartDateTime}
						durationMinutes={durationMinutes}
						onDurationChange={setDurationMinutes}
						artistUserId={user.id}
					/>
					{error && <div className="bookingRequestError">{error}</div>}
				</DialogContent>
				<DialogActions className="appointmentWizardDialogActions">
					<button type="button" className="ibButton" onClick={() => setStep("session-project")}>
						Back
					</button>
					<button type="submit" className="ibButton" disabled={submitting}>
						{submitting ? "Saving..." : "Save"}
					</button>
				</DialogActions>
			</form>
		);
	}

	return null;
};

export default AppointmentWizard;
