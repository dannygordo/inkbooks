import "./ibCalendar.css";
import moment from "moment";
import { useCalendar } from "../../context/calendar";
import { useAuth } from "../../context/auth";
import CreateEventDialog from "./CreateEventDialog";

const Day = ({ day, rowIdx }) => {
    const { setDaySelected } = useCalendar();
    const { setModal } = useAuth();


	const getCurrentDayClass = () => {
		return day.format("DD-MM-YY") === moment().format("DD-MM-YY")
			? "ibCalendarToday"
			: "";
	};

    const handleCreateEvent = (e) => {
        e.preventDefault();
        setDaySelected(day);
        setModal({isOpen: true, title:`Appointment for ${day.format('LL')}`, content: <CreateEventDialog selectedDay={day} />});
    }
	return (
		<div className="ibCalendarDateCellBody"  onClick={handleCreateEvent}>
			<div className="ibCalendarDateCell" >
				<header>
					{rowIdx === 0 && <p>{day.format("ddd").toUpperCase()}</p>}
					<p className={getCurrentDayClass()}>{day.format("DD")}</p>
				</header>
                <div >

                </div>
			</div>
		</div>
	);
};

export default Day;
