import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/auth';
import { useCalendar } from '../../context/calendar';
import { AppointmentService } from '../../services/AppointmentService';
import UtilsService from '../../services/UtilsService';
import CalendarHeader from './CalendarHeader';
import './ibCalendar.css';
import Month from './Month';

const IBCalendar = () => {
    const { user } = useAuth();
    const [currentMonth, setCurrentMonth] = useState(UtilsService.getMonth());
    const { monthIndex, setMonthIndex, setSavedEvents } = useCalendar();
    // user.userInfo.shop is legitimately absent for an independent artist (no shop connection -
    // see PRODUCTION_ROADMAP.md's artist-centric tenancy section). Both queries are always called
    // (required - hooks can't be called conditionally) but each `skip`s itself when its own id is
    // missing, so only one ever actually fires: getAppointmentsByShop for a shop-connected artist,
    // getAppointmentsByArtistForCalendar for an independent one. This closes the gap noted
    // previously here - an independent artist's calendar used to render as permanently empty
    // instead of showing their own appointments, since getAppointmentsByShop has nothing to query
    // without a shopId and there was no fallback query at all.
    const shopId = user.userInfo?.shop?.id;

    // Fetch exactly the days on screen, and no more. This used to fetch EVERY appointment the shop
    // had ever had so Day.jsx could filter down to one day at a time - see server/utils/pagination.js.
    //
    // Derived from the rendered grid rather than from the month number, because the grid isn't the
    // month: getMonth() returns five weeks starting on the week that contains the 1st, so it spills
    // into the previous and next months. Asking for the calendar month would leave the leading and
    // trailing cells mysteriously empty.
    //
    // Half-open [from, to), matching the server - so the last day is included by adding a day to
    // its start rather than by trying to name the last instant of it.
    const range = useMemo(() => {
        const weeks = currentMonth;
        if (!weeks || weeks.length === 0) {
            return null;
        }
        const firstCell = weeks[0][0];
        const lastCell = weeks[weeks.length - 1][weeks[weeks.length - 1].length - 1];
        if (!firstCell || !lastCell) {
            return null;
        }
        return {
            from: firstCell.clone().startOf('day').toISOString(),
            to: lastCell.clone().add(1, 'day').startOf('day').toISOString(),
        };
    }, [currentMonth]);

    const { data: shopData } = AppointmentService.getAppointmentsByShop(shopId, range);
    const { data: artistData } = AppointmentService.getAppointmentsByArtistForCalendar(
        shopId ? undefined : user.id,
        range
    );

    useEffect(() => {
        // Was two debug console.log statements hard-indexing data.getAppointmentsByShop[0] -
        // crashed with "Cannot read properties of undefined (reading 'appointmentDate')" the
        // instant a shop had zero appointments (an entirely normal, common state - a brand new
        // shop, or any shop between appointments), not just an independent-artist edge case.
        // Found via manual testing. Removed - they added no functional value; setSavedEvents
        // below already uses the full array correctly and doesn't depend on them.
        if (shopId && shopData) {
            setSavedEvents(shopData.getAppointmentsByShop.items);
        } else if (!shopId && artistData) {
            setSavedEvents(artistData.getAppointmentsByArtist.items);
        }
    }, [shopId, shopData, artistData])
    useEffect(() => {
        setCurrentMonth(UtilsService.getMonth(monthIndex));
    }, [monthIndex])
  return (
    <>
        <div className='ibCalendar'>
            <CalendarHeader />
            {/* Was a flex-row wrapper around <Sidebar /> (Create Event + the mini month-picker)
                and this container - the sidebar's gone (see CalendarHeader.jsx, which now hosts
                Create Event in the header itself), so the grid no longer needs a row partner to
                sit beside. */}
            <div className="ibCalendarContainer">
                <Month month={currentMonth} />
            </div>
        </div>
    </>
  )
}

export default IBCalendar