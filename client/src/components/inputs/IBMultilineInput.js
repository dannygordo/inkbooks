import { TextField } from "@mui/material";
import React from "react";

/**
 * Multi line input with some defaults set
 * @param {inputRef, id, label, placeholder, defaultValue, disabled, error, helperText, autoFocus, onChange} optionsObject 
 * @returns 
 */
const IBMultilineInput = ({
	inputRef,
	id,
	label,
	placeholder,
	defaultValue,
	disabled = false,
    error = false,
	helperText,
	autoFocus = false,
    onChange=()=>{},
	onKeyDown=()=>{}
}) => {
	return (
		<TextField
			id={id}
			autoFocus={autoFocus}
			label={label}
			placeholder={placeholder}
			ref={inputRef}
			variant="standard"
			defaultValue={defaultValue}
			multiline
			disabled={disabled}
            error={error}
			helperText={helperText}
            onChange={onChange}
			onKeyDown={onKeyDown}
			fullWidth
		/>
	);
};

export default IBMultilineInput;
