import TextField from '@mui/material/TextField';
import AdapterMoment from '@mui/lab/AdapterMoment';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import MobileDateTimePicker from '@mui/lab/MobileDateTimePicker';

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