// Runs before every test file (see vite.config.js's test.setupFiles). Extends Vitest's `expect`
// with jest-dom's matchers (toBeInTheDocument, toHaveTextContent, etc.) - without this import,
// those matchers don't exist and every test using them would fail with "expect(...).toBeInTheDocument
// is not a function".
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React Testing Library doesn't auto-unmount between tests outside of Jest's global afterEach
// convention - Vitest doesn't provide that automatically, so it's done explicitly here. Without
// this, a component rendered in one test can still be attached to the jsdom document when the
// next test's render() runs, causing duplicate-element query failures that have nothing to do
// with the test actually being written.
afterEach(() => {
	cleanup();
});
