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
		// sections - both get the same accessible name from `label`, which makes plain
		// getByLabelText() throw "Found multiple elements with the text of: ...". The hidden
		// input is MUI X's own documented, stable target for assertions (see its "Testing
		// caveats" docs) - `{ hidden: true }` is Testing Library's equivalent of Playwright's
		// `includeHidden: true` used in MUI's own examples, needed since the input carries
		// aria-hidden="true".
		const input = screen.getByRole("textbox", {
			hidden: true,
			name: "Appointment Date/Time",
		});
		expect(input).toBeInTheDocument();
	});

	it("displays a formatted, non-empty value for the given date/time", () => {
		const val = moment("2026-08-15T14:30:00");
		render(
			<IBDateTimePicker label="Appointment Date/Time" val={val} setVal={() => {}} />
		);
		const input = screen.getByRole("textbox", {
			hidden: true,
			name: "Appointment Date/Time",
		});
		// Same reasoning as IBDatePicker.test.jsx - not pinning the exact display format string,
		// just confirming a real value flowed through val into the rendered field.
		expect(input.value).not.toBe("");
		expect(input.value).toContain("2026");
		expect(input.value).toContain("15");
	});
});
