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
	// CONTROLLED when provided, uncontrolled otherwise.
	//
	// Only defaultValue existed, which is fine for a field whose value is known at mount and never
	// changes underneath the user - which was every caller until one needed a value that updates
	// while the field is on screen (the registration form suggests a booking link as you type your
	// name). An uncontrolled input ignores that: React state changes, the box does not, and the
	// form submits something nobody ever saw.
	//
	// Passing both to MUI logs a warning and picks one, so exactly one is forwarded below.
	value,
    required=false,
    autoFocus=false,
    fullWidth=true,
    error=false,
    placeholder='',
	disabled = false,
	// Was 'standard' (MUI's old underline-only look) - 'outlined' is what every bare TextField on
	// the register page renders as (that page never passes a variant prop, so it gets MUI's own
	// default, which has been 'outlined' since MUI v5). Changing IBInput's own default to match is
	// the one-line version of "modals should look like the register page" for every one of this
	// component's ~18 callers app-wide, rather than overriding variant at each call site.
	variant = 'outlined',
	helperText,
	// Attributes for the underlying <input>. Needed for step on a decimal money/percentage field:
	// type="number" defaults to step=1, so a browser treats 9.4 as invalid and silently BLOCKS a
	// real form submit. Nothing hit that before because every money field in this app saves from a
	// button's onClick rather than a form's onSubmit, so native validation never ran.
	//
	// Kept as `inputProps` on THIS component's API even though MUI v9 no longer has that prop -
	// see the forwarding below. Callers should not have to track which MUI major this is.
	inputProps,
	onChange = () => {},
	onKeyDown = () =>{},
	onBlur = () => {},
}) => {
	// slotProps.htmlInput, NOT inputProps. MUI v9 removed the old prop from TextField's public API,
	// so anything passed under that name falls through to the DOM and React warns "React does not
	// recognize the inputProps prop on a DOM element" - which is exactly what it did. The
	// translation lives here so no caller has to know which MUI major this is.
	const htmlInputForwarding = inputProps ? { slotProps: { htmlInput: inputProps } } : {};

	return (
		<TextField
			autoFocus={autoFocus}
			margin="normal"
			variant={variant}
			id={id}
			sx={sx}
			label={label}
			type={type}
			{...(value !== undefined ? { value } : { defaultValue })}
			fullWidth={fullWidth}
			required={required}
			inputRef={inputRef}
            error={error}
            placeholder={placeholder}
            disabled={disabled}
			{...htmlInputForwarding}
			helperText={helperText}
            onChange={onChange}
			onKeyDown={onKeyDown}
			onBlur={onBlur}
		/>
	);
};

export default IBInput;
