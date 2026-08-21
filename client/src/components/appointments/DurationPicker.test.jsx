// DurationPicker.jsx tests. Covers describeDuration (a pure function - the actual wording it
// produces, not an assumed "1 hour(s)" formula) plus the two-field HOURS/MINUTES component built
// on top of it. See DurationPicker.jsx's own header comment for why it's two fields rather than a
// single preset list or a from/to pair.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DurationPicker, { describeDuration, CONSULT_DEFAULT_MINUTES } from "./DurationPicker";

describe("describeDuration", () => {
	it("returns an empty string for a falsy/unset duration", () => {
		expect(describeDuration(0)).toBe("");
		expect(describeDuration(null)).toBe("");
		expect(describeDuration(undefined)).toBe("");
	});

	it("describes a duration under an hour as minutes only", () => {
		expect(describeDuration(45)).toBe("45 min");
		expect(describeDuration(15)).toBe("15 min");
	});

	it("describes exactly one hour with no minutes remainder shown", () => {
		expect(describeDuration(60)).toBe("1 hr");
	});

	it("describes a whole number of hours with no minutes remainder shown", () => {
		expect(describeDuration(180)).toBe("3 hr");
	});

	it("describes an hour-plus-minutes duration with both parts", () => {
		expect(describeDuration(90)).toBe("1 hr 30");
		// CONSULT_DEFAULT_MINUTES (45) plus an hour - exercises the boundary with a real constant
		// from the source rather than an arbitrary number.
		expect(describeDuration(CONSULT_DEFAULT_MINUTES + 60)).toBe("1 hr 45");
	});

	it("describes a multi-hour duration with a minutes remainder", () => {
		expect(describeDuration(275)).toBe("4 hr 35");
	});

	// The wording is invariant, not pluralised/singularised by count: the source always emits "hr"
	// and "min" verbatim (no "hrs"/"hours" branch exists), so 1 and 3 read the same way.
	it("never pluralises 'hr' or 'min' based on the count", () => {
		expect(describeDuration(60)).toBe("1 hr");
		expect(describeDuration(120)).toBe("2 hr");
		expect(describeDuration(1)).toBe("1 min");
		expect(describeDuration(2)).toBe("2 min");
	});
});

describe("DurationPicker", () => {
	it("renders the current value split into hours and minutes fields", () => {
		render(<DurationPicker value={195} onChange={vi.fn()} />); // 3 hr 15
		expect(screen.getByLabelText("Hours")).toHaveValue(3);
		expect(screen.getByRole("combobox", { name: "Minutes" })).toHaveTextContent("15");
	});

	it("defaults to zero hours and zero minutes when value is unset", () => {
		render(<DurationPicker value={0} onChange={vi.fn()} />);
		expect(screen.getByLabelText("Hours")).toHaveValue(0);
		expect(screen.getByRole("combobox", { name: "Minutes" })).toHaveTextContent("0");
	});

	it("lists the four quarter-hour minute options by default", async () => {
		const user = userEvent.setup();
		render(<DurationPicker value={60} onChange={vi.fn()} />); // 1 hr 0 - all steps are standard
		await user.click(screen.getByRole("combobox", { name: "Minutes" }));
		expect(screen.getByRole("option", { name: "0" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "15" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "30" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "45" })).toBeInTheDocument();
	});

	// Off-quarter values (a seed, a script, a shop that used to allow anything) get their own
	// option rather than rendering blank - see DurationPicker.jsx's comment on minuteOptions.
	it("adds the stored value's own minutes as an extra option when it's off the quarter-hour", async () => {
		const user = userEvent.setup();
		render(<DurationPicker value={82} onChange={vi.fn()} />); // 1 hr 22 - 22 isn't a quarter-hour
		await user.click(screen.getByRole("combobox", { name: "Minutes" }));
		expect(screen.getByRole("option", { name: "22" })).toBeInTheDocument();
		// The standard steps stay alongside it rather than being replaced.
		expect(screen.getByRole("option", { name: "0" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "45" })).toBeInTheDocument();
	});

	it("calls onChange with the combined total when the minutes selection changes", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<DurationPicker value={60} onChange={onChange} />); // 1 hr 0
		await user.click(screen.getByRole("combobox", { name: "Minutes" }));
		await user.click(screen.getByRole("option", { name: "30" }));
		expect(onChange).toHaveBeenCalledWith(90); // 1 hr 30
	});

	it("calls onChange with the combined total when the hours field changes", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<DurationPicker value={30} onChange={onChange} />); // 0 hr 30
		const hoursInput = screen.getByLabelText("Hours");
		await user.clear(hoursInput);
		await user.type(hoursInput, "2");
		expect(onChange).toHaveBeenLastCalledWith(150); // 2 hr 30
	});

	// emit() guards NaN explicitly (see DurationPicker.jsx) because an emptied number input reports
	// "" and Number("") is 0 but parseInt("", 10) is NaN - a real risk since Hours is free-typed.
	it("treats an emptied hours field as zero rather than ever emitting NaN", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<DurationPicker value={90} onChange={onChange} />); // 1 hr 30
		const hoursInput = screen.getByLabelText("Hours");
		await user.clear(hoursInput);
		expect(onChange).toHaveBeenLastCalledWith(30); // 0 hr 30, not NaN
		onChange.mock.calls.forEach(([total]) => expect(Number.isNaN(total)).toBe(false));
	});
});
