import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import moment from "moment";
import { Button } from "@mui/material";
import { Add } from "@mui/icons-material";
import ClientService from "../../services/ClientService";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import IBMultilineInput from "../inputs/IBMultilineInput";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { formatCents } from "../../utils/money";
import "./clientDashboard.css";

/**
 * The client view, mounted in two places with different scoping - the same approach
 * ArtistPerformancePanel already takes (see PRODUCTION_ROADMAP.md's writeup on why that data
 * lives in two places rather than being built twice):
 *
 *   pages/clients/Client.jsx  - an artist or staff member looking at one of their clients.
 *   pages/home/Home.jsx       - a logged-in client looking at their own record. Clients
 *                               previously saw nothing here but a greeting.
 *
 * The two views are NOT identical, and the difference is deliberate rather than incidental:
 *
 *   - Notes are shop-side only. A note like "cancels a lot" or "needed a break every 20 minutes"
 *     is worth writing precisely because it's a candid internal record; showing it to its subject
 *     turns it into a message and it stops getting written honestly. The server enforces this
 *     too - updateClientNotes refuses a client editing their own record (see
 *     mutations/clients.js), so hiding the section here is presentation, not the boundary.
 *   - The framing of the money differs. "Total spent" is what a client wants to see about
 *     themselves; an artist looking at that same client is really asking "what is this
 *     relationship worth", which is the same number with different weight. Same figures, labels
 *     written for whoever is reading.
 *
 * Props:
 * - clientId: the Client document's own _id (NOT the client's User._id - see the Client.projects
 *   resolver in server/graphql/resolvers/index.js for why that distinction bites).
 * - isSelf: true when the viewer is the client themselves.
 */
const ClientDashboard = ({ clientId, isSelf = false }) => {
	const { user, setAlert } = useAuth();
	const { loading, data } = ClientService.fetchClientDashboard(clientId);
	const [newNote, setNewNote] = useState("");
	const [showNoteForm, setShowNoteForm] = useState(false);
	const [updateClientNotes, { loading: savingNote }] = useMutation(
		ClientService.UPDATE_CLIENT_NOTES
	);

	// `loading` alone would flash the spinner on every background refetch, because the query runs
	// cache-and-network. Gating on "loading AND nothing cached yet" keeps the first load behaving
	// as before without the content disappearing underneath the reader on every revisit.
	if (loading && !data) {
		return <IBPageLoader />;
	}
	if (!data || !data.getClient) {
		return null;
	}

	const client = data.getClient;
	const projects = client.projects || [];
	const appointments = client.appointments || [];
	const notes = client.notes || [];

	// Only completed sessions count as money spent. A scheduled session has a price attached but
	// nothing has changed hands - counting it would inflate "total spent" with work that hasn't
	// happened and might be cancelled.
	const paidAppointments = appointments.filter(
		(a) => a.appointmentStatus === "completed"
	);

	const totalSpentCents = paidAppointments.reduce(
		(sum, a) => sum + (a.totalCents || 0),
		0
	);
	const totalTipsCents = paidAppointments.reduce(
		(sum, a) => sum + (a.tipCents || 0),
		0
	);
	// Averaged over sessions that were ACTUALLY tipped, not all of them - dividing by every
	// completed session would drag the figure toward zero with untipped ones and answer a
	// different question. Same reasoning as ArtistPerformancePanel's own tip average.
	const tippedAppointments = paidAppointments.filter((a) => (a.tipCents || 0) > 0);
	const averageTipCents = tippedAppointments.length
		? Math.round(totalTipsCents / tippedAppointments.length)
		: 0;

	const upcoming = appointments
		.filter((a) => new Date(a.appointmentDate) >= new Date())
		.sort((a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate));

	const handleAddNote = async (e) => {
		e.preventDefault();
		if (!newNote.trim()) {
			return;
		}
		const now = new Date().toISOString();
		// The mutation replaces the whole array rather than appending - matching how
		// updateProjectNotes already works. The existing notes are re-sent stripped of their
		// __typename: Apollo adds that to every cached object, and sending it back inside an
		// IBNoteInput fails validation with an unhelpful "Field __typename is not defined".
		const existing = notes.map(({ __typename, ...rest }) => rest);
		try {
			await updateClientNotes({
				variables: {
					clientId,
					notes: [
						...existing,
						{
							// The server's IBNote schema requires an id on input. Generated
							// client-side because these are embedded sub-documents being written
							// as a whole array, not individually inserted rows.
							id: `${Date.now()}`,
							author: `${user.firstName} ${user.lastName}`,
							note: newNote.trim(),
							createdAt: now,
							updatedAt: now,
						},
					],
				},
				// The mutation returns the updated notes array and Apollo writes it straight into
				// the cached Client by id, so the list re-renders without a refetch.
				refetchQueries: [],
			});
			setNewNote("");
			setShowNoteForm(false);
		} catch (err) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.graphQLErrors?.[0]?.message || err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}
	};

	return (
		<div className="clientDashboard">
			<div className="clientDashboardStats">
				<div className="clientStatCard">
					<div className="clientStatLabel">
						{isSelf ? "Total spent" : "Lifetime value"}
					</div>
					<div className="clientStatValue">{formatCents(totalSpentCents)}</div>
					<div className="clientStatSubLabel">
						across {paidAppointments.length} completed session
						{paidAppointments.length === 1 ? "" : "s"}
					</div>
				</div>
				<div className="clientStatCard">
					<div className="clientStatLabel">
						{isSelf ? "Total tipped" : "Total tips"}
					</div>
					<div className="clientStatValue">{formatCents(totalTipsCents)}</div>
				</div>
				<div className="clientStatCard">
					<div className="clientStatLabel">Average tip</div>
					<div className="clientStatValue">{formatCents(averageTipCents)}</div>
					<div className="clientStatSubLabel">
						across {tippedAppointments.length} tipped session
						{tippedAppointments.length === 1 ? "" : "s"}
					</div>
				</div>
				<div className="clientStatCard">
					<div className="clientStatLabel">Projects</div>
					<div className="clientStatValue">{projects.length}</div>
				</div>
				<div className="clientStatCard">
					<div className="clientStatLabel">Upcoming</div>
					<div className="clientStatValue">{upcoming.length}</div>
				</div>
			</div>

			<IBCardWrapper>
				<h2 className="clientDashboardSectionTitle">Projects</h2>
				{projects.length === 0 ? (
					<p className="clientDashboardEmpty">No projects yet.</p>
				) : (
					<ul className="clientDashboardList">
						{projects.map((project) => (
							<li key={project.id} className="clientDashboardListRow">
								<span className="clientDashboardListPrimary">
									{project.title || "Untitled project"}
								</span>
								<span className="clientDashboardListMeta">
									{project.status || "unknown"}
									{project.createdAt
										? ` - started ${moment(project.createdAt).format("MMM D, YYYY")}`
										: ""}
								</span>
							</li>
						))}
					</ul>
				)}
			</IBCardWrapper>

			<IBCardWrapper>
				<h2 className="clientDashboardSectionTitle">Appointments</h2>
				{appointments.length === 0 ? (
					<p className="clientDashboardEmpty">No appointments yet.</p>
				) : (
					<ul className="clientDashboardList">
						{appointments.map((appointment) => (
							<li key={appointment.id} className="clientDashboardListRow">
								<span className="clientDashboardListPrimary">
									{appointment.title ||
										appointment.project?.title ||
										"Untitled"}
								</span>
								<span className="clientDashboardListMeta">
									{moment
										.utc(appointment.appointmentDate)
										.format("MMM D, YYYY h:mma")}
									{" - "}
									{appointment.appointmentStatus}
									{appointment.totalCents
										? ` - ${formatCents(appointment.totalCents)}`
										: ""}
									{appointment.tipCents
										? ` (incl. ${formatCents(appointment.tipCents)} tip)`
										: ""}
								</span>
							</li>
						))}
					</ul>
				)}
			</IBCardWrapper>

			{/* Shop-side only. See this file's header comment on why a client doesn't see notes
			    written about them. */}
			{!isSelf && (
				<IBCardWrapper>
					<div className="clientDashboardNotesHeader">
						<h2 className="clientDashboardSectionTitle">Notes</h2>
						<Button
							size="small"
							startIcon={<Add />}
							onClick={() => setShowNoteForm((open) => !open)}
						>
							{showNoteForm ? "Cancel" : "Add note"}
						</Button>
					</div>
					<p className="clientDashboardNotesHint">
						Only visible to you and your shop - never to the client.
					</p>

					{showNoteForm && (
						<form className="clientDashboardNoteForm" onSubmit={handleAddNote}>
							<IBMultilineInput
								id="newClientNote"
								label="New note"
								helperText=" "
								defaultValue=""
								onChange={(e) => setNewNote(e.target.value)}
							/>
							<Button
								type="submit"
								variant="contained"
								sx={{ backgroundColor: "#333" }}
								disabled={savingNote || !newNote.trim()}
							>
								Save note
							</Button>
						</form>
					)}

					{notes.length === 0 ? (
						<p className="clientDashboardEmpty">No notes yet.</p>
					) : (
						<ul className="clientDashboardList">
							{[...notes]
								.sort(
									(a, b) =>
										new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
								)
								.map((note) => (
									<li key={note.id} className="clientDashboardNoteRow">
										<p className="clientDashboardNoteBody">{note.note}</p>
										<span className="clientDashboardListMeta">
											{note.author}
											{note.createdAt
												? ` - ${moment(note.createdAt).format("MMM D, YYYY")}`
												: ""}
										</span>
									</li>
								))}
						</ul>
					)}
				</IBCardWrapper>
			)}
		</div>
	);
};

export default ClientDashboard;
