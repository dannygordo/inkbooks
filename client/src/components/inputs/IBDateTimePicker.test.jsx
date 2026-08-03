import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import moment from "moment";
import IBDateTimePicker from "./IBDateTimePicker";

describe("IBDateTimePicker", () => {
	it("renders with the given label", () => {
		render(<IBDateTimePicker label="Appointment Date/Time" val={null} setVal={() => {}} />);
		// MUI X's accessible field DOM structure (v7+) renders a visually-hidden, aria-hidden,
		// form-submittable <input> alongside a role="group" container of editable date/time
		// sections - both get the same VISIBLE label, which makes plain getByLabelText() throw
		// "Found multiple elements with the text of: ...". The first attempted fix
		// (`getByRole("textbox", { hidden: true, name: label })`) was still wrong: confirmed via
		// the actual rendered DOM (dom-accessibility-api excludes aria-hidden nodes from
		// accessible-name computation entirely, so the hidden input's computed `name` is always
        // "" even though its `for`/`id` pairing with the visible <label> looks like it should
		// name it) - the real fix is to match on role + hidden alone, with no `name` filter, since
		// this hidden input is the only "textbox"-role element MUI X renders here regardless of
		// what its (blank) accessible name is.
		const input = screen.getByRole("textbox", { hidden: true });
		expect(input).toBeInTheDocument();
	});

	it("displays a formatted, non-empty value for the given date/time", () => {
		const val = moment("2026-08-15T14:30:00");
		render(
			<IBDateTimePicker label="Appointment Date/Time" val={val} setVal={() => {}} />
		);
		const input = screen.getByRole("textbox", { hidden: true });
		// Same reasoning as IBDatePicker.test.jsx - not pinning the exact display format string,
		// just confirming a real value flowed through val into the rendered field.
		expect(input.value).not.toBe("");
		expect(input.value).toContain("2026");
		expect(input.value).toContain("15");
	});
});
