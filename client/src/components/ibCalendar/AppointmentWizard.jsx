import React, { useState } from "react";
import { DialogActions, DialogContent } from "@mui/material";
import moment from "moment";
import { useMutation } from "@apollo/client";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import IBDateTimePicker from "../inputs/IBDateTimePicker";
import IBInput from "../inputs/IBInput";
import IBMultilineInput from "../inputs/IBMultilineInput";
import IBSelect from "../inputs/IBSelect";
import IBProjectsByArtistSelect from "../inputs/IBProjectsByArtistSelect";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import { AppointmentService } from "../../services/AppointmentService";
import ProjectService from "../../services/ProjectService";
import ClientService from "../../services/ClientService";
import BookingRequestService from "../../services/BookingRequestService";
import UtilsService from "../../services/UtilsService";

// Replaces CreateEventDialog's single flat form for consult/session with a short wizard - see
// PRODUCTION_ROADMAP.md's Phase 7 section for the full design discussion this came out of.
// Step 1 always asks what's being scheduled; each type then gets exactly the steps it actually
// needs, rather than one form trying to cover all three at once:
//   - Consult: reuses the *same* booking-request pipeline a public guest goes through
//     (createBookingRequest -> convertBookingRequest), just entered by the artist on behalf of a
//     walk-in/phone client instead of the client filling out the public form themselves. Keeps
//     one intake pipeline instead of a second parallel one that could drift from it.
//   - Session: requires a real Project - pick an existing one, or create a minimal new one inline
//     (existing client only for now - see the "not built yet" note below).
//   - Other: unchanged, fast, single step - blocked time/non-client entries shouldn't cost three
//     screens.
const AppointmentWizard = ({ selectedDay }) => {
	const { setModal, modal, user, setAlert } = useAuth();
	const shopId = user.userInfo?.shop?.id;

	const [type, setType] = useState(null); // 'consult' | 'session' | 'other' | null
	const [step, setStep] = useState("type");
	const [startDateTime, setStartDateTime] = useState(moment.utc(selectedDay));
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState(null);

	// --- Other ---
	const [otherTitle, setOtherTitle] = useState("");
	const [otherDescription, setOtherDescription] = useState("");

	// --- Consult ---
	const [clientMode, setClientMode] = useState("existing"); // 'existing' | 'new'
	const [existingClientId, setExistingClientId] = useState("");
	const [newClientFirstName, setNewClientFirstName] = useState("");
	const [newClientLastName, setNewClientLastName] = useState("");
	const [newClientEmail, setNewClientEmail] = useState("");
	const [newClientPhone, setNewClientPhone] = useState("");
	const [consultDescription, setConsultDescription] = useState("");
	const [consultPlacement, setConsultPlacement] = useState("");
	const [consultSize, setConsultSize] = useState("");
	const [consultBudget, setConsultBudget] = useState("");
	const [isCoverUp, setIsCoverUp] = useState(false);

	// --- Session ---
	const [projectMode, setProjectMode] = useState("existing"); // 'existing' | 'new'
	const [existingProjectId, setExistingProjectId] = useState("");
	const [newProjectTitle, setNewProjectTitle] = useState("");
	const [newProjectDescription, setNewProjectDescription] = useState("");
	const [newProjectClientId, setNewProjectClientId] = useState("");

	const { data: clientsData, loading: clientsLoading } = ClientService.fetchClients();
	const { data: projectsData, loading: projectsLoading } = ProjectService.fetchProjectsByArtist(
		user.id
	);

	const [createAppointment] = useMutation(AppointmentService.CREATE_APPOINTMENT);
	const [createProject] = useMutation(ProjectService.CREATE_PROJECT_MUTATION);
	const [createBookingRequest] = useMutation(
		BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION
	);
	const [convertBookingRequest] = useMutation(
		BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION
	);

	// Whichever appointments query IBCalendar.jsx is actually watching (shop-scoped vs.
	// artist-scoped, per-artist) - refetching it after any of the three creation paths below is
	// simpler and less error-prone than replicating cache.modify three separate times for three
	// different mutations that all ultimately create an Appointment.
	const appointmentsRefetch = shopId
		? { query: AppointmentService.FETCH_APPOINTMENTS_BY_SHOP, variables: { shopId } }
		: { query: AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR, variables: { userId: user.id } };

	const closeModal = () => setModal({ ...modal, isOpen: false });

	const handleTypeSelect = (selectedType) => {
		setType(selectedType);
		setError(null);
		if (selectedType === "other") {
			setStep("other-form");
		} else if (selectedType === "consult") {
			setStep("consult-client");
		} else {
			setStep("session-project");
		}
	};

	const handleSubmitOther = async (e) => {
		e.preventDefault();
		if (!otherTitle.trim()) {
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
						shopId,
						title: otherTitle,
						description: otherDescription,
						shopCutStatus: "none",
						appointmentStatus: "scheduled",
						appointmentType: "other",
						createdAt: now,
						updatedAt: now,
						appointmentDate: UtilsService.formatDateToISO(startDateTime),
					},
				},
				refetchQueries: [appointmentsRefetch],
				awaitRefetchQueries: true,
			});
			closeModal();
		} catch (err) {
			setError(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	const handleSubmitConsult = async (e) => {
		e.preventDefault();
		if (!consultDescription.trim()) {
			setError("Describe the idea first.");
			return;
		}
		let clientFields;
		if (clientMode === "existing") {
			const selected = (clientsData?.getClients || []).find((c) => c.id === existingClientId);
			if (!selected) {
				setError("Pick a client first.");
				return;
			}
			clientFields = {
				firstName: selected.firstName,
				lastName: selected.lastName,
				email: selected.email,
				phone: selected.phone,
			};
		} else {
			if (!newClientFirstName.trim() || !newClientLastName.trim() || !newClientEmail.trim()) {
				setError("First name, last name, and email are required for a new client.");
				return;
			}
			clientFields = {
				firstName: newClientFirstName,
				lastName: newClientLastName,
				email: newClientEmail,
				phone: newClientPhone,
			};
		}
		setSubmitting(true);
		setError(null);
		try {
			const createRes = await createBookingRequest({
				variables: {
					bookingRequestInput: {
						artistId: user.id,
						...clientFields,
						description: consultDescription,
						placement: consultPlacement,
						size: consultSize,
						budget: consultBudget,
						isCoverUp,
					},
				},
			});
			const bookingRequestId = createRes.data.createBookingRequest.id;
			await convertBookingRequest({
				variables: {
					bookingRequestId,
					outcome: "consult_booked",
					appointmentInput: {
						appointmentDate: UtilsService.formatDateToISO(startDateTime),
						shopCutStatus: "unpaid",
						appointmentStatus: "scheduled",
					},
				},
				refetchQueries: [appointmentsRefetch],
				awaitRefetchQueries: true,
			});
			closeModal();
		} catch (err) {
			setError(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	const handleSubmitSession = async (e) => {
		e.preventDefault();
		let projectId = existingProjectId;
		if (projectMode === "new") {
			if (!newProjectTitle.trim() || !newProjectDescription.trim() || !newProjectClientId) {
				setError("Title, description, and client are all required for a new project.");
				return;
			}
		} else if (!existingProjectId) {
			setError("Pick a project first.");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			if (projectMode === "new") {
				const projectRes = await createProject({
					variables: {
						title: newProjectTitle,
						description: newProjectDescription,
						artistId: user.id,
						clientId: newProjectClientId,
						status: "open",
					},
				});
				projectId = projectRes.data.createProject.id;
			}
			const now = UtilsService.formatDateToISO(Date.now());
			await createAppointment({
				variables: {
					appointmentInput: {
						projectId,
						userId: user.id,
						shopId,
						shopCutStatus: "unpaid",
						appointmentStatus: "scheduled",
						appointmentType: "session",
						createdAt: now,
						updatedAt: now,
						appointmentDate: UtilsService.formatDateToISO(startDateTime),
					},
				},
				refetchQueries: [appointmentsRefetch],
				awaitRefetchQueries: true,
			});
			closeModal();
		} catch (err) {
			setError(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	if (step === "type") {
		return (
			<DialogContent dividers>
				<div className="ibCalendarAddEventContainer">
					<p>What are you scheduling?</p>
					<div style={{ display: "flex", gap: 10, marginTop: 10 }}>
						<button type="button" className="ibButton" onClick={() => handleTypeSelect("consult")}>
							Consult
						</button>
						<button type="button" className="ibButton" onClick={() => handleTypeSelect("session")}>
							Session
						</button>
						<button type="button" className="ibButton" onClick={() => handleTypeSelect("other")}>
							Other
						</button>
					</div>
				</div>
			</DialogContent>
		);
	}

	if (step === "other-form") {
		return (
			<form onSubmit={handleSubmitOther}>
				<DialogContent dividers>
					<IBDateTimePicker label="Select Date" val={startDateTime} setVal={setStartDateTime} />
					<IBInput
						helperText="Title"
						placeholder="e.g. Out of office"
						onChange={(e) => setOtherTitle(e.target.value)}
					/>
					<IBMultilineInput
						helperText="Description"
						onChange={(e) => setOtherDescription(e.target.value)}
					/>
					{error && <div className="bookingRequestError">{error}</div>}
				</DialogContent>
				<DialogActions>
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

	if (step === "consult-client") {
		if (clientsLoading) {
			return <IBPageLoader />;
		}
		return (
			<DialogContent dividers>
				<div style={{ display: "flex", gap: 15, marginBottom: 10 }}>
					<label>
						<input
							type="radio"
							checked={clientMode === "existing"}
							onChange={() => setClientMode("existing")}
						/>{" "}
						Existing client
					</label>
					<label>
						<input
							type="radio"
							checked={clientMode === "new"}
							onChange={() => setClientMode("new")}
						/>{" "}
						New client (walk-in)
					</label>
				</div>
				{clientMode === "existing" ? (
					<IBSelect
						data={(clientsData?.getClients || []).map((c) => ({
							value: c.id,
							label: `${c.firstName} ${c.lastName}`,
						}))}
						label="Client"
						selectedVal={existingClientId}
						onChange={(e) => setExistingClientId(e.target.value)}
					/>
				) : (
					<>
						<IBInput helperText="First Name" onChange={(e) => setNewClientFirstName(e.target.value)} />
						<IBInput helperText="Last Name" onChange={(e) => setNewClientLastName(e.target.value)} />
						<IBInput helperText="Email" type="email" onChange={(e) => setNewClientEmail(e.target.value)} />
						<IBInput helperText="Phone (optional)" onChange={(e) => setNewClientPhone(e.target.value)} />
					</>
				)}
				{error && <div className="bookingRequestError">{error}</div>}
				<DialogActions>
					<button type="button" className="ibButton" onClick={() => setStep("type")}>
						Back
					</button>
					<button
						type="button"
						className="ibButton"
						onClick={() => {
							setError(null);
							setStep("consult-details");
						}}
					>
						Next
					</button>
				</DialogActions>
			</DialogContent>
		);
	}

	if (step === "consult-details") {
		return (
			<DialogContent dividers>
				<IBMultilineInput
					helperText="What's the idea? (required)"
					onChange={(e) => setConsultDescription(e.target.value)}
				/>
				<IBInput helperText="Placement" onChange={(e) => setConsultPlacement(e.target.value)} />
				<IBInput helperText="Size" onChange={(e) => setConsultSize(e.target.value)} />
				<IBInput helperText="Budget" onChange={(e) => setConsultBudget(e.target.value)} />
				<label style={{ display: "block", marginTop: 10 }}>
					<input type="checkbox" checked={isCoverUp} onChange={(e) => setIsCoverUp(e.target.checked)} />{" "}
					Cover-up / touch-up
				</label>
				{error && <div className="bookingRequestError">{error}</div>}
				<DialogActions>
					<button type="button" className="ibButton" onClick={() => setStep("consult-client")}>
						Back
					</button>
					<button
						type="button"
						className="ibButton"
						onClick={() => {
							if (!consultDescription.trim()) {
								setError("Describe the idea first.");
								return;
							}
							setError(null);
							setStep("consult-datetime");
						}}
					>
						Next
					</button>
				</DialogActions>
			</DialogContent>
		);
	}

	if (step === "consult-datetime") {
		return (
			<form onSubmit={handleSubmitConsult}>
				<DialogContent dividers>
					<IBDateTimePicker label="Select Date" val={startDateTime} setVal={setStartDateTime} />
					{error && <div className="bookingRequestError">{error}</div>}
				</DialogContent>
				<DialogActions>
					<button type="button" className="ibButton" onClick={() => setStep("consult-details")}>
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
		if (projectsLoading || clientsLoading) {
			return <IBPageLoader />;
		}
		return (
			<DialogContent dividers>
				<div style={{ display: "flex", gap: 15, marginBottom: 10 }}>
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
				{projectMode === "existing" ? (
					<IBProjectsByArtistSelect
						data={projectsData?.getProjectsByArtist || []}
						label="Project"
						selectedVal={existingProjectId}
						onChange={(e) => setExistingProjectId(e.target.value)}
					/>
				) : (
					<>
						{/* New-project client is limited to an existing Client record for now - a
						    brand-new client belongs in the Consult path above (which properly runs
						    through the find-or-create-by-email pipeline) or the Clients page,
						    rather than duplicating that logic a second time here. */}
						<IBSelect
							data={(clientsData?.getClients || []).map((c) => ({
								value: c.id,
								label: `${c.firstName} ${c.lastName}`,
							}))}
							label="Client"
							selectedVal={newProjectClientId}
							onChange={(e) => setNewProjectClientId(e.target.value)}
						/>
						<IBInput helperText="Project Title" onChange={(e) => setNewProjectTitle(e.target.value)} />
						<IBMultilineInput
							helperText="Description"
							onChange={(e) => setNewProjectDescription(e.target.value)}
						/>
					</>
				)}
				{error && <div className="bookingRequestError">{error}</div>}
				<DialogActions>
					<button type="button" className="ibButton" onClick={() => setStep("type")}>
						Back
					</button>
					<button
						type="button"
						className="ibButton"
						onClick={() => {
							if (projectMode === "existing" && !existingProjectId) {
								setError("Pick a project first.");
								return;
							}
							if (
								projectMode === "new" &&
								(!newProjectTitle.trim() || !newProjectDescription.trim() || !newProjectClientId)
							) {
								setError("Title, description, and client are all required.");
								return;
							}
							setError(null);
							setStep("session-datetime");
						}}
					>
						Next
					</button>
				</DialogActions>
			</DialogContent>
		);
	}

	if (step === "session-datetime") {
		return (
			<form onSubmit={handleSubmitSession}>
				<DialogContent dividers>
					<IBDateTimePicker label="Select Date" val={startDateTime} setVal={setStartDateTime} />
					{error && <div className="bookingRequestError">{error}</div>}
				</DialogContent>
				<DialogActions>
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
