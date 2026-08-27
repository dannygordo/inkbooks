import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBSubmitButton from "./IBSubmitButton";

describe("IBSubmitButton", () => {
	it("renders as a submit-type button with default text", () => {
		render(<IBSubmitButton />);
		const button = screen.getByRole("button", { name: "Submit" });
		expect(button).toHaveAttribute("type", "submit");
	});

	it("submits its enclosing form when clicked", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn((e) => e.preventDefault());
		render(
			<form onSubmit={onSubmit}>
				<IBSubmitButton text="Create Project" />
			</form>
		);

		await user.click(screen.getByRole("button", { name: "Create Project" }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
	});
});
