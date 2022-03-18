import moment from "moment";
import React, { useContext, useEffect, useState, useReducer } from "react";

const CalendarContext = React.createContext({
	monthIndex: 0,
	setMonthIndex: (idx) => {},
	smallCalendarMonth: 0,
	setSmallCalendarMonth: (idx) => {},
	smallDaySelected: null,
	setSmallDaySelected: (day) => {},
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
	const [smallCalendarMonth, setSmallCalendarMonth] = useState(null);
	const [daySelected, setDaySelected] = useState(moment());
	const [savedEvents, dispatchCalendarEvent] = useReducer(
		savedEventsReducer,
		[],
		initEvents
	);

	useEffect(() => {
		if (smallCalendarMonth !== null) {
			setMonthIndex(smallCalendarMonth);
		}
	}, [smallCalendarMonth]);

	return (
		<CalendarContext.Provider
			value={{
				monthIndex,
				setMonthIndex,
				smallCalendarMonth,
				setSmallCalendarMonth,
				daySelected,
				setDaySelected,
			}}
			{...props}
		/>
	);
}
