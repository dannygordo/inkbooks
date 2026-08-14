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
	// Was 'standard' - the same mismatch IBInput.jsx had, and the same fix (see that file's own
	// comment): register.css's bare TextFields, and now everything else in the app, render
	// 'outlined' by MUI's own default. This component had its own separate hardcoded default that
	// the earlier pass missed since it only touched IBInput.jsx, not this sibling.
	variant = 'outlined',
	// multiline alone doesn't make a TextField look like a textarea - with no rows/minRows it
	// starts at one line's height and only grows once someone has typed enough to wrap, which is
	// exactly why this looked like a plain single-line input despite the prop being set. minRows
	// gives it real height up front so it reads as a textarea before anyone types into it. Not a
	// fixed `rows`, so a long description can still grow past 3.
	minRows = 3,
    onChange=()=>{},
	onKeyDown=()=>{},
	onBlur = () => {},
}) => {
	return (
		<TextField
			id={id}
			autoFocus={autoFocus}
			label={label}
			placeholder={placeholder}
			inputRef={inputRef}
			variant={variant}
			defaultValue={defaultValue}
			multiline
			minRows={minRows}
			disabled={disabled}
            error={error}
			helperText={helperText}
            onChange={onChange}
			onKeyDown={onKeyDown}
			onBlur={onBlur}
			fullWidth
		/>
	);
};

export default IBMultilineInput;
