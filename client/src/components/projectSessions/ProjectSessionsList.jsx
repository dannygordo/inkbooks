import { useState } from "react";
import moment from "moment";
import { useMutation } from "@apollo/client";
import { Button } from "@mui/material";
import { Add } from "@mui/icons-material";
import { AppointmentService } from "../../services/AppointmentService";
import ArtistShopConnectionService from "../../services/ArtistShopConnectionService";
import { useAuth } from "../../context/auth";
import AppointmentSlotPicker from "../appointments/AppointmentSlotPicker";
import { SESSION_DEFAULT_MINUTES } from "../appointments/DurationPicker";
import SessionDetail from "./SessionDetail";
import { formatCents } from "../../utils/money";
import { ALERT_CONSTANTS } from "../../constants";
import "./projectSessions.css";

/**
 * Renders inside Project.jsx (see that file's "Sessions" IBCardWrapper) - every session-type
 * appointment tied to this project (see server/graphql/resolvers/appointments.js's
 * getAppointmentsByProject), most recent first, with "+ Add Session" to schedule another one
 * directly against this project - previously the only way to add a session was the calendar's
 * "Create Event" wizard, which meant leaving the project just to book its next sitting.
 *
 * Clicking a row opens SessionDetail in the global modal with the timer/notes/total UI, plus
 * (since this fix) the session's own editable date/time and a Delete action - see that
 * component's own comment on why both were missing before.
 */
const ProjectSessionsList = ({ project }) => {
	const { setModal, modal, setAlert } = useAuth();
	const { data, loading, refetch } = AppointmentService.getAppointmentsByProject(project?.id);
	// Needed for SessionDetail's rate calculation (see utils/sessionRate.js) - which side's rate
	// (shop's or the artist's own) applies. Only relevant when the project's artist is actually
	// shop-connected; fetchArtistShopConnections already skip-guards on a falsy artistId.
	const { data: connectionsData } = ArtistShopConnectionService.fetchArtistShopConnections(
		project?.artistId
	);
	const connections = connectionsData?.getArtistShopConnections || [];

	const [showAddForm, setShowAddForm] = useState(false);
	const [newSessionDate, setNewSessionDate] = useState(moment());
	const [durationMinutes, setDurationMinutes] = useState(SESSION_DEFAULT_MINUTES);
	const [addError, setAddError] = useState(null);
	const [createAppointment, { loading: adding }] = useMutation(AppointmentService.CREATE_APPOINTMENT);

	const handleOpenSession = (appointment) => {
		setModal({
			isOpen: true,
			// Time is just as important as the date here - LLL (not LL) includes it, matching
			// what the row itself now shows below.
			title: `Session - ${moment(appointment.appointmentDate).format("LLL")}`,
			content: (
				<SessionDetail
					appointment={appointment}
					project={project}
					connections={connections}
					onClosed={() => {
						setModal({ ...modal, isOpen: false });
						refetch();
					}}
					onDeleted={() => {
						setModal({ ...modal, isOpen: false });
						refetch();
					}}
				/>
			),
		});
	};

	const handleAddSession = async (e) => {
		e.preventDefault();
		setAddError(null);
		try {
			const now = new Date().toISOString();
			// Same shape as the calendar wizard's "session against an existing project" path (see
			// AppointmentWizard.jsx's handleSubmitExistingProjectSession) - userId/shopId come from
			// the Project itself (its own artist and, if any, that artist's shop), not the person
			// currently viewing this page, since a shop admin/staff member can view and add a
			// session to another artist's project.
			await createAppointment({
				variables: {
					appointmentInput: {
						projectId: project.id,
						userId: project.artistId,
						shopId: project.artist?.shop?.id,
						title: project.title,
						appointmentType: "session",
						shopCutStatus: project.artist?.shop?.id ? "unpaid" : "none",
						appointmentStatus: "scheduled",
						createdAt: now,
						updatedAt: now,
						appointmentDate: moment(newSessionDate).toISOString(),
						durationMinutes,
					},
				},
			});
			setShowAddForm(false);
			refetch();
		} catch (err) {
			setAddError(err.graphQLErrors?.[0]?.message || err.message);
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MODAL,
			});
		}
	};

	if (loading) {
		return <div className="projectSessionsEmpty">Loading sessions...</div>;
	}

	const sessions = (data?.getAppointmentsByProject || [])
		.slice()
		.sort((a, b) => new Date(b.appointmentDate) - new Date(a.appointmentDate));

	return (
		<div className="projectSessionsList">
			{sessions.length === 0 && !showAddForm && (
				<div className="projectSessionsEmpty">No sessions yet.</div>
			)}
			{sessions.map((session) => (
				<div
					key={session.id}
					className="projectSessionRow"
					onClick={() => handleOpenSession(session)}
				>
					<div className="projectSessionRowInfo">
						{/* Was LL (date only) - the time is just as important for a booked session
						    as the date, and previously wasn't shown here at all. */}
						<span className="projectSessionRowDate">
							{moment(session.appointmentDate).format("LLL")}
						</span>
						<span className="projectSessionRowMeta">
							{session.appointmentStatus === "completed" ? "Completed" : "Open"}
							{/* totalCents, not the old whole-dollar `total` - this row would
							    otherwise render 45000 as "$45000". */}
							{session.totalCents ? ` - ${formatCents(session.totalCents)}` : ""}
							{session.tipCents
								? ` (incl. ${formatCents(session.tipCents)} tip)`
								: ""}
						</span>
					</div>
				</div>
			))}

			{showAddForm ? (
				<form className="projectSessionAddForm" onSubmit={handleAddSession}>
					{/* Keyed to the PROJECT'S artist, not the viewer - a shop admin adding a session to
					    someone else's project needs to see THAT artist's day, which is the same reason
					    userId below comes from the project. */}
					<AppointmentSlotPicker
						label="Session date & time"
						date={newSessionDate}
						onDateChange={setNewSessionDate}
						durationMinutes={durationMinutes}
						onDurationChange={setDurationMinutes}
						artistUserId={project.artistId}
					/>
					{addError && <div className="bookingRequestError">{addError}</div>}
					<div className="projectSessionAddFormButtons">
						<Button type="submit" variant="contained" disabled={adding}>
							{adding ? "Saving..." : "Save"}
						</Button>
						<Button type="button" onClick={() => setShowAddForm(false)} disabled={adding}>
							Cancel
						</Button>
					</div>
				</form>
			) : (
				<Button
					startIcon={<Add />}
					size="small"
					sx={{ alignSelf: "flex-start" }}
					onClick={() => {
						setNewSessionDate(moment());
						setShowAddForm(true);
					}}
				>
					Add Session
				</Button>
			)}
		</div>
	);
};

export default ProjectSessionsList;
