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
    // see PRODUCTION_ROADMAP.md's artist-centric tenancy section). Both queries are always called
    // (required - hooks can't be called conditionally) but each `skip`s itself when its own id is
    // missing, so only one ever actually fires: getAppointmentsByShop for a shop-connected artist,
    // getAppointmentsByArtistForCalendar for an independent one. This closes the gap noted
    // previously here - an independent artist's calendar used to render as permanently empty
    // instead of showing their own appointments, since getAppointmentsByShop has nothing to query
    // without a shopId and there was no fallback query at all.
    const shopId = user.userInfo?.shop?.id;
    const { data: shopData } = AppointmentService.getAppointmentsByShop(shopId);
    const { data: artistData } = AppointmentService.getAppointmentsByArtistForCalendar(
        shopId ? undefined : user.id
    );

    useEffect(() => {
        // Was two debug console.log statements hard-indexing data.getAppointmentsByShop[0] -
        // crashed with "Cannot read properties of undefined (reading 'appointmentDate')" the
        // instant a shop had zero appointments (an entirely normal, common state - a brand new
        // shop, or any shop between appointments), not just an independent-artist edge case.
        // Found via manual testing. Removed - they added no functional value; setSavedEvents/
        // setFilteredEvents below already use the full array correctly and don't depend on them.
        if (shopId && shopData) {
            setSavedEvents(shopData.getAppointmentsByShop);
            setFilteredEvents(shopData.getAppointmentsByShop);
        } else if (!shopId && artistData) {
            setSavedEvents(artistData.getAppointmentsByArtist);
            setFilteredEvents(artistData.getAppointmentsByArtist);
        }
    }, [shopId, shopData, artistData])
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