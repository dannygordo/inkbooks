// SquarePanel.jsx tests. The panel's whole job is to say something DIFFERENT to an artist who
// owns their Square connection and to one whose shop owns it (DECISIONS.md M9), so most of these
// assert on which of those two things it said.
//
// Explicit React import - the app relies on @vitejs/plugin-react's automatic JSX runtime, but
// Vitest's transform for *test* files falls back to the classic runtime without this. See the
// matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import SquarePanel from "./SquarePanel";
import ShopService from "../../services/ShopService";

// THE REAL DOCUMENTS, imported from the service - not copies. MockedProvider pairs a request with
// its result by comparing the printed document, so a hand-written near-copy silently stops
// matching after one field of drift and the test fails as a network error that looks like a
// component bug. Same reasoning as Login.test.jsx.
const connectionMock = (connection) => ({
	request: { query: ShopService.MY_SQUARE_CONNECTION },
	result: { data: { getMySquareConnection: { __typename: "SquareConnection", ...connection } } },
});

const INDEPENDENT_DISCONNECTED = {
	source: "artist",
	connected: false,
	locationId: null,
	connectedAt: null,
	ownerName: null,
};

const INDEPENDENT_CONNECTED = {
	source: "artist",
	connected: true,
	locationId: "L_ABC",
	connectedAt: "2026-03-04T00:00:00.000Z",
	ownerName: null,
};

const SHOP_CONNECTED = {
	source: "shop",
	connected: true,
	locationId: "L_SHOP",
	connectedAt: "2026-01-09T00:00:00.000Z",
	ownerName: "Iron Anchor Tattoo",
};

const SHOP_DISCONNECTED = {
	source: "shop",
	connected: false,
	locationId: null,
	connectedAt: null,
	ownerName: "Iron Anchor Tattoo",
};

function renderPanel({ connection, route = "/settings", extraMocks = [] } = {}) {
	render(
		<MemoryRouter initialEntries={[route]}>
			<MockedProvider mocks={[connectionMock(connection), ...extraMocks]}>
				<SquarePanel />
			</MockedProvider>
		</MemoryRouter>,
	);
}

describe("an independent artist", () => {
	it("is offered the connect button - the gap M9 exists to close", async () => {
		renderPanel({ connection: INDEPENDENT_DISCONNECTED });

		expect(
			await screen.findByRole("button", { name: "Connect with Square" }),
		).toBeInTheDocument();
		expect(screen.getByText("Not connected")).toBeInTheDocument();
	});

	it("can disconnect once connected", async () => {
		renderPanel({ connection: INDEPENDENT_CONNECTED });

		expect(await screen.findByText("Connected")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Disconnect Square" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Connect with Square" }),
		).not.toBeInTheDocument();
	});
});

describe("an artist whose shop owns the connection", () => {
	// The panel renders for them rather than hiding, because "where does my money go" is otherwise
	// unanswered anywhere in the product.
	it("names the shop instead of offering a button they cannot use", async () => {
		renderPanel({ connection: SHOP_CONNECTED });

		expect(await screen.findByText("Connected")).toBeInTheDocument();
		expect(screen.getByText(/Iron Anchor Tattoo/)).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Connect with Square" }),
		).not.toBeInTheDocument();
	});

	// A button that always errors is worse than no button: the server refuses disconnectMySquare
	// for a shop artist, so offering it would only ever produce a failure.
	it("gets no disconnect button for an account that is not theirs", async () => {
		renderPanel({ connection: SHOP_CONNECTED });

		await screen.findByText("Connected");
		expect(
			screen.queryByRole("button", { name: "Disconnect Square" }),
		).not.toBeInTheDocument();
	});

	// The state that would otherwise look like the artist's own problem to fix.
	it("says the SHOP has not connected, and still offers no button", async () => {
		renderPanel({ connection: SHOP_DISCONNECTED });

		expect(
			await screen.findByText("Your shop has not connected Square yet."),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Connect with Square" }),
		).not.toBeInTheDocument();
	});
});

describe("the OAuth redirect banner", () => {
	// routes/squareOAuth.js sends an ARTIST owner back to /settings?square=<status>.
	it("reports a successful connection", async () => {
		renderPanel({
			connection: INDEPENDENT_CONNECTED,
			route: "/settings?square=connected",
		});

		expect(await screen.findByText(/Square account connected/)).toBeInTheDocument();
	});

	it("reports a cancelled one without dressing it up as an error", async () => {
		renderPanel({
			connection: INDEPENDENT_DISCONNECTED,
			route: "/settings?square=denied",
		});

		expect(await screen.findByText(/Square connection was cancelled/)).toBeInTheDocument();
	});

	// An unrecognised value must not render an empty banner.
	it("shows nothing for a status it does not recognise", async () => {
		renderPanel({
			connection: INDEPENDENT_DISCONNECTED,
			route: "/settings?square=somethingelse",
		});

		await screen.findByText("Not connected");
		expect(screen.queryByText(/click to dismiss/)).not.toBeInTheDocument();
	});

	it("renders no banner at all on a normal visit", async () => {
		renderPanel({ connection: INDEPENDENT_DISCONNECTED });

		await screen.findByText("Not connected");
		expect(screen.queryByText(/click to dismiss/)).not.toBeInTheDocument();
	});
});

describe("disconnecting", () => {
	let confirmSpy;

	beforeEach(() => {
		confirmSpy = vi.spyOn(window, "confirm");
	});

	afterEach(() => {
		confirmSpy.mockRestore();
	});

	it("does nothing when the confirmation is declined", async () => {
		confirmSpy.mockReturnValue(false);
		const user = userEvent.setup();
		renderPanel({ connection: INDEPENDENT_CONNECTED });

		await user.click(await screen.findByRole("button", { name: "Disconnect Square" }));

		// Still connected: no mutation was fired, and MockedProvider would have thrown on an
		// unmocked one.
		await waitFor(() => expect(screen.getByText("Connected")).toBeInTheDocument());
		expect(confirmSpy).toHaveBeenCalled();
	});
});
