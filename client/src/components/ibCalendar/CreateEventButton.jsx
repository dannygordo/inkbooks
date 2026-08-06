import { Add } from '@mui/icons-material'
import { Fab } from '@mui/material'
import React from 'react'
import { useAuth } from "../../context/auth";
import { useCalendar } from '../../context/calendar';
import AppointmentWizard from './AppointmentWizard';

/**
 * Opens the appointment wizard.
 *
 * `day` is optional and overrides the calendar's own selection. The calendar has a selected day and
 * passes nothing; the appointments LIST has no concept of one, and inheriting whatever cell was
 * last clicked on a different view would silently pre-fill a date the person never chose - the kind
 * of default that gets accepted by anyone in a hurry. The list passes today explicitly instead.
 */
const CreateEventButton = ({ day }) => {

    const { setModal } = useAuth();
    const {daySelected} = useCalendar();
    const targetDay = day || daySelected;

    const handleCreateEvent = (e) => {
        e.preventDefault();
        setModal({isOpen: true, title:`Appointment for ${targetDay.format('LL')}`, content: <AppointmentWizard selectedDay={targetDay} />});
    }
  return (
    <>
        <div className="ibCalendarCreateEventButton">
            <Fab  
            size="small"
            variant="extended"
            onClick={handleCreateEvent}
            sx={{
                marginRight: "5px",
                backgroundColor: "#ddd",
                paddingRight: "15px",
                color: "#333",
                "&:hover": {
                    color: "#ddd",
                    backgroundColor: "#333",
                },
            }}>
                <Add sx={{ mr: 1}} />
                Create Event
            </Fab>
        </div>
    </>
  )
}

export default CreateEventButton