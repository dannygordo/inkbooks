import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBInput from "./IBInput";

describe("IBInput", () => {
	it("is controlled when given a value, so later updates reach the box", async () => {
		// The uncontrolled default is fine for a field whose value is known at mount. It is silently
		// wrong for one that changes while on screen - the registration form suggests a booking link
		// as the name is typed, and with defaultValue the suggestion went into React state and got
		// submitted without ever being rendered. A value nobody was shown is exactly what this
		// codebase deleted User.username over.
		const { rerender } = render(<IBInput id="slug" label="Booking link" value="jon" onChange={() => {}} />);
		expect(screen.getByDisplayValue("jon")).toBeInTheDocument();

		rerender(<IBInput id="slug" label="Booking link" value="jon-snow" onChange={() => {}} />);
		expect(screen.getByDisplayValue("jon-snow")).toBeInTheDocument();
	});

	it("renders with a label and default value", () => {
		render(<IBInput id="title" label="Title" defaultValue="Botanical sleeve" />);
		const input = screen.getByLabelText("Title");
		expect(input).toBeInTheDocument();
		expect(input).toHaveValue("Botanical sleeve");
	});

	it("calls onChange as the user types", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<IBInput id="title" label="Title" onChange={onChange} />);

		await user.type(screen.getByLabelText("Title"), "hi");

		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it("shows the error state and helper text together", () => {
		render(
			<IBInput
				id="title"
				label="Title"
				error
				helperText="Title cannot be empty"
			/>
		);
		expect(screen.getByText("Title cannot be empty")).toBeInTheDocument();
		expect(screen.getByLabelText("Title")).toBeInvalid();
	});

	it("disables the field when disabled is set", () => {
		render(<IBInput id="title" label="Title" disabled />);
		expect(screen.getByLabelText("Title")).toBeDisabled();
	});
});
