import { Add } from '@mui/icons-material'
import { Fab } from '@mui/material'
import React from 'react'
import { useAuth } from "../../context/auth";
import { useCalendar } from '../../context/calendar';
import AppointmentWizard from './AppointmentWizard';

const CreateEventButton = () => {
    
    const { setModal } = useAuth();
    const {daySelected} = useCalendar();
    
    const handleCreateEvent = (e) => {
        e.preventDefault();
        setModal({isOpen: true, title:`Appointment for ${daySelected.format('LL')}`, content: <AppointmentWizard selectedDay={daySelected} />});
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