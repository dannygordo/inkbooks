import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBPasswordField from "./IBPasswordField";

describe("IBPasswordField", () => {
	it("renders masked by default with its label", () => {
		render(<IBPasswordField />);
		const input = screen.getByLabelText("password");
		expect(input).toHaveAttribute("type", "password");
	});

	it("toggles to plain text and back when the visibility icon is clicked", async () => {
		const user = userEvent.setup();
		render(<IBPasswordField />);
		const input = screen.getByLabelText("password");
		const toggle = screen.getByRole("button", {
			name: /toggle password visibility/i,
		});

		await user.click(toggle);
		expect(input).toHaveAttribute("type", "text");

		await user.click(toggle);
		expect(input).toHaveAttribute("type", "password");
	});

	it("respects a custom id/label and required=false", () => {
		render(
			<IBPasswordField id="confirmPassword" label="Confirm password" required={false} />
		);
		const input = screen.getByLabelText("Confirm password");
		expect(input).not.toBeRequired();
	});
});
