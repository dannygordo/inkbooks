import { useEffect, useState } from 'react';
import { useAuth } from '../../context/auth';
import { useCalendar } from '../../context/calendar';
import { AppointmentService } from '../../services/AppointmentService';
import UtilsService from '../../services/UtilsService';
import CalendarHeader from './CalendarHeader';
import './ibCalendar.css';
import Month from './Month';
import Sidebar from './Sidebar';

const IBCalendar = () => {
    const { user } = useAuth();
    const [currentMonth, setCurrentMonth] = useState(UtilsService.getMonth());
    const { monthIndex, setMonthIndex, savedEvents, setSavedEvents, setFilteredEvents } = useCalendar();
    // user.userInfo.shop is legitimately absent for an independent artist (no shop connection -
    // see PRODUCTION_ROADMAP.md's artist-centric tenancy section). Optional-chained to undefined,
    // which getAppointmentsByShop's own skip guard (see AppointmentService.js) now treats as
    // "nothing to fetch" instead of crashing the whole Calendar page - found via manual testing.
    // Known gap, not fixed here: this means an independent artist's calendar currently shows no
    // appointments at all rather than their own (getAppointmentsByArtist would be the right query
    // for that case) - a real product decision about what an independent artist's calendar should
    // show, not just a null-check, and out of scope for a crash fix.
    const { data, loading } = AppointmentService.getAppointmentsByShop(user.userInfo?.shop?.id);

    useEffect(() => {
        // Was two debug console.log statements hard-indexing data.getAppointmentsByShop[0] -
        // crashed with "Cannot read properties of undefined (reading 'appointmentDate')" the
        // instant a shop had zero appointments (an entirely normal, common state - a brand new
        // shop, or any shop between appointments), not just an independent-artist edge case.
        // Found via manual testing. Removed - they added no functional value; setSavedEvents/
        // setFilteredEvents below already use the full array correctly and don't depend on them.
        if(data) {
            setSavedEvents(data.getAppointmentsByShop);
            setFilteredEvents(data.getAppointmentsByShop);
        }
    }, [data,loading])
    useEffect(() => {
        setCurrentMonth(UtilsService.getMonth(monthIndex));
    }, [monthIndex])
  return (
    <>
        <div className='ibCalendar'>
            <CalendarHeader />
            <div style={{display: 'flex', flexDirection: 'row'}}>
                <Sidebar />
                <div className="ibCalendarContainer">
                    <Month month={currentMonth} />    
                </div>
            </div>
        </div>
    </>
  )
}

export default IBCalendar