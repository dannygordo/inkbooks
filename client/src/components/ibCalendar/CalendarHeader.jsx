import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { IconButton } from "@mui/material";
import moment from "moment";
import { useCalendar } from "../../context/calendar";
import CreateEventButton from "./CreateEventButton";
import "./ibCalendar.css";

const CalendarHeader = () => {
	const { monthIndex, setMonthIndex } = useCalendar();

	const handlePrevMonth = (e) => {
		setMonthIndex(monthIndex - 1);
	};

	const handleNextMonth = (e) => {
		setMonthIndex(monthIndex + 1);
	};

	const handleToday = () => {
		setMonthIndex(
			monthIndex === moment().month()
				? monthIndex + Math.random()
				: moment().month()
		);
	};

	return (
		<header className="ibCalendarHeader">
			<button onClick={handleToday} className="ibCalendarTodayButton">
				Today
			</button>
			{/* Was a Fab with a hardcoded #ddd/#333 sx block that inverted on hover - same bug as the
			    old Create Event Fab (see CreateEventButton.jsx's own comment), just never caught in
			    that pass because these two sit in CalendarHeader.jsx, not that file. A plain
			    IconButton with no color override picks up the theme's text color and MUI's own
			    hover treatment automatically, so it repaints with the rest of the app on a
			    light/dark switch instead of staying gray forever. */}
			<IconButton
				size="small"
				sx={{ marginRight: "5px", color: "var(--ib-text-secondary)" }}
				onClick={handlePrevMonth}
			>
				<ChevronLeft />
			</IconButton>
			<IconButton
				size="small"
				sx={{ color: "var(--ib-text-secondary)" }}
				onClick={handleNextMonth}
			>
				<ChevronRight />
			</IconButton>
			<h2 className="ibCalendarCurrentMonthYear">
				{moment(new Date(moment().year(), monthIndex)).format(
					"MMMM YYYY"
				)}
			</h2>
			{/* Was in a sidebar next to the grid (see Sidebar.jsx, now removed) - moved here and
			    pushed to the far right via .ibCalendarHeader .ibCalendarCreateEventButton's own
			    margin-left: auto (see ibCalendar.css), the standard "last flex child eats the
			    remaining space" push rather than a wrapping div, so it doesn't disturb the
			    space-between-free flow the Today/prev/next/title group already has. */}
			<CreateEventButton />
		</header>
	);
};

export default CalendarHeader;
