// IBCircularProgressWithLabel.jsx tests. A small presentational wrapper around MUI's
// CircularProgress: it forwards `value` straight through as the determinate progress value, and
// overlays a rounded whole-number percentage label on top of it.
//
// Explicit React import - see the matching note in context/auth.test.jsx: under Vitest,
// @vitejs/plugin-react compiles test-file JSX with the classic runtime, so React needs to be in
// scope explicitly here even though app components rely on the automatic runtime.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import IBCircularProgressWithLabel from "./IBCircularProgressWithLabel";

describe("IBCircularProgressWithLabel", () => {
	it("renders the given value on MUI's determinate CircularProgress", () => {
		render(<IBCircularProgressWithLabel value={45} />);

		const progressbar = screen.getByRole("progressbar");
		expect(progressbar).toHaveAttribute("aria-valuenow", "45");
	});

	it("shows the value rounded to a whole-number percentage label", () => {
		render(<IBCircularProgressWithLabel value={45} />);

		expect(screen.getByText("45%")).toBeInTheDocument();
	});

	it("rounds a fractional value rather than truncating it", () => {
		render(<IBCircularProgressWithLabel value={33.6} />);

		expect(screen.getByText("34%")).toBeInTheDocument();
	});

	it("renders 0% at the very start of an upload", () => {
		render(<IBCircularProgressWithLabel value={0} />);

		expect(screen.getByText("0%")).toBeInTheDocument();
		expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
	});
});
