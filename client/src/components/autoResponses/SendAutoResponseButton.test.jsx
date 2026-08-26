// SendAutoResponseButton.jsx tests. The manual "Send a message" picker - see the component's own
// header comment on scoping (Yours / From [shop]) and on why it renders nothing when there's
// nothing to send. Fixture/mocking conventions follow AutoResponsesPanel.test.jsx, which exercises
// the same AutoResponseService queries this component also calls.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { GraphQLError } from "graphql";
import SendAutoResponseButton from "./SendAutoResponseButton";
import { AuthContext } from "../../context/auth";
import AutoResponseService from "../../services/AutoResponseService";
import { ROLES } from "../../constants/auth";

function autoResponse(overrides = {}) {
	return {
		__typename: "AutoResponse",
		id: "ar-1",
		name: "Session complete thank-you",
		...overrides,
	};
}

function autoResponsesMock(scope, responses) {
	return {
		request: {
			query: AutoResponseService.FETCH_AUTO_RESPONSES,
			variables: { shopId: scope.shopId, artistUserId: scope.artistUserId, includeInactive: false },
		},
		result: {
			data: { getAutoResponses: responses.map((r) => ({ __typename: "AutoResponse", ...r })) },
		},
	};
}

function sendMock(variables, error) {
	if (error) {
		return {
			request: { query: AutoResponseService.SEND_AUTO_RESPONSE_NOW, variables },
			error,
		};
	}
	return {
		request: { query: AutoResponseService.SEND_AUTO_RESPONSE_NOW, variables },
		result: { data: { sendAutoResponseNow: true } },
	};
}

function sendMockGraphQLError(variables, message) {
	return {
		request: { query: AutoResponseService.SEND_AUTO_RESPONSE_NOW, variables },
		result: { errors: [new GraphQLError(message)] },
	};
}

const INDEPENDENT_ARTIST = {
	id: "user-1",
	userType: "artist",
	role: ROLES.ARTIST,
	userInfo: { id: "artist-1" },
};

const SHOP_ADMIN_ARTIST = {
	id: "user-3",
	userType: "artist",
	role: ROLES.SHOP_ADMIN,
	userInfo: { id: "artist-3", shop: { id: "shop-1", name: "Iron Anchor Tattoo" } },
};

const SHOP_STAFF_NON_ARTIST = {
	id: "user-4",
	userType: "user",
	role: ROLES.SHOP_STAFF,
	userInfo: null,
};

function renderButton({
	clientId = "client-1",
	appointmentId,
	user = INDEPENDENT_ARTIST,
	setAlert = vi.fn(),
	mocks = [],
} = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<SendAutoResponseButton clientId={clientId} appointmentId={appointmentId} />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

describe("rendering nothing", () => {
	it("renders nothing when clientId is missing, even with responses available", async () => {
		const { container } = render(
			<MockedProvider mocks={[autoResponsesMock({ artistUserId: "user-1" }, [autoResponse()])]}>
				<AuthContext.Provider value={{ user: INDEPENDENT_ARTIST, setAlert: vi.fn() }}>
					<SendAutoResponseButton clientId={null} />
				</AuthContext.Provider>
			</MockedProvider>,
		);

		// Give the query a tick to resolve so this isn't just passing because data hasn't arrived
		// yet - the fixture provides at least one response, so this must be about clientId.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing when there are no Auto-Responses in either scope", async () => {
		renderButton({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [])],
		});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByRole("button", { name: "Send a message" })).not.toBeInTheDocument();
	});

	it("renders nothing for a shop staffer who isn't an artist themselves", () => {
		// isArtist is false, so the artist-scoped query is skipped, and shop is never read at all
		// (Boolean(user.userInfo?.shop?.id) short-circuits on the missing userInfo) - no mocks
		// needed; MockedProvider would surface an unmatched-request error if either query fired.
		renderButton({ user: SHOP_STAFF_NON_ARTIST, mocks: [] });

		expect(screen.queryByRole("button", { name: "Send a message" })).not.toBeInTheDocument();
	});
});

describe("the menu's contents", () => {
	it("shows only Yours for an independent artist", async () => {
		renderButton({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [autoResponse()])],
		});

		const button = await screen.findByRole("button", { name: "Send a message" });
		await userEvent.setup().click(button);

		expect(await screen.findByText("Yours")).toBeInTheDocument();
		expect(screen.getByText("Session complete thank-you")).toBeInTheDocument();
		expect(screen.queryByText(/^From /)).not.toBeInTheDocument();
	});

	it("shows both Yours and From [shop] for a shop-admin artist", async () => {
		renderButton({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				autoResponsesMock({ artistUserId: "user-3" }, [autoResponse({ id: "ar-own", name: "My reminder" })]),
				autoResponsesMock({ shopId: "shop-1" }, [autoResponse({ id: "ar-shop", name: "Shop welcome" })]),
			],
		});

		const button = await screen.findByRole("button", { name: "Send a message" });
		await userEvent.setup().click(button);

		expect(await screen.findByText("Yours")).toBeInTheDocument();
		expect(screen.getByText("My reminder")).toBeInTheDocument();
		expect(screen.getByText("From Iron Anchor Tattoo")).toBeInTheDocument();
		expect(screen.getByText("Shop welcome")).toBeInTheDocument();
	});
});

describe("sending a response", () => {
	it("sends with a null appointmentId when none was supplied, and alerts success with its name", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderButton({
			user: INDEPENDENT_ARTIST,
			clientId: "client-1",
			mocks: [
				autoResponsesMock({ artistUserId: "user-1" }, [autoResponse()]),
				sendMock({ autoResponseId: "ar-1", clientId: "client-1", appointmentId: null }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Send a message" }));
		await user.click(await screen.findByRole("menuitem", { name: "Session complete thank-you" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: "success",
					message: '"Session complete thank-you" sent.',
				}),
			),
		);
	});

	it("includes the appointmentId when one is supplied", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderButton({
			user: INDEPENDENT_ARTIST,
			clientId: "client-1",
			appointmentId: "appt-1",
			mocks: [
				autoResponsesMock({ artistUserId: "user-1" }, [autoResponse()]),
				sendMock({ autoResponseId: "ar-1", clientId: "client-1", appointmentId: "appt-1" }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Send a message" }));
		await user.click(await screen.findByRole("menuitem", { name: "Session complete thank-you" }));

		// MockedProvider only resolves a mock whose variables match exactly - reaching the success
		// alert (rather than an unmatched-request error) is the evidence appointmentId: "appt-1"
		// was actually sent, not the null default from the test above.
		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({ severity: "success" })),
		);
	});

	it("alerts an error using the server's message on failure", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderButton({
			user: INDEPENDENT_ARTIST,
			clientId: "client-1",
			mocks: [
				autoResponsesMock({ artistUserId: "user-1" }, [autoResponse()]),
				sendMockGraphQLError(
					{ autoResponseId: "ar-1", clientId: "client-1", appointmentId: null },
					"Client has no verified contact method.",
				),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Send a message" }));
		await user.click(await screen.findByRole("menuitem", { name: "Session complete thank-you" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: "error",
					message: "Client has no verified contact method.",
				}),
			),
		);
	});
});
