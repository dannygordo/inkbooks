// Explicit React import - same recurring Vitest-vs-Vite JSX-transform issue as Login.jsx/
// Register.jsx/IBDatePicker.jsx/IBDateTimePicker.jsx/IBEmailField.jsx - this is the first time
// this component is actually mounted under a test (IBPasswordField.test.jsx).
import React, { useState } from "react";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { IconButton, InputAdornment, TextField } from "@mui/material";

/**
 * Password input with some defaults set
 * @param {passwordRef, id, label, fullWidth, required, autoFocus} optionsObject
 * @returns
 */
const IBPasswordField = ({
	passwordRef,
	id = "password",
	label = "password",
	fullWidth = true,
	required = true,
	sx,
	autoFocus = false,
	variant = 'standard'
}) => {
	const [showPassword, setShowPassword] = useState(false);

	const handleClick = () => {
		setShowPassword(!showPassword);
	};
	const handleMouseDown = (e) => {
		e.preventDefault();
	};
	return (
		<TextField
			autoFocus={autoFocus}
			margin="normal"
			variant={variant}
			id={id}
			sx={sx}
			label={label}
			type={showPassword ? "text" : "password"}
			fullWidth={fullWidth}
			required={required}
			inputRef={passwordRef}
			// TextField dropped the legacy top-level `inputProps`/`InputProps` props entirely in
			// MUI v9 (confirmed by reading the installed TextField.js - neither name is even
			// destructured from `props` anymore) in favor of `slotProps.htmlInput`/
			// `slotProps.input`. This was a real, live bug, not just a test problem: the old
			// `InputProps={{ endAdornment: <IconButton>... }}` silently never rendered the
			// show/hide toggle button at all post-migration (confirmed via the actual rendered
			// DOM while debugging IBPasswordField.test.jsx - React even warned by stringifying the
			// unrecognized prop onto the root div as a raw `inputprops="[object Object]"`
			// attribute), and `inputProps={{ minLength: 6 }}` silently stopped enforcing the
			// client-side minimum length too. Same class of staleness as the Avatar `imgProps` and
			// date-picker `renderInput` fixes elsewhere this session.
			slotProps={{
				htmlInput: { minLength: 6 },
				input: {
					endAdornment: (
						<InputAdornment position="end">
							<IconButton
								aria-label="Toggle Password visibility"
								onClick={handleClick}
								onMouseDown={handleMouseDown}
							>
								{showPassword ? <VisibilityOff /> : <Visibility />}
							</IconButton>
						</InputAdornment>
					),
				},
			}}
		/>
	);
};

export default IBPasswordField;
