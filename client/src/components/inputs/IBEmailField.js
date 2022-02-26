import { TextField } from '@mui/material';

const IBEmailField = ({ emailRef, defaultValue = '' }) => {
  return (
    <TextField
      autoFocus
      margin="normal"
      variant="standard"
      id="email"
      label="Email Address"
      type="email"
      fullWidth
      required
      inputRef={emailRef}
      defaultValue={defaultValue}
    />
  );
};

export default IBEmailField;