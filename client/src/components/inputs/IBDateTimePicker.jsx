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