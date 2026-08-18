// React imported explicitly: under Vitest, @vitejs/plugin-react compiles JSX with the CLASSIC
// runtime, so a component rendered by a test needs React in scope or it throws "React is not
// defined" - in that test's file, not this one. See vite.config.js and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { Checkbox, FormControlLabel } from "@mui/material";
import { useCalendar } from "../../context/calendar";
import "./myCalendarsFilter.css";

/**
 * "My Calendars" - the two checkboxes that filter both the appointments LIST and the CALENDAR
 * view between the shop's calendar and this user's own private one (see models/Appointment.js's
 * isPersonal). One component rather than one per view, because the state it reads/writes
 * (context/calendar.jsx's calendarFilters) is shared - unchecking "Personal" on the list and
 * switching to the calendar has to stay unchecked, not reset.
 *
 * The Shop checkbox only renders when there IS a shop calendar to filter - an independent artist
 * has no second bucket for it to toggle, and a checkbox that always does nothing reads as broken,
 * not as a real control.
 */
const MyCalendarsFilter = ({ hasShop }) => {
	const { calendarFilters, setCalendarFilters } = useCalendar();

	const toggle = (key) => (e) => {
		setCalendarFilters((prev) => ({ ...prev, [key]: e.target.checked }));
	};

	return (
		<div className="myCalendarsFilter">
			<span className="myCalendarsFilterLabel">My Calendars</span>
			{hasShop && (
				<FormControlLabel
					control={
						<Checkbox
							size="small"
							checked={calendarFilters.shop}
							onChange={toggle("shop")}
						/>
					}
					label="Shop"
				/>
			)}
			<FormControlLabel
				control={
					<Checkbox
						size="small"
						checked={calendarFilters.personal}
						onChange={toggle("personal")}
					/>
				}
				label="Personal"
			/>
		</div>
	);
};

export default MyCalendarsFilter;
