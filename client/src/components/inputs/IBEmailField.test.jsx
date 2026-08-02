import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import IBEmailField from "./IBEmailField";

describe("IBEmailField", () => {
	it("renders a required email input", () => {
		render(<IBEmailField />);
		const input = screen.getByLabelText(/email address/i);
		expect(input).toBeInTheDocument();
		expect(input).toHaveAttribute("type", "email");
		expect(input).toBeRequired();
	});

	it("uses the provided defaultValue", () => {
		render(<IBEmailField defaultValue="gordo@copperwolf.com" />);
		expect(screen.getByLabelText(/email address/i)).toHaveValue(
			"gordo@copperwolf.com"
		);
	});
});
