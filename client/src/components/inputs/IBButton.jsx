// Explicit React import - same recurring Vitest-vs-Vite JSX-transform issue as Login.jsx/
// Register.jsx/IBDatePicker.jsx/IBDateTimePicker.jsx/IBEmailField.jsx/IBPasswordField.jsx. This
// one's triggered by JSX in a default parameter value (`endIcon = <Send />`), evaluated the
// moment the component renders without props - first caught now since IBButton.test.jsx is the
// first thing to actually mount this component (this file is otherwise unused dead code, see
// IBButton.test.jsx's own note).
import React from "react";
import { Send } from "@mui/icons-material";
import { Button } from "@mui/material";

const IBButton = ({
	variant = "contained",
	type = "button",
	text = "",
  endIcon = <Send />
}) => {
	return (
		<Button variant={variant} endIcon={endIcon} type={type}>
			{text}
		</Button>
	);
};

export default IBButton;
