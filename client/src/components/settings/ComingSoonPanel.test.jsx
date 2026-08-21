// ComingSoonPanel.jsx tests. The panel is a plain placeholder card - see its own header comment on
// why a category with no real settings yet is still SHOWN rather than hidden from the Settings nav.
// It takes no context and fires no GraphQL, so these tests are just "does it render what it was
// given, and does the fallback copy show up when description is omitted".
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ComingSoonPanel from "./ComingSoonPanel";

describe("ComingSoonPanel", () => {
	it("renders the given label as a heading", () => {
		render(<ComingSoonPanel label="Calendar" description="Something" />);

		expect(screen.getByRole("heading", { name: "Calendar" })).toBeInTheDocument();
	});

	it("renders the given description", () => {
		render(
			<ComingSoonPanel
				label="Taxes"
				description="Sales tax and processing offset already live under Square Config."
			/>,
		);

		expect(
			screen.getByText("Sales tax and processing offset already live under Square Config."),
		).toBeInTheDocument();
	});

	// No description prop at all - settingsCategories.jsx never omits it today, but the component
	// itself defaults to explanatory copy rather than an empty paragraph, and that default is worth
	// pinning on its own.
	it("falls back to the generic not-built-yet copy when no description is given", () => {
		render(<ComingSoonPanel label="Analytics" />);

		expect(
			screen.getByText("Nothing to configure here yet - this section is on the way."),
		).toBeInTheDocument();
	});

	// Two different categories must not bleed into each other's copy - a regression here would be
	// "every ComingSoonPanel shows the same label/description no matter what it was passed".
	it("reflects the label and description it was actually passed, not some other category's", () => {
		render(
			<ComingSoonPanel
				label="Analytics"
				description="Dashboard figures already live on Home - export and custom-report options will land here."
			/>,
		);

		expect(screen.getByRole("heading", { name: "Analytics" })).toBeInTheDocument();
		expect(screen.queryByText("Calendar")).not.toBeInTheDocument();
		expect(
			screen.queryByText("Nothing to configure here yet - this section is on the way."),
		).not.toBeInTheDocument();
	});
});
