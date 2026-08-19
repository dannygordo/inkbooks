import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import moment from "moment";
import { Button } from "@mui/material";
import { Add } from "@mui/icons-material";
import ClientService from "../../services/ClientService";
import FormService from "../../services/FormService";
import FormFillOut from "../forms/FormFillOut";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import IBMultilineInput from "../inputs/IBMultilineInput";
import EntityListPager from "../entityList/EntityListPager";
import SendAutoResponseButton from "../autoResponses/SendAutoResponseButton";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { formatCents } from "../../utils/money";
import { businessScopeFor } from "../../utils/businessScope";
import "./clientDashboard.css";

// Projects and appointments are real server-paged connections now (Client.projects/appointments
// in typeDefs.js take page: PageInput and return a *Page) - a client with years of history used
// to ship every project and every appointment it ever had on every dashboard visit, then get
// paged in the browser over an array that was already fully downloaded. Notes are the one list
// still paged client-side below - see buildClientSidePageInfo's own comment on why that one
// stayed as-is.
const DASHBOARD_LIST_PAGE_SIZE = 10;
const DASHBOARD_LIST_PAGE_SIZE_OPTIONS = [10, 25, 50];

/**
 * Turns a plain in-memory array + an offset/limit into the {totalCount, hasMore, limit, offset}
 * shape EntityListPager expects from a server response.
 *
 * Only NOTES still needs this. Notes are embedded sub-documents on Client (see models/Client.js),
 * not a separate collection paginate() can query with its own skip/limit - turning them into a
 * real paged connection would mean either a Mongo $slice-based resolver or splitting them into
 * their own collection, neither of which this pass touches. A shop's notes on one client are also
 * the smallest of the three lists in practice (they're typed by hand, not generated per session),
 * so the download-everything cost this same fix removed from projects/appointments is much
 * smaller here to begin with.
 */
const buildClientSidePageInfo = (fullLength, offset, limit) => ({
	totalCount: fullLength,
	hasMore: offset + limit < fullLength,
	limit,
	offset,
});

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
	const { user, setAlert, modal, setModal } = useAuth();
	// Published forms this viewer's own shop/artist scope owns - only meaningful for the staff/
	// artist view (see this file's own header comment on why Notes/Flags are also !isSelf-only):
	// businessScopeFor(user) resolves to the LOGGED-IN staff/artist's own scope, which is correct
	// here (they're the one who'd be sending a waiver), but would be nonsense on a client's own
	// dashboard - a client has no shop/artist scope of their own to look up forms by. Self-service
	// fill-out (a client filling out their own copy of a form) isn't wired up from here - see
	// HANDOFF.md.
	const scope = businessScopeFor(user);
	const { data: formsData } = FormService.getForms(scope, "published", { limit: 25, offset: 0 }, {
		skip: isSelf,
	});
	const [newNote, setNewNote] = useState("");
	const [showNoteForm, setShowNoteForm] = useState(false);
	const [projectsOffset, setProjectsOffset] = useState(0);
	const [projectsPageSize, setProjectsPageSize] = useState(DASHBOARD_LIST_PAGE_SIZE);
	const [appointmentsOffset, setAppointmentsOffset] = useState(0);
	const [appointmentsPageSize, setAppointmentsPageSize] = useState(DASHBOARD_LIST_PAGE_SIZE);
	const [notesOffset, setNotesOffset] = useState(0);
	const [notesPageSize, setNotesPageSize] = useState(DASHBOARD_LIST_PAGE_SIZE);
	const [showFlagForm, setShowFlagForm] = useState(false);
	const [flagTypeKey, setFlagTypeKey] = useState("");
	const [flagNote, setFlagNote] = useState("");
	const { loading, data } = ClientService.fetchClientDashboard(
		clientId,
		{ limit: projectsPageSize, offset: projectsOffset },
		{ limit: appointmentsPageSize, offset: appointmentsOffset }
	);
	const [updateClientNotes, { loading: savingNote }] = useMutation(
		ClientService.UPDATE_CLIENT_NOTES
	);
	// See models/ClientFlag.js: flags are shop-side only, same rule as notes - skipped entirely on
	// the client's own view rather than fetched and hidden, since there's no picker to show them.
	const { data: flagTypesData } = ClientService.getClientFlagTypes(undefined, { skip: isSelf });
	const [raiseClientFlag, { loading: savingFlag }] = useMutation(ClientService.RAISE_CLIENT_FLAG);

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
	const projects = client.projects?.items || [];
	const projectsPageInfo = client.projects?.pageInfo;
	const appointments = client.appointments?.items || [];
	const appointmentsPageInfo = client.appointments?.pageInfo;
	const notes = client.notes || [];
	const flags = client.flags || [];
	// systemGenerated types (NO_SHOWED) are excluded from the picker - they can only ever be
	// raised by an appointment's own status changing (utils/client-flags.js's syncNoShowFlag), and
	// raiseClientFlag itself refuses one typed in by hand. Offering it in this list would just be
	// an option that always fails.
	const manualFlagTypes = (flagTypesData?.getClientFlagTypes || []).filter(
		(type) => !type.systemGenerated
	);

	// Every figure below comes from Client.stats (server-side aggregation over the client's FULL
	// history, see resolvers/index.js) rather than being derived from the `projects`/
	// `appointments` arrays above - those two are now one page each, and summing a page would
	// make "Total spent" quietly wrong for anyone with more than one page of history.
	const stats = client.stats || {
		totalSpentCents: 0,
		totalTipsCents: 0,
		averageTipCents: 0,
		tippedSessionCount: 0,
		completedSessionCount: 0,
		projectCount: 0,
		upcomingAppointmentCount: 0,
	};

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

	const handleRaiseFlag = async (e) => {
		e.preventDefault();
		if (!flagTypeKey) {
			return;
		}
		try {
			await raiseClientFlag({
				variables: { input: { clientId, typeKey: flagTypeKey, note: flagNote.trim() } },
				// raiseClientFlag returns the new ClientFlag on its own, not the whole Client, so
				// there's no field on the response matching Client's cache entry for Apollo to merge
				// automatically. cache.modify prepends it into the SAME cached Client.flags array
				// this component reads - update it here, once, rather than reaching for a refetch or
				// a piece of component state that would drift from the cache the next time this
				// query's own cache-and-network refetch lands.
				update: (cache, { data: mutationData }) => {
					const newFlag = mutationData?.raiseClientFlag;
					if (!newFlag) {
						return;
					}
					// toReference(..., true) both writes newFlag into the normalized store as its own
					// ClientFlag:<id> entity (it already has __typename + id from the mutation
					// response) and hands back the Reference this field wants, rather than embedding
					// the raw object where a reference belongs.
					const newFlagRef = cache.toReference(newFlag, true);
					cache.modify({
						id: cache.identify({ __typename: "Client", id: clientId }),
						fields: {
							flags: (existing = []) => [newFlagRef, ...existing],
						},
					});
				},
			});
			setFlagTypeKey("");
			setFlagNote("");
			setShowFlagForm(false);
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
					<div className="clientStatValue">{formatCents(stats.totalSpentCents)}</div>
					<div className="clientStatSubLabel">
						across {stats.completedSessionCount} completed session
						{stats.completedSessionCount === 1 ? "" : "s"}
					</div>
				</div>
				<div className="clientStatCard">
					<div className="clientStatLabel">
						{isSelf ? "Total tipped" : "Total tips"}
					</div>
					<div className="clientStatValue">{formatCents(stats.totalTipsCents)}</div>
				</div>
				<div className="clientStatCard">
					<div className="clientStatLabel">Average tip</div>
					<div className="clientStatValue">{formatCents(stats.averageTipCents)}</div>
					<div className="clientStatSubLabel">
						across {stats.tippedSessionCount} tipped session
						{stats.tippedSessionCount === 1 ? "" : "s"}
					</div>
				</div>
				<div className="clientStatCard">
					<div className="clientStatLabel">Projects</div>
					<div className="clientStatValue">{stats.projectCount}</div>
				</div>
				<div className="clientStatCard">
					<div className="clientStatLabel">Upcoming</div>
					<div className="clientStatValue">{stats.upcomingAppointmentCount}</div>
				</div>
			</div>

			{/* Staff/artist view only - same rule as Notes/Flags below. A client sending themselves
			    an Auto-Response isn't a real action, and SendAutoResponseButton renders nothing
			    anyway once nobody can be sending on this viewer's own behalf (see that component's
			    own comment). */}
			{!isSelf && (
				<div className="clientDashboardSendAutoResponse">
					<SendAutoResponseButton clientId={clientId} />
				</div>
			)}

			<IBCardWrapper>
				<h2 className="clientDashboardSectionTitle">Projects</h2>
				{projects.length === 0 ? (
					<p className="clientDashboardEmpty">No projects yet.</p>
				) : (
					<>
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
						<EntityListPager
							pageInfo={projectsPageInfo}
							onChange={setProjectsOffset}
							onPageSizeChange={(size) => {
								setProjectsPageSize(size);
								setProjectsOffset(0);
							}}
							pageSizeOptions={DASHBOARD_LIST_PAGE_SIZE_OPTIONS}
							noun="project"
						/>
					</>
				)}
			</IBCardWrapper>

			<IBCardWrapper>
				<h2 className="clientDashboardSectionTitle">Appointments</h2>
				{appointments.length === 0 ? (
					<p className="clientDashboardEmpty">No appointments yet.</p>
				) : (
					<>
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
						<EntityListPager
							pageInfo={appointmentsPageInfo}
							onChange={setAppointmentsOffset}
							onPageSizeChange={(size) => {
								setAppointmentsPageSize(size);
								setAppointmentsOffset(0);
							}}
							pageSizeOptions={DASHBOARD_LIST_PAGE_SIZE_OPTIONS}
							noun="appointment"
						/>
					</>
				)}
			</IBCardWrapper>

			{/* Staff/artist view only - see this file's own header comment on why. Task #146: the
			    authenticated "staff filling this out on a client's behalf" path - see
			    components/forms/FormFillOut.jsx and resolvers/forms.js's submitFormResponse for the
			    clientId branch this drives. Only PUBLISHED forms are offered (submitFormResponse
			    itself refuses anything else), and only this viewer's own shop/artist scope's forms -
			    a shop-connected artist sees their shop's forms, an independent artist sees their own. */}
			{!isSelf && (formsData?.getForms?.items || []).length > 0 && (
				<IBCardWrapper>
					<h2 className="clientDashboardSectionTitle">Forms</h2>
					<p className="clientDashboardNotesHint">
						Send a waiver, consent form, or intake questionnaire - fill it out here on
						their behalf, or read it to them and enter what they say.
					</p>
					<ul className="clientDashboardList">
						{formsData.getForms.items.map((form) => (
							<li key={form.id} className="clientDashboardListRow">
								<span className="clientDashboardListPrimary">{form.title}</span>
								<Button
									size="small"
									onClick={() =>
										setModal({
											isOpen: true,
											title: form.title,
											content: (
												<FormFillOut
													formId={form.id}
													clientId={clientId}
													onSubmitted={() => {
														setModal({ ...modal, isOpen: false });
														setAlert({
															isAlert: true,
															severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
															message: "Response submitted.",
															timeout: ALERT_CONSTANTS.TIMEOUT,
															location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
														});
													}}
													onCancel={() => setModal({ ...modal, isOpen: false })}
												/>
											),
										})
									}
								>
									Fill Out
								</Button>
							</li>
						))}
					</ul>
				</IBCardWrapper>
			)}

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
								disabled={savingNote || !newNote.trim()}
							>
								Save note
							</Button>
						</form>
					)}

					{notes.length === 0 ? (
						<p className="clientDashboardEmpty">No notes yet.</p>
					) : (
						(() => {
							const sortedNotes = [...notes].sort(
								(a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
							);
							return (
								<>
									<ul className="clientDashboardList">
										{sortedNotes
											.slice(notesOffset, notesOffset + notesPageSize)
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
									<EntityListPager
										pageInfo={buildClientSidePageInfo(
											sortedNotes.length,
											notesOffset,
											notesPageSize
										)}
										onChange={setNotesOffset}
										onPageSizeChange={(size) => {
											setNotesPageSize(size);
											setNotesOffset(0);
										}}
										pageSizeOptions={DASHBOARD_LIST_PAGE_SIZE_OPTIONS}
										noun="note"
									/>
								</>
							);
						})()
					)}
				</IBCardWrapper>
			)}

			{/* Shop-side only, same rule as Notes above - see models/ClientFlag.js's own
			    "NEVER CLIENT-VISIBLE" comment. */}
			{!isSelf && (
				<IBCardWrapper>
					<div className="clientDashboardNotesHeader">
						<h2 className="clientDashboardSectionTitle">Flags</h2>
						<Button
							size="small"
							startIcon={<Add />}
							onClick={() => setShowFlagForm((open) => !open)}
						>
							{showFlagForm ? "Cancel" : "Add flag"}
						</Button>
					</div>
					<p className="clientDashboardNotesHint">
						A candid record about this client's conduct - never shown to them.
					</p>

					{showFlagForm && (
						<form className="clientDashboardFlagForm" onSubmit={handleRaiseFlag}>
							<select
								className="clientDashboardFlagTypeSelect"
								value={flagTypeKey}
								onChange={(e) => setFlagTypeKey(e.target.value)}
							>
								<option value="">Select a flag type...</option>
								{manualFlagTypes.map((type) => (
									<option key={type.key} value={type.key}>
										{type.label}
									</option>
								))}
							</select>
							<IBMultilineInput
								id="newClientFlagNote"
								label="Note (optional)"
								helperText=" "
								defaultValue=""
								onChange={(e) => setFlagNote(e.target.value)}
							/>
							<Button type="submit" variant="contained" disabled={savingFlag || !flagTypeKey}>
								Save flag
							</Button>
						</form>
					)}

					{flags.length === 0 ? (
						<p className="clientDashboardEmpty">No flags on this client.</p>
					) : (
						<ul className="clientDashboardList">
							{flags.map((flag) => (
								<li key={flag.id} className="clientDashboardNoteRow">
									<p className="clientDashboardNoteBody">
										{flag.type?.label || flag.typeKey}
										{flag.systemGenerated ? " (automatic)" : ""}
									</p>
									{flag.note && <p className="clientDashboardFlagNote">{flag.note}</p>}
									<span className="clientDashboardListMeta">
										{flag.createdBy
											? `${flag.createdBy.firstName} ${flag.createdBy.lastName}`
											: "System"}
										{flag.createdAt
											? ` - ${moment(flag.createdAt).format("MMM D, YYYY")}`
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
