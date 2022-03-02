import React from "react";
import { APP_SETTINGS_CONSTANTS } from "../../constants";
import IBSelect from "./IBSelect";

const IBProjectPalettesSelect = ({ selectedVal, setSelectedVal, inputRef, defaultValue }) => {
	return (
		<IBSelect
			data={APP_SETTINGS_CONSTANTS.PROJECT_PALETTE_OPTIONS}
			label="Palette"
			helperText="Select black & grey or color"
            inputRef={inputRef}
            selectedVal={selectedVal}
            setSelectedVal={setSelectedVal}
            defaultValue={defaultValue}
		/>
	);
};

export default IBProjectPalettesSelect;
