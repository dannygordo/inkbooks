// SquarePanel.jsx tests. The panel shows an artist their OWN Square connection - the account their
// clients pay into - and it is the same for every artist, shop or no shop (DECISIONS.md M9).
//
// It briefly did something else: told a shop artist that their shop held the connection and offered
// them no button. That followed from the server routing their charges into the shop's account,
// which meant the shop was paid the whole amount and then invoiced the artist for a cut of it.
// Several tests here asserted that behaviour and passed. They are rewritten rather than deleted,
// because "a shop artist sees no difference" is the claim now worth pinning.
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

// A shop artist's connection looks IDENTICAL to an independent artist's, because it is the same
// thing: their own account, which their clients pay into. getMySquareConnection reports source
// 'artist' for everyone - the shop/artist split is real for the TAX RATE (M8) and not for this.
const SHOP_ARTIST_CONNECTED = {
	source: "artist",
	connected: true,
	locationId: "L_SHOP_ARTIST",
	connectedAt: "2026-01-09T00:00:00.000Z",
	ownerName: null,
};

const SHOP_ARTIST_DISCONNECTED = {
	source: "artist",
	connected: false,
	locationId: null,
	connectedAt: null,
	ownerName: null,
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

describe("an artist who works at a shop", () => {
	// THE CORRECTION. This block used to assert the opposite - that a shop artist is told their
	// shop holds the connection and gets no button. That followed from the server routing their
	// charges into the shop's account, which meant the shop was paid the whole amount and then
	// invoiced the artist for a cut of it. Clients pay the artist; the shop's cut is settled
	// afterwards through the ledger, the same way it works with cash.
	it("gets the same connect button as anyone else", async () => {
		renderPanel({ connection: SHOP_ARTIST_DISCONNECTED });

		expect(
			await screen.findByRole("button", { name: "Connect with Square" }),
		).toBeInTheDocument();
	});

	it("can disconnect their own account", async () => {
		renderPanel({ connection: SHOP_ARTIST_CONNECTED });

		expect(await screen.findByText("Connected")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Disconnect Square" })).toBeInTheDocument();
	});

	// The panel must not imply the shop is involved in taking the payment. It is involved in what
	// happens NEXT, which the help text says plainly.
	it("never names a shop as holding the connection", async () => {
		renderPanel({ connection: SHOP_ARTIST_CONNECTED });

		await screen.findByText("Connected");
		expect(screen.queryByText(/Only a shop admin/)).not.toBeInTheDocument();
		expect(screen.queryByText(/Your shop has not connected/)).not.toBeInTheDocument();
		expect(screen.getByText(/Clients pay you directly/)).toBeInTheDocument();
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
