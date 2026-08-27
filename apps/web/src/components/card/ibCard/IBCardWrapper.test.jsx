// IBCardWrapper.jsx tests.
//
// See the component's own header comment for the bug this file exists to guard against: every
// card used to carry `key={Date.now()}` on its single root element - a key that reconciliation
// never even reads there, since a component's own root has no siblings to distinguish it from -
// and because Date.now() is a new value on every render, React treated each re-render as "a
// different card" and threw the old one away, remounting a fresh subtree underneath it. The
// visible symptom was that any input living inside a card lost focus after every keystroke, since
// the input itself was destroyed and recreated along with the rest of the card.
//
// The most important test below is therefore not "renders its children" (trivially true) but
// "an input inside the card keeps its focus and value across a re-render triggered from outside
// the card" - that's the exact shape of the regression, reproduced with a real focused input and
// a real parent re-render, not an assertion about the absence of a `key` prop.
//
// No router, no Apollo, no AuthContext - IBCardWrapper reads nothing but `children`.
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBCardWrapper from "./IBCardWrapper";

describe("rendering", () => {
	it("renders its children inside a div.ibCardWrapper", () => {
		const { container } = render(
			<IBCardWrapper>
				<span>Card contents</span>
			</IBCardWrapper>,
		);
		const wrapper = container.querySelector(".ibCardWrapper");
		expect(wrapper).toBeInTheDocument();
		expect(wrapper).toContainElement(screen.getByText("Card contents"));
	});

	it("renders multiple children", () => {
		render(
			<IBCardWrapper>
				<span>First</span>
				<span>Second</span>
			</IBCardWrapper>,
		);
		expect(screen.getByText("First")).toBeInTheDocument();
		expect(screen.getByText("Second")).toBeInTheDocument();
	});

	it("renders an otherwise-empty wrapper when given no children", () => {
		const { container } = render(<IBCardWrapper />);
		const wrapper = container.querySelector(".ibCardWrapper");
		expect(wrapper).toBeInTheDocument();
		expect(wrapper).toBeEmptyDOMElement();
	});

	it("does not attach a click handler to the wrapper - clicking it is a no-op", async () => {
		// handleClick (and the onClick that returned it instead of calling it) is gone entirely -
		// nothing in the app ever relied on the card itself being clickable. The most this test can
		// prove is the negative: clicking the wrapper doesn't throw and doesn't fire anything.
		const user = userEvent.setup();
		const { container } = render(
			<IBCardWrapper>
				<span>Card contents</span>
			</IBCardWrapper>,
		);
		const wrapper = container.querySelector(".ibCardWrapper");
		await user.click(wrapper);
		expect(screen.getByText("Card contents")).toBeInTheDocument();
	});
});

describe("regression: focus survives a parent re-render", () => {
	function BookingLinkField() {
		const [value, setValue] = useState("");
		return (
			<IBCardWrapper>
				<input
					aria-label="Booking link"
					value={value}
					onChange={(e) => setValue(e.target.value)}
				/>
			</IBCardWrapper>
		);
	}

	it("keeps the same input focused and accumulates typed text across re-renders", async () => {
		const user = userEvent.setup();
		render(<BookingLinkField />);

		const input = screen.getByLabelText("Booking link");
		await user.click(input);
		expect(input).toHaveFocus();

		// Each keystroke updates the parent's state and re-renders IBCardWrapper. With the old
		// `key={Date.now()}` bug, this loop would have destroyed and recreated `input` on every
		// character, so only the last keystroke would have landed and focus would have been lost
		// partway through.
		await user.type(input, "inkbooks.com/arya");

		expect(input).toHaveValue("inkbooks.com/arya");
		expect(input).toHaveFocus();
	});
});
