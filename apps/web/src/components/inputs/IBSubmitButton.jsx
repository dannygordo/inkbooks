// Explicit React import - see the note in IBDateTimePicker.jsx. Rendered by
// CreateEventDialog's tests, which is what surfaced this.
import React from "react";
import { Send } from "@mui/icons-material";
import { Button } from "@mui/material";

const IBSubmitButton = ({
	variant = "contained",
	type = "submit",
	text = "Submit",
  endIcon = <Send />
}) => {
	return (
		<Button variant={variant} endIcon={endIcon} type={type}>
			{text}
		</Button>
	);
};

export default IBSubmitButton;
