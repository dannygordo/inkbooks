import { ChevronLeft, ChevronRight } from "@mui/icons-material";
// experimentalStyled was an alpha-era alias for styled() from early MUI 5 - removed in later
// majors, styled() itself has been the stable name the whole time.
import { styled } from "@mui/material/styles";
import { Fab, Grid, Box, Paper } from "@mui/material";
import moment from "moment";
import React, { useEffect, useState } from "react";
import { useCalendar } from "../../context/calendar";
import UtilsService from "../../services/UtilsService";
import "./ibCalendar.css";

const Item = styled(Paper)(({ theme }) => ({
	backgroundColor: theme.palette.mode === "dark" ? "#1A2027" : "#fff",
	...theme.typography.body2,
	textAlign: "center",
	display: "flex",
	height: "28px",
	marginRight: "10px",
	marginLeft: "5px",
	flexDirection: "column",
	color: theme.palette.text.secondary,
}));

const SmallCalendar = () => {
	const [currentMonthIndex, setCurrentMonthIndex] = useState(
		moment().month()
	);
	const [currentMonth, setCurrentMonth] = useState(UtilsService.getMonth());

	const {
		monthIndex: globalMonthIdx,
		setSmallCalendarMonth,
		daySelected,
		setDaySelected,
	} = useCalendar();

	useEffect(() => {
		setCurrentMonthIndex(globalMonthIdx);
	}, [globalMonthIdx]);

	useEffect(() => {
		setCurrentMonth(UtilsService.getMonth(currentMonthIndex));
	}, [currentMonthIndex]);

	const handlePrevMonth = (e) => {
		setCurrentMonthIndex(currentMonthIndex - 1);
	};

	const handleNextMonth = (e) => {
		setCurrentMonthIndex(currentMonthIndex + 1);
	};

	const getDayClass = (day) => {
		const format = "DD-MM-YY";
		const nowDay = moment().format(format);
		const currDay = day.format(format);
        const selectedDay = daySelected && daySelected.format(format);
		if (nowDay === currDay) {
			return "ibSmallCalendarToday";
		} else if (currDay === selectedDay) {
            return 'ibSmallCalendarSelectedDay';
        }
	};
	return (
		<div className="ibSmallCalendarContainer">
			<header className="ibSmallCalendarHeader">
				<p>
					{moment(
						new Date(moment().year(), currentMonthIndex)
					).format("MMMM YYYY")}
				</p>
				<div>
					<span onClick={handlePrevMonth}>
						<ChevronLeft
							sx={{
								color: "#333",
								"&:hover": {
									color: "#ddd",
									cursor: "pointer",
								},
							}}
						/>
					</span>
					<span onClick={handleNextMonth}>
						<ChevronRight
							sx={{
								color: "#333",
								"&:hover": {
									color: "#ddd",
									cursor: "pointer",
								},
							}}
						/>
					</span>
				</div>
			</header>
			<div>
				<Box sx={{ flexGrow: 1 }}>
					<Grid
						sx={{ height: 150 }}
						container
						spacing={{ xs: 1, md: 1 }}
						columns={{ xs: 7, sm: 7, md: 7 }}
					>
						{/* MUI 6+'s Grid replaced the old item+xs/sm/md breakpoint props with a single
						    size prop - every non-container Grid is implicitly an "item" now. */}
						{currentMonth[0].map((day, index) => (
							<Grid size={1} key={index}>
								{/* ibSmallCalendarDays already existed in ibCalendar.css but was
								    never applied to anything - these weekday letters are what it
								    was written for. */}
								<Item elevation={0} className="ibSmallCalendarDays">
									{day.format("dd").charAt(0)}
								</Item>
							</Grid>
						))}
						{currentMonth.map((row, index) => (
							<React.Fragment key={Date.now() + index}>
								{row.map((day, idx) => (
									<Grid size={1} key={idx}>
										<Item
											elevation={0}
											sx={{ cursor: "pointer" }}
											onClick={() => {
												setSmallCalendarMonth(
													currentMonthIndex
												);
                                                setDaySelected(day);
											}}
										>
											{/* getDayClass returns undefined for an ordinary day -
											    interpolating that directly would put the literal
											    string "undefined" in the class list, hence the
											    filter/join. */}
											<span
												className={[
													"ibSmallCalendarDayNumber",
													getDayClass(day),
												]
													.filter(Boolean)
													.join(" ")}
											>
												{day.format("D")}
											</span>
										</Item>
									</Grid>
								))}
							</React.Fragment>
						))}
					</Grid>
				</Box>
			</div>
		</div>
	);
};

export default SmallCalendar;
