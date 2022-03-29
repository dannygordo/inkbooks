import "./ibCalendar.css";
import moment from "moment";
import { useCalendar } from "../../context/calendar";
import { useAuth } from "../../context/auth";
import CreateEventDialog from "./CreateEventDialog";
import { useEffect, useState } from "react";
import UpdateEventDialog from "./UpdateEventDialog";
import { Tooltip } from "@mui/material";

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
		console.log(evt);
		if (evt.userId === user.id) {
			setModal({
				isOpen: true,
				title: `Update Appointment for ${day.format("LL")}`,
				content: <UpdateEventDialog selectedDay={day} event={evt} />,
			});
		}
	};

	const handleCreateEvent = (e) => {
		e.preventDefault();
		setDaySelected(day);
		setModal({
			isOpen: true,
			title: `Appointment for ${day.format("LL")}`,
			content: <CreateEventDialog selectedDay={day} />,
		});
	};
	return (
		<div className="ibCalendarDateCellBody">
			<div className="ibCalendarDateCell">
				<header
					onClick={handleCreateEvent}
					style={{ cursor: "pointer" }}
				>
					{rowIdx === 0 && <p>{day.format("ddd").toUpperCase()}</p>}
					<p className={getCurrentDayClass()}>{day.format("DD")}</p>
				</header>
				<div>
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
											evt.title
									  }`
									: `${moment
											.utc(evt.appointmentDate)
											.format("h:mma")} - ${evt.title}`
							}
						>
							<div
								onClick={(e) => {
									handleUpdateEvent(e, evt);
								}}
								style={{
									backgroundColor: evt.user.tagColor,
									color: "#fff",
									marginBottom: 2,
									fontSize: "12px",
									paddingLeft: 2,
									borderRadius: 3,
									cursor: "pointer",
                                    textAlign: 'left'
								}}
							>
								{evt.projectId ? `${moment
									.utc(evt.appointmentDate)
									.format("h:mma")} ${
                                        evt.project.client.user.firstName
                                    } ${evt.project.client.user.lastName} - ${
									evt.title
								}`: `${moment
									.utc(evt.appointmentDate)
									.format("h:mma")}  - ${
									evt.title
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
