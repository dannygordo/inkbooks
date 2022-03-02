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
	const handleOnChange = (e) => {
		if (onChange) {
			return onChange;
		} else {
			console.log(e.target.value);
		}
	};

	return (
		<FormControl sx={{ m: 1, minWidth: 120 }}>
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
