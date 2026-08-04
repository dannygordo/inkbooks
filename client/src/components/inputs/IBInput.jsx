import { TextField } from "@mui/material";
import React from "react";

/**
 * Custom input control with some defaults set
 * @param {inputRef, id, label, type, defaultValue, required, autoFocus, fullWidth, error, placeholder, disabled, onChange} optionsObject 
 * @returns 
 */
const IBInput = ({
	inputRef,
	id,
	label,
	type,
	sx,
	defaultValue,
    required=false,
    autoFocus=false,
    fullWidth=true,
    error=false,
    placeholder='',
	disabled = false,
	variant = 'standard',
	helperText,
	onChange = () => {},
	onKeyDown = () =>{},
	onBlur = () => {},
}) => {
	return (
		<TextField
			autoFocus={autoFocus}
			margin="normal"
			variant={variant}
			id={id}
			sx={sx}
			label={label}
			type={type}
			defaultValue={defaultValue}
			fullWidth={fullWidth}
			required={required}
			inputRef={inputRef}
            error={error}
            placeholder={placeholder}
            disabled={disabled}
			helperText={helperText}
            onChange={onChange}
			onKeyDown={onKeyDown}
			onBlur={onBlur}
		/>
	);
};

export default IBInput;
