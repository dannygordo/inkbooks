import moment from 'moment';
import React from 'react'
import IBCalendar from '../../components/ibCalendar/IBCalendar';
import UtilsService from '../../services/UtilsService';
import './appointments.css';

const Appointments = () => {
  return (
    <div className="appointments">
      <IBCalendar />
    </div>
  )
}

export default Appointments