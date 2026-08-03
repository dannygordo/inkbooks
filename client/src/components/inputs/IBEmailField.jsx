// Explicit React import - the real `vite build`/`vite dev` pipeline uses @vitejs/plugin-react's
// automatic JSX runtime and never needed this, but Vitest renders this component via a transform
// path that doesn't pick up the automatic runtime the same way (same issue already hit and fixed
// on Login.jsx/Register.jsx/IBDatePicker.jsx/IBDateTimePicker.jsx) - this is the first time this
// component is actually mounted under a test (IBEmailField.test.jsx), which is why this was never
// caught until now.
import React from 'react';
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