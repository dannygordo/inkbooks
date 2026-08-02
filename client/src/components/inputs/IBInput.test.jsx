import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBInput from "./IBInput";

describe("IBInput", () => {
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
