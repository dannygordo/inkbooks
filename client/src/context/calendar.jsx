import moment from "moment";
import React, { useContext, useState, useReducer } from "react";

const CalendarContext = React.createContext({
	monthIndex: 0,
	setMonthIndex: (idx) => {},
});

export function useCalendar() {
	return useContext(CalendarContext);
}

const savedEventsReducer = (state, { type, payload }) => {
	switch (type) {
		case "CREATE_EVENT":
			return [...state, payload];
		case "UPDATE_EVENT":
			return state.map((e) => (e.id === payload.id ? payload : e));
		case "DELETE_EVENT":
			return state.filter((e) => e.id !== payload.id);
		default:
			throw new Error();
	}
};

const initEvents = () => {
	//get events
	return [];
};

export function CalendarProvider(props) {
	const [monthIndex, setMonthIndex] = useState(moment().month());
	const [daySelected, setDaySelected] = useState(moment());
	// savedEvents is the whole set the calendar draws from. There was a parallel `filteredEvents`
	// here, written by the Sidebar artist filter and read by Day.jsx - so the thing that rendered
	// was never the thing that was fetched. Both are gone; so is the Sidebar itself (see
	// CalendarHeader.jsx - Create Event now lives there) and SmallCalendar.jsx, the mini
	// month-picker that used to live alongside it - this context used to also carry
	// smallCalendarMonth/setSmallCalendarMonth (that component's own month-sync state, with no
	// other reader) and a smallDaySelected/setSmallDaySelected pair that was never wired to
	// anything at all, both removed with it.
	const [savedEvents, setSavedEvents] = useState([]);

	return (
		<CalendarContext.Provider
			value={{
				monthIndex,
				setMonthIndex,
				daySelected,
				setDaySelected,
                savedEvents,
                setSavedEvents
			}}
			{...props}
		/>
	);
}
