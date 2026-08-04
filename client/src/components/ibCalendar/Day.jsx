import "./ibCalendar.css";
import moment from "moment";
import { useCalendar } from "../../context/calendar";
import { useAuth } from "../../context/auth";
import AppointmentWizard from "./AppointmentWizard";
import { useEffect, useState } from "react";
import UpdateEventDialog from "./UpdateEventDialog";
import ViewEventDialog from "./ViewEventDialog";
import { Tooltip } from "@mui/material";
import { resolveTagColor } from "../../utils/tagColor";

const Day = ({ day, rowIdx }) => {
	const [dayEvents, setDayEvents] = useState([]);
	const { setDaySelected, filteredEvents } = useCalendar();
	const { setModal, user } = useAuth();

	useEffect(() => {
		const events = filteredEvents.filter(
			(evt) =>
				moment(evt.appointmentDate).format("DD-MM-YY") ===
				day.format("DD-MM-YY")
		);
		setDayEvents(events);
	}, [filteredEvents, day]);

	const getCurrentDayClass = () => {
		return day.format("DD-MM-YY") === moment().format("DD-MM-YY")
			? "ibCalendarToday"
			: "";
	};

	const handleUpdateEvent = (e, evt) => {
		e.preventDefault();
		setDaySelected(day);
		if (evt.userId === user.id) {
			setModal({
				isOpen: true,
				title: `Update Appointment for ${day.format("LL")}`,
				content: <UpdateEventDialog selectedDay={day} event={evt} />,
			});
		} else {
			// A shop-connected artist's calendar shows every artist's appointments at the shop (see
			// getAppointmentsByShop - already shop-wide, not scoped to the caller), not just their
			// own - but they should only ever be able to edit their own. This used to silently do
			// nothing at all when the appointment belonged to someone else, which reads as broken
			// rather than "read-only". ViewEventDialog shows the same details with no edit/delete
			// actions instead.
			setModal({
				isOpen: true,
				title: `Appointment for ${day.format("LL")}`,
				content: <ViewEventDialog event={evt} />,
			});
		}
	};

	const handleCreateEvent = (e) => {
		e.preventDefault();
		setDaySelected(day);
		setModal({
			isOpen: true,
			title: `Appointment for ${day.format("LL")}`,
			content: <AppointmentWizard selectedDay={day} />,
		});
	};
	// Was `evt.title` alone in both branches below - null for any consult/session Appointment
	// created before convertBookingRequest started setting a real title (see that resolver's own
	// comment on why it now does), and a template string interpolates a null value as the literal
	// text "null", not a blank - that's what was actually showing up in this calendar. Falls back
	// to the linked Project's own title (for a session), then a friendly placeholder, so a stale
	// pre-fix record still renders sensibly instead of showing "null".
	const displayTitle = (evt) => evt.title || evt.project?.title || "Untitled";

	return (
		<div className="ibCalendarDateCellBody">
			<div className="ibCalendarDateCell">
				<header
					className="ibCalendarDayHeader"
					onClick={handleCreateEvent}
					style={{ cursor: "pointer" }}
				>
					{rowIdx === 0 && <p>{day.format("ddd").toUpperCase()}</p>}
					<p className={getCurrentDayClass()}>{day.format("DD")}</p>
				</header>
				<div className="ibCalendarDayEvents">
					{dayEvents.map((evt, index) => (
                        
						<Tooltip
							arrow
							placement="top"
							key={index}
							title={
								evt.projectId
									? `${moment
											.utc(evt.appointmentDate)
											.format("h:mma")} ${
                                                evt.project.client.user.firstName
                                            } ${evt.project.client.user.lastName} - ${
											displayTitle(evt)
									  }`
									: `${moment
											.utc(evt.appointmentDate)
											.format("h:mma")} - ${displayTitle(evt)}`
							}
						>
							{/* Everything except backgroundColor moved to .ibCalendarEventChip in
							    ibCalendar.css - backgroundColor has to stay inline because it's the
							    artist's own tagColor, resolved per event at runtime. */}
							<div
								className="ibCalendarEventChip"
								onClick={(e) => {
									handleUpdateEvent(e, evt);
								}}
								style={{ backgroundColor: resolveTagColor(evt.user?.tagColor) }}
							>
								{evt.projectId ? `${moment
									.utc(evt.appointmentDate)
									.format("h:mma")} ${
                                        evt.project.client.user.firstName
                                    } ${evt.project.client.user.lastName} - ${
									displayTitle(evt)
								}`: `${moment
									.utc(evt.appointmentDate)
									.format("h:mma")}  - ${
									displayTitle(evt)
								}`}
							</div>
						</Tooltip>
					))}
				</div>
			</div>
		</div>
	);
};

export default Day;
