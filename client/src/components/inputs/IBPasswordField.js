import { Visibility, VisibilityOff } from "@mui/icons-material";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import { useState } from "react";

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
			inputProps={{ minLength: 6 }}
			InputProps={{
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
			}}
		/>
	);
};

export default IBPasswordField;
