import moment from 'moment';
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
    const { monthIndex, setMonthIndex, savedEvents, setSavedEvents } = useCalendar();
    const { data, loading } = AppointmentService.getAppointmentsByShop(user.userInfo.shop.id);

    useEffect(() => {
        if(data) {
            console.log(data.getAppointmentsByShop[0]);
            console.log(moment.utc(data.getAppointmentsByShop[0].appointmentDate).format('h:mm'))
            setSavedEvents(data.getAppointmentsByShop);
        }
    }, [loading])
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