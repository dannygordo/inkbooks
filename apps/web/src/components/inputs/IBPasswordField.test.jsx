import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBPasswordField from "./IBPasswordField";

describe("IBPasswordField", () => {
	it("renders masked by default with its label", () => {
		render(<IBPasswordField />);
		// IBPasswordField defaults `required` to true, and MUI's required-field asterisk is
		// rendered as an extra child of the <label> element, making its full text content
		// "password *" rather than exactly "password" - an exact-string getByLabelText("password")
		// throws "Unable to find a label with the text of: password" as a result (confirmed
		// against the real rendered DOM). A plain regex fixed that but then broke the other
		// direction: once the visibility-toggle button actually rendered (see the slotProps fix in
		// IBPasswordField.jsx), its own `aria-label="Toggle Password visibility"` also contains
        // "password" as a substring, so /password/i matched *two* elements - the real input and
		// the button - and getByLabelText threw "Found multiple elements". The `selector: "input"`
		// option scopes the match to actual form-control elements, excluding the button entirely,
		// without having to make the regex fragile/anchored against label text we don't fully
		// control (the asterisk).
		const input = screen.getByLabelText(/password/i, { selector: "input" });
		expect(input).toHaveAttribute("type", "password");
	});

	it("toggles to plain text and back when the visibility icon is clicked", async () => {
		const user = userEvent.setup();
		render(<IBPasswordField />);
		const input = screen.getByLabelText(/password/i, { selector: "input" });
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
