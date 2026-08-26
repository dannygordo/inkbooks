// FormField.jsx tests. Per the component's own header comment, this is a purely presentational
// wrapper: a REAL <label htmlFor> (not MUI's floating label) stacked above an optional help
// paragraph, stacked above whatever control the caller passes as children - the register wizard's
// field convention, shared under app-wide class names (ibField/ibFieldLabel/ibFieldHelp/
// ibFieldControl) rather than reinvented per-modal. It has no state, no hooks beyond React itself,
// and branches on exactly one thing (`help` present or not) - so these tests are narrow, but they
// pin down the two things the component's own comment says actually matter: that `id` is real
// wiring (not decorative) linking the label to the control, and that the visual stacking order
// (label, then help, then control) matches "the field reads in the order the decision is made".
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FormField from "./FormField";

describe("FormField", () => {
	it("renders a real <label htmlFor> that associates with a child control sharing its id", () => {
		render(
			<FormField id="clientEmail" label="Email">
				<input id="clientEmail" />
			</FormField>
		);

		// getByLabelText only resolves if the <label>'s htmlFor genuinely matches the control's id -
		// this is the "id is required, not decorative" claim from the component's own header comment,
		// exercised the same way an assistive-tech user's screen reader would resolve it.
		const control = screen.getByLabelText("Email");
		expect(control.tagName).toBe("INPUT");
	});

	it("renders the label's htmlFor as exactly the given id even when children aren't a matching input", () => {
		// FormField doesn't inspect or clone its children to wire up the association itself - it
		// just renders `<label htmlFor={id}>`. Passing a plain, non-connected child (like static
		// text) still emits that attribute either way, so the wiring is confirmed at the label level
		// directly rather than relying on a lucky match with getByLabelText.
		render(
			<FormField id="notes-field" label="Notes">
				<p>read-only notes</p>
			</FormField>
		);

		const label = screen.getByText("Notes");
		expect(label.tagName).toBe("LABEL");
		expect(label).toHaveAttribute("for", "notes-field");
	});

	it("renders no help paragraph at all when `help` is omitted", () => {
		const { container } = render(
			<FormField id="f1" label="Field one">
				<input id="f1" />
			</FormField>
		);

		// `{help && <p className="ibFieldHelp">...}` - false renders nothing, not an empty <p>, so
		// this checks the element itself never mounts rather than checking it's merely blank.
		expect(container.querySelector(".ibFieldHelp")).toBeNull();
	});

	it("renders the help text between the label and the control when `help` is provided", () => {
		const { container } = render(
			<FormField id="f2" label="Placement" help="Where on the body?">
				<input id="f2" />
			</FormField>
		);

		expect(screen.getByText("Where on the body?")).toBeInTheDocument();

		// Confirms the actual DOM order (label, then help, then control container) rather than just
		// that all three are present somewhere - "the field reads in the order the decision is made"
		// per the component's own header comment.
		const field = container.querySelector(".ibField");
		const children = Array.from(field.children);
		const classNames = children.map((el) => el.className);
		expect(classNames).toEqual(["ibFieldLabel", "ibFieldHelp", "ibFieldControl"]);
	});

	it("wraps children in a .ibFieldControl container, regardless of how many children are passed", () => {
		const { container } = render(
			<FormField id="f3" label="Style">
				<input id="f3" data-testid="style-input" />
				<p data-testid="style-hint">pick one</p>
			</FormField>
		);

		const control = container.querySelector(".ibFieldControl");
		expect(control).not.toBeNull();
		expect(control.querySelector('[data-testid="style-input"]')).not.toBeNull();
		expect(control.querySelector('[data-testid="style-hint"]')).not.toBeNull();
	});

	it("applies the app-wide class names the header comment documents (ibField/ibFieldLabel/ibFieldControl)", () => {
		const { container } = render(
			<FormField id="f4" label="Size">
				<input id="f4" />
			</FormField>
		);

		expect(container.querySelector("div.ibField")).not.toBeNull();
		expect(container.querySelector("label.ibFieldLabel")).not.toBeNull();
		expect(container.querySelector("div.ibFieldControl")).not.toBeNull();
	});
});
