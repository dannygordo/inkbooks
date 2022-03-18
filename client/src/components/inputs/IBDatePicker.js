import TextField from '@mui/material/TextField';
import AdapterMoment from '@mui/lab/AdapterMoment';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import MobileDatePicker from '@mui/lab/MobileDatePicker';

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