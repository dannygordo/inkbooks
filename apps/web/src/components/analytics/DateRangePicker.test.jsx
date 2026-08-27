// React imported explicitly - see the note in AppointmentTypeChip.test.jsx and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import DateRangePicker from "./DateRangePicker";
import { RANGE_KEYS, buildPresetRanges } from "../../utils/dateRanges";

// Fixed, hand-built presets rather than buildPresetRanges()/buildScheduleRanges()'s real output -
// those are computed from `moment()` at call time (see utils/dateRanges.js's own comment on why),
// which would make an exact start/end assertion here pass or fail depending on what day this suite
// happens to run on. What's under test is "does the picker hand back whichever preset object was
// clicked, unmodified" - a fixed pair of fake presets proves that without depending on the date.
// Built with the local-time Date constructor (year, monthIndex, day) rather than an ISO date-only
// string. `new Date("2026-01-01")` parses as UTC midnight, and this suite's assertions read it back
// through moment() in LOCAL time (matching how the component itself, and every real preset from
// utils/dateRanges.js's moment().startOf(...).toDate(), actually works) - in any timezone behind
// UTC that combination silently reads back as the previous day, which is a test-fixture bug, not
// something to work around in the component.
const PRESET_A = { key: "a", label: "Preset A", start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) };
const PRESET_B = { key: "b", label: "Preset B", start: new Date(2026, 1, 1), end: new Date(2026, 2, 1) };
const PRESETS = [PRESET_A, PRESET_B];

describe("DateRangePicker", () => {
	it("renders a button for every preset, plus Custom", () => {
		render(<DateRangePicker value={PRESET_A} onChange={vi.fn()} presets={PRESETS} />);
		expect(screen.getByRole("button", { name: "Preset A" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Preset B" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Custom" })).toBeInTheDocument();
	});

	// No presets prop at all - the default every existing dashboard caller relies on.
	// buildPresetRanges()'s labels are static text, not date-dependent, so this is safe to assert
	// on without controlling "today".
	it("falls back to the analytics preset ranges when no presets prop is given", () => {
		render(<DateRangePicker value={null} onChange={vi.fn()} />);
		for (const preset of buildPresetRanges()) {
			expect(screen.getByRole("button", { name: preset.label })).toBeInTheDocument();
		}
	});

	it("highlights the preset matching value.key as contained, and the rest as outlined", () => {
		render(<DateRangePicker value={PRESET_B} onChange={vi.fn()} presets={PRESETS} />);
		expect(screen.getByRole("button", { name: "Preset A" })).toHaveClass("MuiButton-outlined");
		expect(screen.getByRole("button", { name: "Preset B" })).toHaveClass("MuiButton-contained");
	});

	it("clicking a preset calls onChange with that exact preset object", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<DateRangePicker value={PRESET_A} onChange={onChange} presets={PRESETS} />);

		await user.click(screen.getByRole("button", { name: "Preset B" }));

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(PRESET_B);
	});

	it("clicking a preset closes the custom form if it was open", async () => {
		const user = userEvent.setup();
		render(<DateRangePicker value={PRESET_A} onChange={vi.fn()} presets={PRESETS} />);

		await user.click(screen.getByRole("button", { name: "Custom" }));
		expect(screen.getByLabelText("From")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Preset A" }));
		expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
	});

	it("the Custom button toggles the custom form open and closed", async () => {
		const user = userEvent.setup();
		render(<DateRangePicker value={PRESET_A} onChange={vi.fn()} presets={PRESETS} />);

		expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Custom" }));
		expect(screen.getByLabelText("From")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Custom" }));
		expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
	});

	// A value already on RANGE_KEYS.CUSTOM opens straight into the custom form, and seeds it from
	// the CURRENT range rather than blank fields - see DateRangePicker.jsx's own comment on why
	// (re-opening a custom range that's already showing shouldn't start the picker from empty).
	it("opens directly on the custom form, seeded from value, when value.key is already custom", () => {
		const customValue = {
			key: RANGE_KEYS.CUSTOM,
			start: new Date(2026, 2, 5),
			// Exclusive end (see utils/dateRanges.js) - the field should show the INCLUSIVE last day,
			// one day earlier.
			end: new Date(2026, 2, 11),
		};
		render(<DateRangePicker value={customValue} onChange={vi.fn()} presets={PRESETS} />);

		expect(screen.getByRole("button", { name: "Custom" })).toHaveClass("MuiButton-contained");
		expect(screen.getByLabelText("From")).toHaveValue("2026-03-05");
		expect(screen.getByLabelText("To")).toHaveValue("2026-03-10");
	});

	it("applying a valid custom range calls onChange with the built range and clears any error", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<DateRangePicker value={PRESET_A} onChange={onChange} presets={PRESETS} />);
		await user.click(screen.getByRole("button", { name: "Custom" }));

		const fromInput = screen.getByLabelText("From");
		const toInput = screen.getByLabelText("To");
		await user.clear(fromInput);
		await user.type(fromInput, "2026-04-01");
		await user.clear(toInput);
		await user.type(toInput, "2026-04-10");
		await user.click(screen.getByRole("button", { name: "Apply" }));

		expect(onChange).toHaveBeenCalledTimes(1);
		const built = onChange.mock.calls[0][0];
		expect(built.key).toBe(RANGE_KEYS.CUSTOM);
		expect(moment(built.start).format("YYYY-MM-DD")).toBe("2026-04-01");
		// End is pushed to the start of the FOLLOWING day - see buildCustomRange's own comment on
		// why the inclusive "04-10" the user picked is stored as an exclusive "04-11".
		expect(moment(built.end).format("YYYY-MM-DD")).toBe("2026-04-11");
		expect(screen.queryByText(/Pick a valid start and end date/)).not.toBeInTheDocument();
	});

	it("an end date before the start date shows an error and does not call onChange", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<DateRangePicker value={PRESET_A} onChange={onChange} presets={PRESETS} />);
		await user.click(screen.getByRole("button", { name: "Custom" }));

		const fromInput = screen.getByLabelText("From");
		const toInput = screen.getByLabelText("To");
		await user.clear(fromInput);
		await user.type(fromInput, "2026-04-10");
		await user.clear(toInput);
		await user.type(toInput, "2026-04-01");
		await user.click(screen.getByRole("button", { name: "Apply" }));

		expect(
			screen.getByText("Pick a valid start and end date, with the end on or after the start."),
		).toBeInTheDocument();
		expect(onChange).not.toHaveBeenCalled();
	});

	it("shows the human-readable range description from describeRange", () => {
		render(<DateRangePicker value={PRESET_A} onChange={vi.fn()} presets={PRESETS} />);
		// PRESET_A: Jan 1 (inclusive) through Jan 31 (end is exclusive Feb 1, so the last included
		// day reads back as Jan 31) - see describeRange's own comment on why the inclusive end is
		// what's shown. "Showing " and the range itself are two separate JSX text nodes
		// (`Showing {describeRange(value)}`), so this matches the container's full text content
		// rather than a single text node.
		const summary = document.querySelector(".dateRangePickerSummary");
		expect(summary).toHaveTextContent("Showing Jan 1, 2026 - Jan 31, 2026");
	});

	it("renders no summary crash and no error box when value is null", () => {
		render(<DateRangePicker value={null} onChange={vi.fn()} presets={PRESETS} />);
		expect(screen.getByText("Showing")).toBeInTheDocument();
	});
});
