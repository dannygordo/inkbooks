// IBErrorsList.jsx tests. A small presentational list that turns a form's `errors` object (keyed
// by field name, e.g. { email: "Email is required" }) into a bulleted list of the messages. No
// context, no GraphQL - the whole component is a set of branches on the shape of one prop:
//
//   - errors is null/undefined     -> renders nothing (<></>)
//   - errors is {} (no keys)       -> renders nothing (Object.keys(errors).length > 0 is false,
//                                      and the component returns that `false` directly)
//   - errors has 1+ keys           -> renders a <ul class="list"> of Object.values(errors)
//
// The null/undefined and empty-object cases look identical on screen but take different code
// paths (an early return vs. falling through to the `&&` expression) - both are exercised
// separately rather than assumed to be interchangeable, since a future edit to either branch
// could easily fix one and silently break the other.
//
// The component also does a bare `console.log(errors)` on every render - not something to
// remove here (out of scope for a test), but spied on and silenced so the test run's own output
// stays clean, per this codebase's convention on components with unavoidable console noise.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx: IBErrorsList.jsx
// had no `import React` at all before this test file existed (nothing rendered it, so it didn't
// need one under the app's automatic JSX runtime), and needed one added specifically so Vitest's
// classic-runtime JSX transform doesn't throw "React is not defined" the moment this test renders it.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import IBErrorsList from "./IBErrorsList";

describe("IBErrorsList", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders nothing when errors is undefined", () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		const { container } = render(<IBErrorsList />);

		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing when errors is null", () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		const { container } = render(<IBErrorsList errors={null} />);

		expect(container).toBeEmptyDOMElement();
	});

	// Distinct code path from the null/undefined case above (falls through to the
	// Object.keys(...).length > 0 && (...) expression instead of the early return) but must land
	// on the same visible result: nothing on screen.
	it("renders nothing when errors is an empty object", () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		const { container } = render(<IBErrorsList errors={{}} />);

		expect(container).toBeEmptyDOMElement();
	});

	it("renders one list item per error message", () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		render(
			<IBErrorsList
				errors={{
					email: "Email is required",
					password: "Password must be at least 8 characters",
				}}
			/>,
		);

		expect(screen.getByText("Email is required")).toBeInTheDocument();
		expect(
			screen.getByText("Password must be at least 8 characters"),
		).toBeInTheDocument();
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
	});

	// Only the messages (Object.values) are rendered, never the field-name keys - a caller
	// shouldn't see "email" on screen, only the human-readable text describing what's wrong.
	it("renders the messages, not the field-name keys", () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		render(<IBErrorsList errors={{ email: "Email is required" }} />);

		expect(screen.queryByText("email")).not.toBeInTheDocument();
		expect(screen.getByText("Email is required")).toBeInTheDocument();
	});

	it("wraps the list in the expected container classes", () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		const { container } = render(
			<IBErrorsList errors={{ email: "Email is required" }} />,
		);

		expect(container.querySelector(".errors")).toBeInTheDocument();
		expect(container.querySelector("ul.list")).toBeInTheDocument();
	});
});
