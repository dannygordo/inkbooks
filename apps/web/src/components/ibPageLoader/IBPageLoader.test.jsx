// IBPageLoader.jsx tests. A full-page spinner shown while a route or a lazy chunk is loading. No
// props, no context - it either renders the spinner and its caption or it doesn't, so the whole
// surface area here is "both pieces are actually on screen".
//
// The component's own header comment documents a real regression worth pinning: LOADING_TEXT was
// originally passed as a child of MUI's <CircularProgress>, which renders a self-contained SVG and
// silently ignores any children - so the caption never reached the screen even though the code
// "looked" like it was rendering it. It's now a real sibling <span>. That's exactly the kind of
// break a shallow "does it render" smoke test wouldn't catch, so the text is asserted for real
// here, not just implied by the component not throwing.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import IBPageLoader from "./IBPageLoader";
import { APP_SETTINGS_CONSTANTS } from "../../constants";

describe("IBPageLoader", () => {
	it("renders the loading caption from APP_SETTINGS_CONSTANTS", () => {
		render(<IBPageLoader />);

		expect(screen.getByText(APP_SETTINGS_CONSTANTS.LOADING_TEXT)).toBeInTheDocument();
	});

	// Guards against the exact regression described above: the caption must be a real sibling
	// element on screen, not swallowed as an ignored child of CircularProgress's own SVG markup.
	it("renders the caption as its own element, not inside the spinner", () => {
		render(<IBPageLoader />);

		const caption = screen.getByText(APP_SETTINGS_CONSTANTS.LOADING_TEXT);
		expect(caption.tagName).toBe("SPAN");
		expect(caption).toHaveClass("ibPageLoaderText");
	});

	// MUI's CircularProgress renders role="progressbar" - asserting on that role rather than a
	// class name ties the test to CircularProgress's actual accessibility contract instead of an
	// implementation detail of how MUI happens to style it.
	it("renders the MUI spinner", () => {
		render(<IBPageLoader />);

		expect(screen.getByRole("progressbar")).toBeInTheDocument();
	});

	it("wraps everything in the expected container classes", () => {
		const { container } = render(<IBPageLoader />);

		expect(container.querySelector(".ibPageLoader")).toBeInTheDocument();
		expect(container.querySelector(".ibPageLoaderContainer")).toBeInTheDocument();
	});
});
