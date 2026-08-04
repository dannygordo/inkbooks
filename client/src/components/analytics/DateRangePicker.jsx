import React, { useState } from "react";
import { Button, TextField } from "@mui/material";
import moment from "moment";
import {
	buildPresetRanges,
	buildCustomRange,
	describeRange,
	RANGE_KEYS,
} from "../../utils/dateRanges";
import "./dateRangePicker.css";

/**
 * Shared range selector for both dashboards - the shop-wide one and the artist's own.
 *
 * Shared rather than built per dashboard so "this month" means one thing across the app. The two
 * views are read side by side (a shop owner comparing an artist's dashboard against shop totals),
 * and two pickers that rounded their boundaries differently would produce figures that don't
 * reconcile, with nothing on screen explaining why.
 *
 * Props:
 * - value: the current {key, label, start, end}
 * - onChange(range): called with a new range object
 */
const DateRangePicker = ({ value, onChange }) => {
	const presets = buildPresetRanges();
	const [showCustom, setShowCustom] = useState(value?.key === RANGE_KEYS.CUSTOM);
	// Held as strings because that's what a native date input gives back; only converted to a
	// range once both sides parse. Seeded from the current range so opening the custom form
	// starts from what's already displayed rather than from empty fields.
	const [customStart, setCustomStart] = useState(
		moment(value?.start || undefined).format("YYYY-MM-DD")
	);
	const [customEnd, setCustomEnd] = useState(
		// The stored end is exclusive; the input should show the last INCLUDED day, which is what
		// the user picked. See utils/dateRanges.js.
		moment(value?.end || undefined)
			.subtract(1, "day")
			.format("YYYY-MM-DD")
	);
	const [error, setError] = useState(null);

	const handlePreset = (preset) => {
		setShowCustom(false);
		setError(null);
		onChange(preset);
	};

	const handleApplyCustom = (e) => {
		e.preventDefault();
		const range = buildCustomRange(customStart, customEnd);
		if (!range) {
			setError("Pick a valid start and end date, with the end on or after the start.");
			return;
		}
		setError(null);
		onChange(range);
	};

	return (
		<div className="dateRangePicker">
			<div className="dateRangePickerPresets">
				{presets.map((preset) => (
					<Button
						key={preset.key}
						size="small"
						// Compared by key rather than by date equality - two Date objects for the
						// same instant are never ===, and comparing timestamps would light up the
						// preset whenever a custom range happened to coincide with it.
						variant={value?.key === preset.key ? "contained" : "outlined"}
						sx={value?.key === preset.key ? { backgroundColor: "#333" } : undefined}
						onClick={() => handlePreset(preset)}
					>
						{preset.label}
					</Button>
				))}
				<Button
					size="small"
					variant={value?.key === RANGE_KEYS.CUSTOM ? "contained" : "outlined"}
					sx={value?.key === RANGE_KEYS.CUSTOM ? { backgroundColor: "#333" } : undefined}
					onClick={() => setShowCustom((open) => !open)}
				>
					Custom
				</Button>
			</div>

			{showCustom && (
				<form className="dateRangePickerCustom" onSubmit={handleApplyCustom}>
					<TextField
						label="From"
						type="date"
						size="small"
						value={customStart}
						onChange={(e) => setCustomStart(e.target.value)}
						InputLabelProps={{ shrink: true }}
					/>
					<TextField
						label="To"
						type="date"
						size="small"
						value={customEnd}
						onChange={(e) => setCustomEnd(e.target.value)}
						InputLabelProps={{ shrink: true }}
					/>
					<Button type="submit" size="small" variant="contained" sx={{ backgroundColor: "#333" }}>
						Apply
					</Button>
				</form>
			)}

			{error && <div className="dateRangePickerError">{error}</div>}

			{/* Always shown, including for presets. "This month" is unambiguous to the person who
			    clicked it and ambiguous to everyone else reading the screen over their shoulder -
			    and it's the line that makes a figure quotable. */}
			<div className="dateRangePickerSummary">Showing {describeRange(value)}</div>
		</div>
	);
};

export default DateRangePicker;
