// Explicit React import - the real `vite build`/`vite dev` pipeline uses @vitejs/plugin-react's
// automatic JSX runtime and never needed this, but Vitest renders this component via a transform
// path that doesn't pick up the automatic runtime the same way (same issue already hit and fixed
// on Login.jsx/Register.jsx) - it's rendered here because CreateEventDialog/UpdateEventDialog's
// tests actually mount it. See CreateEventDialog.test.jsx/UpdateEventDialog.test.jsx.
import React from 'react';
import {AdapterMoment} from '@mui/x-date-pickers/AdapterMoment';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import {MobileDateTimePicker} from '@mui/x-date-pickers/MobileDateTimePicker';

const IBDateTimePicker = ({label, val, setVal}) => {
    const onChange = (newVal) => {
        console.log(newVal.format('LLL'));
        setVal(newVal);
    }
  return (
    // renderInput was removed from MUI X Date Pickers' API in v6 (replaced by slots/slotProps) -
    // this project is on v9.10.1. It rendered its own default TextField regardless, so this had
    // no effect other than being silently ignored; removed rather than left pointing at a
    // nonexistent prop. Same class of staleness as the Avatar imgProps fix elsewhere this session.
    <LocalizationProvider dateAdapter={AdapterMoment}>
      <MobileDateTimePicker
        label={label}
        value={val}
        onChange={onChange}
      />
    </LocalizationProvider>
  )
}

export default IBDateTimePicker