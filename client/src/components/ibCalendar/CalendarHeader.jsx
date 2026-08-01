import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { Fab } from "@mui/material";
import moment from "moment";
import { useCalendar } from "../../context/calendar";
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
			<Fab
				size="small"
				sx={{
					marginRight: "5px",
					backgroundColor: "#ddd",
					color: "#333",
					"&:hover": {
						color: "#ddd",
						backgroundColor: "#333",
					},
				}}
				onClick={handlePrevMonth}
			>
				<ChevronLeft />
			</Fab>
			<Fab
				size="small"
				sx={{
					backgroundColor: "#ddd",
					color: "#333",
					"&:hover": {
						color: "#ddd",
						backgroundColor: "#333",
					},
				}}
				onClick={handleNextMonth}
			>
				<ChevronRight />
			</Fab>
			<h2 className="ibCalendarCurrentMonthYear">
				{moment(new Date(moment().year(), monthIndex)).format(
					"MMMM YYYY"
				)}
			</h2>
		</header>
	);
};

export default CalendarHeader;
