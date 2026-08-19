import { TextField } from "@mui/material";
import React from "react";

/**
 * Multi line input with some defaults set
 * @param {inputRef, id, label, placeholder, defaultValue, value, disabled, error, helperText, autoFocus, onChange} optionsObject
 * @returns
 */
const IBMultilineInput = ({
	inputRef,
	id,
	label,
	placeholder,
	defaultValue,
	// CONTROLLED when provided, uncontrolled otherwise - same fix, same reasoning, as IBInput.jsx's
	// own `value` prop (see that file's comment). This component never got it: every caller that
	// passed `value` here (FormBuilder.jsx's form description, FormFieldsRenderer.jsx's "paragraph"
	// field answers) had it silently dropped on the floor - not forwarded to MUI's TextField at
	// all, since this component only ever destructured `defaultValue`. onChange still fired and
	// still updated the caller's own state correctly (which is why SAVING worked and the server had
	// the right value), but the box itself rendered with `defaultValue={undefined}` every time,
	// i.e. always blank on mount, regardless of what state held. Concretely: FormBuilder's Consent
	// form description looked empty every time the edit page was reopened, even though `getForm`
	// was returning the saved text correctly - the bug was never in the data, only in this
	// component silently ignoring the prop that was supposed to display it.
	value,
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
			{...(value !== undefined ? { value } : { defaultValue })}
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
