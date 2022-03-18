import { useEffect, useState } from 'react';
import { useCalendar } from '../../context/calendar';
import UtilsService from '../../services/UtilsService';
import CalendarHeader from './CalendarHeader';
import './ibCalendar.css';
import Month from './Month';
import Sidebar from './Sidebar';

const IBCalendar = () => {
    const [currentMonth, setCurrentMonth] = useState(UtilsService.getMonth());
    const { monthIndex, setMonthIndex } = useCalendar();

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