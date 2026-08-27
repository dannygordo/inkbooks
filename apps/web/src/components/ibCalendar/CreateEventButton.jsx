import { Add } from '@mui/icons-material'
import { Button } from '@mui/material'
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
            {/* A plain themed Button, not a Fab - a floating action button is for a screen with no
                other obvious primary action (the calendar has a whole page of controls around it,
                so "floating" over them reads as visual noise, not affordance). variant="contained"
                with no color override picks up theme.js's primary copper automatically, same as
                every other primary button in the app - the old hardcoded #ddd/#333 sx block is
                exactly why this one alone stayed gray through the rest of the theming pass. */}
            <Button
            variant="contained"
            size="small"
            startIcon={<Add />}
            onClick={handleCreateEvent}
            sx={{ marginRight: "5px" }}>
                Create Event
            </Button>
        </div>
    </>
  )
}

export default CreateEventButton