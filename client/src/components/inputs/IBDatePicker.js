import TextField from '@mui/material/TextField';
//import AdapterMoment from '@mui/lab/AdapterMoment';
import {AdapterMoment} from '@mui/x-date-pickers/AdapterMoment';
//import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
//import MobileDatePicker from '@mui/lab/MobileDatePicker';
import {MobileDatePicker} from '@mui/x-date-pickers/MobileDatePicker'

const IBDatePicker = ({label, val, setVal}) => {
    const onChange = (newVal) => {
        setVal(newVal);
    }
  return (
    <LocalizationProvider dateAdapter={AdapterMoment}>
      <MobileDatePicker
        renderInput={(props) => <TextField {...props} />}
        label={label}
        value={val}
        onChange={onChange}
      />
    </LocalizationProvider>
  )
}

export default IBDatePicker