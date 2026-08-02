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
    defaultValue
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

	return (
		<FormControl sx={{ minWidth: 120, marginTop: 2}}>
			<InputLabel id="demo-simple-select-helper-label">
				{label}
			</InputLabel>
			<Select
				labelId="demo-simple-select-helper-label"
				id="demo-simple-select-helper"
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
