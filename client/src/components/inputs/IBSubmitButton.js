import { Send } from '@mui/icons-material';
import { Button } from '@mui/material';

const IBSubmitButton = () => {
  return (
    <Button variant="contained" endIcon={<Send />} type="submit">
      Submit
    </Button>
  );
};

export default IBSubmitButton;