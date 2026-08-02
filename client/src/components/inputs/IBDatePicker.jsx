// Explicit React import - see the note in IBDateTimePicker.jsx.
import React from 'react';
import {AdapterMoment} from '@mui/x-date-pickers/AdapterMoment';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import {MobileDatePicker} from '@mui/x-date-pickers/MobileDatePicker'

// This component isn't imported/used anywhere else in the client (IBDateTimePicker.jsx is the one
// actually wired into CreateEventDialog/UpdateEventDialog) - flagging as dead code rather than
// removing it, since removing files wasn't asked for here.
const IBDatePicker = ({label, val, setVal}) => {
    const onChange = (newVal) => {
        setVal(newVal);
    }
  return (
    // renderInput was removed from MUI X Date Pickers' API in v6 (replaced by slots/slotProps) -
    // this project is on v9.10.1. It rendered its own default TextField regardless, so this had
    // no effect other than being silently ignored; removed rather than left pointing at a
    // nonexistent prop. Same class of staleness as the Avatar imgProps fix elsewhere this session.
    <LocalizationProvider dateAdapter={AdapterMoment}>
      <MobileDatePicker
        label={label}
        value={val}
        onChange={onChange}
      />
    </LocalizationProvider>
  )
}

export default IBDatePicker