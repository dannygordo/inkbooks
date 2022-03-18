import CreateEventButton from './CreateEventButton';
import './ibCalendar.css';
import SmallCalendar from './SmallCalendar';

const Sidebar = () => {
  return (
    <aside className="ibCalendarAsideContainer">
        <CreateEventButton />
        <SmallCalendar />
    </aside>
  )
}

export default Sidebar