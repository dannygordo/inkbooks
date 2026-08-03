import React from "react";
import moment from "moment";
import { AppointmentService } from "../../services/AppointmentService";
import ArtistShopConnectionService from "../../services/ArtistShopConnectionService";
import { useAuth } from "../../context/auth";
import SessionDetail from "./SessionDetail";
import "./projectSessions.css";

/**
 * Renders inside Project.jsx (see that file's "Sessions" IBCardWrapper) - every session-type
 * appointment tied to this project (see server/graphql/resolvers/appointments.js's
 * getAppointmentsByProject), most recent first. Sessions themselves are created via the
 * appointment wizard's "Session" path (see ibCalendar/AppointmentWizard.jsx), not here - this is
 * a read/reopen view, not a creation form.
 *
 * Clicking a row opens SessionDetail in the global modal with the timer/notes/total UI.
 */
const ProjectSessionsList = ({ project }) => {
	const { setModal, modal } = useAuth();
	const { data, loading, refetch } = AppointmentService.getAppointmentsByProject(project?.id);
	// Needed for SessionDetail's rate calculation (see utils/sessionRate.js) - which side's rate
	// (shop's or the artist's own) applies. Only relevant when the project's artist is actually
	// shop-connected; fetchArtistShopConnections already skip-guards on a falsy artistId.
	const { data: connectionsData } = ArtistShopConnectionService.fetchArtistShopConnections(
		project?.artistId
	);
	const connections = connectionsData?.getArtistShopConnections || [];

	const handleOpenSession = (appointment) => {
		setModal({
			isOpen: true,
			title: `Session - ${moment(appointment.appointmentDate).format("LL")}`,
			content: (
				<SessionDetail
					appointment={appointment}
					project={project}
					connections={connections}
					onClosed={() => {
						setModal({ ...modal, isOpen: false });
						refetch();
					}}
				/>
			),
		});
	};

	if (loading) {
		return <div className="projectSessionsEmpty">Loading sessions...</div>;
	}

	const sessions = (data?.getAppointmentsByProject || [])
		.slice()
		.sort((a, b) => new Date(b.appointmentDate) - new Date(a.appointmentDate));

	if (sessions.length === 0) {
		return (
			<div className="projectSessionsEmpty">
				No sessions yet - create one from the calendar's "Create Event" wizard and pick this
				project.
			</div>
		);
	}

	return (
		<div className="projectSessionsList">
			{sessions.map((session) => (
				<div
					key={session.id}
					className="projectSessionRow"
					onClick={() => handleOpenSession(session)}
				>
					<div className="projectSessionRowInfo">
						<span className="projectSessionRowDate">
							{moment(session.appointmentDate).format("LL")}
						</span>
						<span className="projectSessionRowMeta">
							{session.appointmentStatus === "completed" ? "Completed" : "Open"}
							{session.total ? ` - $${session.total}` : ""}
						</span>
					</div>
				</div>
			))}
		</div>
	);
};

export default ProjectSessionsList;
