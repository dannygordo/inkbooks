// Explicit React import - see the note in IBDateTimePicker.jsx. Rendered by
// CreateEventDialog/UpdateEventDialog's tests, which is what surfaced this.
import React from "react";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormHelperText from "@mui/material/FormHelperText";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import { useState } from "react";

const IBSelect = ({
	data,
	label,
	onChange,
	autoWidth = true,
	helperText,
	inputRef,
    selectedVal,
    setSelectedVal,
    defaultValue,
    // Was hardcoded below ("demo-simple-select-helper[-label]") - fine while every caller
    // (RatesPanel, IBProjectPalettesSelect, IBProjectsByArtistSelect) only ever put one IBSelect on
    // screen at a time, but two duplicate DOM ids the instant a second one renders alongside it -
    // e.g. an always-visible "add new" form next to a per-row "edit" form using this same
    // component (see pages/expenses/Expenses.jsx). Defaults to the old literal string so every
    // existing caller renders byte-for-byte the same DOM as before; only a caller passing its own
    // id needs to care that this changed.
    id = "demo-simple-select-helper",
}) => {
	//const [selectedVal, setSelectedVal] = useState("");
	// Was `return onChange;` - returned the function reference itself instead of calling it with
	// the change event, so a caller passing a real onChange handler (to drive selectedVal as a
	// genuinely controlled value, the way the prop names here suggest) silently never had it
	// invoked. Found while writing this component's first tests. Low real-world impact so far -
	// every current caller (IBProjectPalettesSelect/CreateEventDialog/UpdateEventDialog) actually
	// reads the selected value at submit time via `inputRef`, not through this onChange path - but
	// it's a real, confirmed bug in a prop contract this component explicitly advertises
	// (onChange/selectedVal/setSelectedVal), and IBProjectsByArtistSelect.jsx (a near-identical
	// sibling component) already gets this right (`onChange(e)`), so this was a one-off mistake,
	// not the established pattern.
	const handleOnChange = (e) => {
		if (onChange) {
			onChange(e);
		} else {
			console.log(e.target.value);
		}
	};

	const labelId = `${id}-label`;

	return (
		<FormControl sx={{ minWidth: 120, marginTop: 2}}>
			<InputLabel id={labelId}>
				{label}
			</InputLabel>
			<Select
				labelId={labelId}
				id={id}
				value={selectedVal}
				autoWidth={autoWidth}
				label={label}
                defaultValue={defaultValue}
				onChange={handleOnChange}
				inputRef={inputRef}
			>
				<MenuItem value="">
					<em>None</em>
				</MenuItem>
				{data.map((item) => {
					return (
                        <MenuItem key={item.value} value={item.value}>
                            {item.label}
                        </MenuItem>
                    )
				})}
			</Select>
			<FormHelperText>{helperText}</FormHelperText>
		</FormControl>
	);
};

export default IBSelect;
