// IBRouteNotFound.jsx tests. This is the catch-all 404 card shown for any route the router
// doesn't recognise. It has no props and no context - the only two things worth pinning are
// that the copy from APP_SETTINGS_CONSTANTS actually reaches the screen, and that clicking the
// card calls navigate(-1) (go back), not some hardcoded path.
//
// Rendered inside a real MemoryRouter with two history entries rather than mocking
// react-router-dom's useNavigate - per this codebase's convention (see EntityList.test.jsx's own
// comment on the same choice) - so navigate(-1) is exercised for real: a location probe on the
// first entry proves the browser actually went "back", which a mocked navigate() spy could never
// distinguish from navigate("/some/wrong/path").
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx: Vitest transforms
// JSX with the classic runtime, so a component reachable from a test needs React in scope itself
// or it throws "React is not defined" the moment it renders.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import IBRouteNotFound from "./IBRouteNotFound";
import { APP_SETTINGS_CONSTANTS } from "../../constants";

// ROUTE_NOT_FOUND_TEXT contains a literal double space after the period. getByText's default
// normalizer collapses the rendered DOM text's whitespace before comparing, but does NOT
// normalize the matcher string passed in - so matching against the raw constant fails even
// though the text is genuinely on screen. Collapsing it the same way here is the fix, not
// touching the constant itself (a display string, not logic).
const ROUTE_NOT_FOUND_TEXT = APP_SETTINGS_CONSTANTS.ROUTE_NOT_FOUND_TEXT.replace(/\s+/g, " ");

// Reads back wherever the router actually ends up, so "clicking the card goes back" is verified
// by observing the real location change rather than just asserting navigate(-1) was called.
function LocationProbe() {
	const location = useLocation();
	return <div data-testid="location">{location.pathname}</div>;
}

function renderNotFound() {
	return render(
		<MemoryRouter initialEntries={["/dashboard", "/some/unknown/route"]} initialIndex={1}>
			<Routes>
				<Route path="/dashboard" element={<LocationProbe />} />
				<Route
					path="/some/unknown/route"
					element={
						<>
							<IBRouteNotFound />
							<LocationProbe />
						</>
					}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("IBRouteNotFound", () => {
	it("shows the not-found copy from APP_SETTINGS_CONSTANTS", () => {
		renderNotFound();

		expect(
			screen.getByText(ROUTE_NOT_FOUND_TEXT),
		).toBeInTheDocument();
	});

	it("starts out on the unknown route, not already redirected", () => {
		renderNotFound();

		expect(screen.getByTestId("location")).toHaveTextContent("/some/unknown/route");
	});

	// The whole point of the component: it's a dead end with no real destination, so its one
	// interaction sends the user back to wherever they came from (navigate(-1)) rather than to a
	// fixed route like "/" - which would silently drop them out of whatever flow they were in.
	it("navigates back in history when the card is clicked", async () => {
		const user = userEvent.setup();
		renderNotFound();

		await user.click(screen.getByText(ROUTE_NOT_FOUND_TEXT));

		expect(await screen.findByTestId("location")).toHaveTextContent("/dashboard");
	});

	it("renders the click target as the ibRouteNotFoundCard element", () => {
		const { container } = renderNotFound();

		expect(container.querySelector(".ibRouteNotFoundCard")).toBeInTheDocument();
	});
});
