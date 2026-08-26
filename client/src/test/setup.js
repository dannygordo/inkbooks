// Shrinks the DOM snapshot @testing-library/dom prints when a getBy/findBy query fails or times
// out - by default (DEBUG_PRINT_LIMIT's default is 7000) that's the ENTIRE current document,
// often several hundred lines of MUI's generated markup (see any Income.test.jsx/Expenses.test.jsx
// failure for an example). Across a run with many failures, that's what pushes the earliest
// failures out of a terminal's scrollback before the run even finishes - see vite.config.js's
// test.diff.truncateThreshold for the matching fix on the assertion-diff side of the same problem.
// Read fresh out of process.env every time a query fails (dist/pretty-dom.js), not cached at
// import time, so setting it here - before any test runs - is all this needs.
process.env.DEBUG_PRINT_LIMIT = process.env.DEBUG_PRINT_LIMIT || "300";

// Runs before every test file (see vite.config.js's test.setupFiles). Extends Vitest's `expect`
// with jest-dom's matchers (toBeInTheDocument, toHaveTextContent, etc.) - without this import,
// those matchers don't exist and every test using them would fail with "expect(...).toBeInTheDocument
// is not a function".
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement window.matchMedia at all - MUI's useMediaQuery (used internally by
// Dialog's fullScreen behavior, responsive pickers, etc.) calls it unconditionally and throws
// "window.matchMedia is not a function" the moment any component using it is rendered. Needed
// starting with the calendar dialog tests (CreateEventDialog/UpdateEventDialog use MUI X's
// MobileDateTimePicker, which renders a MUI Dialog under the hood), but harmless/necessary for
// any future test involving MUI Dialogs or responsive components.
if (!window.matchMedia) {
	window.matchMedia = (query) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	});
}

// jsdom doesn't implement Element.prototype.scrollIntoView at all - components that scroll a
// list to a sentinel element (IBChatBox's auto-scroll-to-bottom effect, and any future one like
// it) call it unconditionally, which throws "scrollIntoView is not a function" the moment such a
// component mounts. Same category of gap as window.matchMedia above; stubbed as a no-op for the
// same reason - a component's own scroll-into-view behavior isn't what these tests choose to
// verify.
if (!Element.prototype.scrollIntoView) {
	Element.prototype.scrollIntoView = () => {};
}

// React Testing Library doesn't auto-unmount between tests outside of Jest's global afterEach
// convention - Vitest doesn't provide that automatically, so it's done explicitly here. Without
// this, a component rendered in one test can still be attached to the jsdom document when the
// next test's render() runs, causing duplicate-element query failures that have nothing to do
// with the test actually being written.
afterEach(() => {
	cleanup();
});
