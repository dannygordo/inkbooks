import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import IBButton from "./IBButton";

// IBButton isn't imported/used anywhere else in the client - confirmed via a full-codebase grep
// while surveying untested IB* components. Documenting that here rather than silently expanding
// scope to "fix" it: it also has no onClick prop at all (unlike IBSubmitButton, its sibling),
// so as written it can only ever do anything useful as a plain type="submit" button inside a
// <form>, never as a standalone click handler. Testing its actual (limited) behavior, not
// pretending it does more than it does.
describe("IBButton", () => {
	it("renders with default text, variant, and type", () => {
		render(<IBButton text="Save" />);
		const button = screen.getByRole("button", { name: "Save" });
		expect(button).toBeInTheDocument();
		expect(button).toHaveAttribute("type", "button");
	});

	it("renders as a submit button when type='submit' is passed", () => {
		render(<IBButton text="Send" type="submit" />);
		expect(screen.getByRole("button", { name: "Send" })).toHaveAttribute(
			"type",
			"submit"
		);
	});

	it("renders empty text by default", () => {
		render(<IBButton />);
		expect(screen.getByRole("button")).toHaveTextContent("");
	});
});
