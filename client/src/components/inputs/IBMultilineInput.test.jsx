import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBMultilineInput from "./IBMultilineInput";

describe("IBMultilineInput", () => {
	it("renders a multiline textbox with a label and placeholder", () => {
		render(
			<IBMultilineInput
				id="description"
				label="Description"
				placeholder="Describe the piece"
			/>
		);
		const textbox = screen.getByLabelText("Description");
		expect(textbox).toBeInTheDocument();
		expect(textbox.tagName.toLowerCase()).toBe("textarea");
		expect(textbox).toHaveAttribute("placeholder", "Describe the piece");
	});

	it("calls onChange as the user types", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<IBMultilineInput id="description" label="Description" onChange={onChange} />);

		await user.type(screen.getByLabelText("Description"), "hi");

		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it("shows the error state and helper text together", () => {
		render(
			<IBMultilineInput
				id="description"
				label="Description"
				error
				helperText="Description cannot be empty"
			/>
		);
		expect(screen.getByText("Description cannot be empty")).toBeInTheDocument();
		expect(screen.getByLabelText("Description")).toBeInvalid();
	});
});
