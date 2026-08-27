import React, { useState } from "react";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ViewListIcon from "@mui/icons-material/ViewList";
import IBCalendar from "../../components/ibCalendar/IBCalendar";
import AppointmentsList from "../../components/appointments/AppointmentsList";
import "./appointments.css";

/**
 * Calendar or list, over the same appointments.
 *
 * Two views rather than one because they answer different questions and neither does the other's
 * job well. A month grid shows shape - which days are busy, where the gaps are - and is how you
 * think about next week. A list shows everything in a window in order, which is how you answer
 * "what did I do last quarter" or "what's coming up", and a calendar is genuinely bad at that: the
 * answer is spread across cells you have to visit one at a time.
 *
 * The view choice is component state, not a route. It is a preference about how to look at one
 * page, not a different page - a separate URL would mean two things to link to and two things to
 * keep in sync, for no gain. The tradeoff is that it resets on reload; worth revisiting only if
 * people turn out to have a strong default, which is a thing to observe rather than guess.
 */
const Appointments = () => {
	const [view, setView] = useState("list");

	return (
		<div className="appointments">
			<div className="appointmentsViewToggle">
				<ToggleButtonGroup
					size="small"
					exclusive
					value={view}
					// null when the active button is clicked again. Ignored, because a toggle with
					// no selection would render a page with neither view on it.
					onChange={(_, next) => next && setView(next)}
					aria-label="Appointment view"
				>
					<ToggleButton value="calendar" aria-label="Calendar view">
						<CalendarMonthIcon fontSize="small" />
						<span className="appointmentsViewToggleLabel">
							Calendar
						</span>
					</ToggleButton>
					<ToggleButton value="list" aria-label="List view">
						<ViewListIcon fontSize="small" />
						<span className="appointmentsViewToggleLabel">
							List
						</span>
					</ToggleButton>
				</ToggleButtonGroup>
			</div>

			{/* Unmounted rather than hidden with CSS. Each view runs its own query - the calendar
			    fetches the month on screen, the list fetches a chosen range - and keeping both
			    mounted would run both on every visit to fill a screen showing one of them. */}
			{view === "list" ? <AppointmentsList /> : <IBCalendar />}
		</div>
	);
};

export default Appointments;
