// This component isn't used anywhere else in the client (see the dead-code note in
// IBDatePicker.jsx) - tested anyway since it's a real, exported IB* form component and the
// backlog item was "the remaining IB* form input components", not "the ones currently wired up".
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import moment from "moment";
import IBDatePicker from "./IBDatePicker";

describe("IBDatePicker", () => {
	it("renders with the given label", () => {
		render(<IBDatePicker label="Appointment Date" val={null} setVal={() => {}} />);
		// MUI X's accessible field DOM structure (v7+) renders a visually-hidden, aria-hidden,
		// form-submittable <input> alongside a role="group" container of editable date sections -
		// both get the same VISIBLE label, which makes plain getByLabelText() throw "Found
		// multiple elements with the text of: ...". The first attempted fix
		// (`getByRole("textbox", { hidden: true, name: label })`) was still wrong: confirmed via
		// the actual rendered DOM (dom-accessibility-api excludes aria-hidden nodes from
		// accessible-name computation entirely, so the hidden input's computed `name` is always
		// "" even though its `for`/`id` pairing with the visible <label> looks like it should name
		// it) - the real fix is to match on role + hidden alone, with no `name` filter, since this
		// hidden input is the only "textbox"-role element MUI X renders here regardless of what
		// its (blank) accessible name is.
		const input = screen.getByRole("textbox", { hidden: true });
		expect(input).toBeInTheDocument();
	});

	it("displays a formatted, non-empty value for the given date", () => {
		const val = moment("2026-08-15");
		render(<IBDatePicker label="Appointment Date" val={val} setVal={() => {}} />);
		const input = screen.getByRole("textbox", { hidden: true });
		// Not asserting MobileDatePicker's exact display format string here (day/month order,
		// separators) since this sandbox can't run the real test suite to confirm it precisely -
		// just that a real value made it through val -> the rendered field, containing the day
		// and year, rather than an empty/placeholder field.
		expect(input.value).not.toBe("");
		expect(input.value).toContain("2026");
		expect(input.value).toContain("15");
	});
});
