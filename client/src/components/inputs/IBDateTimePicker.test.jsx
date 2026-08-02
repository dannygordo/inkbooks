import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import moment from "moment";
import IBDateTimePicker from "./IBDateTimePicker";

describe("IBDateTimePicker", () => {
	it("renders with the given label", () => {
		render(<IBDateTimePicker label="Appointment Date/Time" val={null} setVal={() => {}} />);
		expect(screen.getByLabelText("Appointment Date/Time")).toBeInTheDocument();
	});

	it("displays a formatted, non-empty value for the given date/time", () => {
		const val = moment("2026-08-15T14:30:00");
		render(
			<IBDateTimePicker label="Appointment Date/Time" val={val} setVal={() => {}} />
		);
		const input = screen.getByLabelText("Appointment Date/Time");
		// Same reasoning as IBDatePicker.test.jsx - not pinning the exact display format string,
		// just confirming a real value flowed through val into the rendered field.
		expect(input.value).not.toBe("");
		expect(input.value).toContain("2026");
		expect(input.value).toContain("15");
	});
});
