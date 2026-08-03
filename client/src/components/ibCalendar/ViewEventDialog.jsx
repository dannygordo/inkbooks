import { DialogActions, DialogContent, Chip } from "@mui/material";
import moment from "moment";
import { useAuth } from "../../context/auth";

/**
 * Read-only counterpart to UpdateEventDialog - opened by Day.jsx's handleUpdateEvent when the
 * clicked appointment belongs to a different artist (evt.userId !== the viewer's own id).
 *
 * Previously, clicking a shop-mate's appointment on the shared shop calendar (see
 * getAppointmentsByShop - already returns every artist's appointments at the shop, not just the
 * caller's own) silently did nothing at all: handleUpdateEvent only ever opened
 * UpdateEventDialog, and only when evt.userId === user.id. That's the right "can't edit someone
 * else's appointment" behavior, but a dead click reads as broken, not as "this is read-only" - and
 * UpdateEventDialog itself isn't safe to just reuse unlocked/readonly for this: it fetches
 * ProjectService.fetchProjectsByArtist(user.id) - the *viewer's own* projects, not the actual
 * appointment owner's - so its project dropdown would show the wrong artist's projects entirely.
 * This is a separate, deliberately minimal component instead: no mutations, no editable fields, no
 * delete/save actions - just enough detail (who, when, what) for a shop-mate to see what's booked.
 */
const ViewEventDialog = ({ event }) => {
	const { setModal, modal } = useAuth();

	// Same fallback chain Day.jsx's own label already uses (see that file's displayTitle comment) -
	// a session inherits its Project's title when Appointment.title itself is unset.
	const displayTitle = event.title || event.project?.title || "Untitled";
	const artistName = `${event.user?.firstName || ""} ${event.user?.lastName || ""}`.trim() || "Artist";
	const clientUser = event.project?.client?.user;

	return (
		<div className="ibCalendarAddEventContainer">
			<DialogContent dividers>
				<div className="viewEventArtistRow">
					<Chip
						label={artistName}
						sx={{ backgroundColor: event.user?.tagColor || "#999", color: "#fff" }}
					/>
					<span className="viewEventType">{event.appointmentType}</span>
				</div>
				<p className="viewEventDate">
					{moment.utc(event.appointmentDate).format("LLL")}
				</p>
				<p className="viewEventTitle">{displayTitle}</p>
				{clientUser && (
					<p className="viewEventClient">
						Client: {clientUser.firstName} {clientUser.lastName}
					</p>
				)}
				{event.description && <p className="viewEventDescription">{event.description}</p>}
				<p className="viewEventReadOnlyNote">
					This is {artistName}'s appointment - you can only edit your own.
				</p>
			</DialogContent>
			<DialogActions>
				<button onClick={() => setModal({ ...modal, isOpen: false })} className="ibButton">
					Close
				</button>
			</DialogActions>
		</div>
	);
};

export default ViewEventDialog;
