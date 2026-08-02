// Explicit React import - the real `vite build`/`vite dev` pipeline uses @vitejs/plugin-react's
// automatic JSX runtime and never needed this, but Vitest renders this component via a transform
// path that doesn't pick up the automatic runtime the same way (same issue already hit and fixed
// on Login.jsx/Register.jsx) - it's rendered here because CreateEventDialog/UpdateEventDialog's
// tests actually mount it. See CreateEventDialog.test.jsx/UpdateEventDialog.test.jsx.
import React from 'react';
import TextField from '@mui/material/TextField';
//import AdapterMoment from '@mui/lab/AdapterMoment';
import {AdapterMoment} from '@mui/x-date-pickers/AdapterMoment';
//import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
//import MobileDatePicker from '@mui/lab/MobileDatePicker';
import {MobileDateTimePicker} from '@mui/x-date-pickers/MobileDateTimePicker';

const IBDateTimePicker = ({label, val, setVal}) => {
    const onChange = (newVal) => {
        console.log(newVal.format('LLL'));
        setVal(newVal);
    }
  return (
    <LocalizationProvider dateAdapter={AdapterMoment}>
      <MobileDateTimePicker
        renderInput={(props) => <TextField {...props} />}
        label={label}
        value={val}
        onChange={onChange}
      />
    </LocalizationProvider>
  )
}

export default IBDateTimePicker