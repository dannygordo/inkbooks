// AutoResponsesPanel.jsx tests. Two independently-gated sections (see the component's own header
// comment): an artist's own Auto-Responses (isArtist) and a shop's (isShopAdminOrBetter AND the
// artist has a shop.id to read it from - see the header comment on why a pure non-artist shop
// admin never sees the shop section here even though FormsPanel's "Manage Forms" gate would let
// them manage other shop-wide things). Both can render at once for a shop-admin artist
// (owner-operator), unlike FormsPanel's mutually-exclusive "Your link"/"Manage Forms" split.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { GraphQLError } from "graphql";
import AutoResponsesPanel from "./AutoResponsesPanel";
import { AuthContext } from "../../context/auth";
import AutoResponseService from "../../services/AutoResponseService";
import { ROLES } from "../../constants/auth";

function fatAutoResponse(overrides = {}) {
	return {
		__typename: "AutoResponse",
		id: "ar-1",
		shopId: null,
		artistUserId: "user-1",
		name: "Session complete thank-you",
		trigger: "SESSION_COMPLETED",
		enabled: true,
		emailEnabled: true,
		smsEnabled: false,
		emailSubjectTemplate: "Thanks for coming in, {{clientFirstName}}!",
		emailBodyTemplate: "It was great working on your piece today.",
		smsTemplate: null,
		active: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// The REAL document from the service, not a hand copy - see FormsPanel.test.jsx's own comment on
// why (a near-copy silently stops matching after one field of drift and fails as a confusing
// network error rather than a component bug).
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

function createMock(input, response) {
	return {
		request: { query: AutoResponseService.CREATE_AUTO_RESPONSE, variables: { input } },
		result: { data: { createAutoResponse: { __typename: "AutoResponse", ...response } } },
	};
}

function updateMock(input, response) {
	return {
		request: { query: AutoResponseService.UPDATE_AUTO_RESPONSE, variables: { input } },
		result: { data: { updateAutoResponse: { __typename: "AutoResponse", ...response } } },
	};
}

function updateMockError(input, message, fieldErrors) {
	return {
		request: { query: AutoResponseService.UPDATE_AUTO_RESPONSE, variables: { input } },
		result: { errors: [new GraphQLError(message, { extensions: { errors: fieldErrors } })] },
	};
}

function archiveMock(autoResponseId, response) {
	return {
		request: { query: AutoResponseService.ARCHIVE_AUTO_RESPONSE, variables: { autoResponseId } },
		result: { data: { archiveAutoResponse: { __typename: "AutoResponse", ...response } } },
	};
}

// hasShop / isShopAdminOrBetter combinations exercised across this file's describe blocks.
const INDEPENDENT_ARTIST = {
	id: "user-1",
	userType: "artist",
	role: ROLES.ARTIST,
	userInfo: { id: "artist-1" },
};

const SHOP_ARTIST = {
	id: "user-2",
	userType: "artist",
	role: ROLES.ARTIST,
	userInfo: { id: "artist-2", shop: { id: "shop-1", name: "Iron Anchor Tattoo" } },
};

const SHOP_ADMIN_ARTIST = {
	id: "user-3",
	userType: "artist",
	role: ROLES.SHOP_ADMIN,
	userInfo: { id: "artist-3", shop: { id: "shop-1", name: "Iron Anchor Tattoo" } },
};

const SHOP_ADMIN_NON_ARTIST = {
	id: "user-4",
	userType: "user",
	role: ROLES.SHOP_ADMIN,
	userInfo: null,
};

function renderPanel({ user, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<AutoResponsesPanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

describe("which sections render", () => {
	it("shows only Your Auto-Responses for an independent artist", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [])],
		});

		expect(await screen.findByText("Your Auto-Responses")).toBeInTheDocument();
		expect(screen.queryByText(/Auto-Responses$/, { selector: "h1" })).toBeInTheDocument();
		expect(screen.queryByText("Iron Anchor Tattoo Auto-Responses")).not.toBeInTheDocument();
	});

	it("shows only Your Auto-Responses for a shop-connected artist who isn't shop admin", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-2" }, [])],
		});

		expect(await screen.findByText("Your Auto-Responses")).toBeInTheDocument();
		expect(screen.queryByText("Iron Anchor Tattoo Auto-Responses")).not.toBeInTheDocument();
	});

	it("shows both sections for a shop-admin artist (owner-operator)", async () => {
		renderPanel({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				autoResponsesMock({ artistUserId: "user-3" }, []),
				autoResponsesMock({ shopId: "shop-1" }, []),
			],
		});

		expect(await screen.findByText("Your Auto-Responses")).toBeInTheDocument();
		expect(await screen.findByText("Iron Anchor Tattoo Auto-Responses")).toBeInTheDocument();
	});

	// isArtist is false (no userInfo), so `shop` can never be read even though the role qualifies -
	// see the header comment above. No mocks are supplied; MockedProvider would surface an
	// unmatched-request error if either query fired anyway.
	it("shows neither section for a shop admin who isn't an artist themselves", () => {
		renderPanel({ user: SHOP_ADMIN_NON_ARTIST, mocks: [] });

		expect(screen.queryByText("Your Auto-Responses")).not.toBeInTheDocument();
		expect(screen.queryByText(/Auto-Responses$/)).not.toBeInTheDocument();
	});
});

describe("a single section's states", () => {
	it("renders nothing while the initial fetch is in flight", () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [])],
		});

		expect(screen.queryByText("Your Auto-Responses")).not.toBeInTheDocument();
	});

	it("invites adding one when the list is empty", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [])],
		});

		expect(await screen.findByText("No Auto-Responses yet - add one below.")).toBeInTheDocument();
	});

	it("renders a response row's name, trigger chip and channel icons", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				autoResponsesMock({ artistUserId: "user-1" }, [
					fatAutoResponse({ emailEnabled: true, smsEnabled: true }),
				]),
			],
		});

		expect(await screen.findByText("Session complete thank-you")).toBeInTheDocument();
		expect(screen.getByText("After a session")).toBeInTheDocument();
		expect(screen.getByTitle("Sends by email")).toBeInTheDocument();
		expect(screen.getByTitle("Sends by text")).toBeInTheDocument();
	});

	it("omits an unused channel's icon", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				autoResponsesMock({ artistUserId: "user-1" }, [
					fatAutoResponse({ emailEnabled: true, smsEnabled: false }),
				]),
			],
		});

		await screen.findByText("Session complete thank-you");
		expect(screen.queryByTitle("Sends by text")).not.toBeInTheDocument();
	});

	it("shows the enabled switch as checked, and disables it for a manual-only response", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				autoResponsesMock({ artistUserId: "user-1" }, [
					fatAutoResponse({ trigger: "MANUAL", enabled: false }),
				]),
			],
		});

		await screen.findByText("Session complete thank-you");
		expect(screen.getByRole("switch")).toBeDisabled();
		expect(screen.getByText("Manual only")).toBeInTheDocument();
	});
});

describe("toggling a response's auto-fire switch", () => {
	it("sends the new enabled value and reflects the refetched state", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				autoResponsesMock({ artistUserId: "user-1" }, [fatAutoResponse({ enabled: true })]),
				updateMock({ autoResponseId: "ar-1", enabled: false }, fatAutoResponse({ enabled: false })),
				autoResponsesMock({ artistUserId: "user-1" }, [fatAutoResponse({ enabled: false })]),
			],
		});

		await screen.findByText("Session complete thank-you");
		const toggle = screen.getByRole("switch");
		expect(toggle).toBeChecked();

		await user.click(toggle);

		await waitFor(() => expect(screen.getByRole("switch")).not.toBeChecked());
	});

	it("alerts an error and leaves the row alone when the toggle fails", async () => {
		const failingMock = {
			request: {
				query: AutoResponseService.UPDATE_AUTO_RESPONSE,
				variables: { input: { autoResponseId: "ar-1", enabled: false } },
			},
			error: new Error("Network hiccup"),
		};
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [fatAutoResponse({ enabled: true })]), failingMock],
		});

		await screen.findByText("Session complete thank-you");
		await user.click(screen.getByRole("switch"));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "error", message: "Network hiccup" }),
			),
		);
		// No refetch runs on failure, so the row's own switch stays exactly as it was.
		expect(screen.getByRole("switch")).toBeChecked();
	});
});

describe("deactivating a response", () => {
	it("archives it, alerts success with its name, and refetches", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				autoResponsesMock({ artistUserId: "user-1" }, [fatAutoResponse()]),
				archiveMock("ar-1", fatAutoResponse({ active: false, enabled: false })),
				autoResponsesMock({ artistUserId: "user-1" }, []),
			],
		});

		await screen.findByText("Session complete thank-you");
		await user.click(screen.getByRole("button", { name: "Deactivate" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: "success",
					message: '"Session complete thank-you" deactivated.',
				}),
			),
		);
		await waitFor(() =>
			expect(screen.getByText("No Auto-Responses yet - add one below.")).toBeInTheDocument(),
		);
	});
});

describe("creating a new Auto-Response", () => {
	it("opens with the create defaults and keeps Save disabled until a name is entered", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [])],
		});

		await screen.findByText("Your Auto-Responses");
		await user.click(screen.getByRole("button", { name: "New Auto-Response" }));

		const dialog = within(screen.getByRole("dialog"));
		expect(dialog.getByText("New Auto-Response")).toBeInTheDocument();
		expect(dialog.getByRole("combobox", { name: "When this sends" })).toHaveTextContent(
			"After a session",
		);
		expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
	});

	// MANUAL hides "Send automatically" altogether (it can never auto-fire) and explains itself;
	// MESSAGE_RECEIVED gets its own help text about posting into the client's thread - see the
	// component's own TRIGGER_HELP_TEXT comment.
	it("hides the auto-fire switch and explains manual-only when that trigger is picked", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [])],
		});

		await screen.findByText("Your Auto-Responses");
		await user.click(screen.getByRole("button", { name: "New Auto-Response" }));
		await user.click(screen.getByRole("combobox", { name: "When this sends" }));
		await user.click(screen.getByRole("option", { name: "Manual only" }));

		expect(
			screen.queryByRole("switch", { name: "Send automatically" }),
		).not.toBeInTheDocument();
		expect(
			screen.getByText(/Manual-only responses never fire on their own/),
		).toBeInTheDocument();
	});

	it("shows the thread-posting help text for When a client messages you", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [])],
		});

		await screen.findByText("Your Auto-Responses");
		await user.click(screen.getByRole("button", { name: "New Auto-Response" }));
		await user.click(screen.getByRole("combobox", { name: "When this sends" }));
		await user.click(screen.getByRole("option", { name: "When a client messages you" }));

		expect(
			screen.getByText(/Posts this as a reply in the client's conversation thread/),
		).toBeInTheDocument();
	});

	// scope.shopId is the only part of an artist section's scope that's ever valid on this
	// mutation's input - see the component's own comment on CreateAutoResponseInput never
	// accepting artistUserId. Reaching the success alert (rather than an Apollo "no matching mock"
	// error) IS the assertion that no artistUserId/shopId key was sent for an artist-scoped create.
	it("creates an artist-scoped response with no shopId in the input", async () => {
		const user = userEvent.setup();
		const input = {
			name: "New reminder",
			trigger: "SESSION_COMPLETED",
			enabled: false,
			emailEnabled: true,
			smsEnabled: false,
			emailSubjectTemplate: null,
			emailBodyTemplate: null,
			smsTemplate: null,
		};
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				autoResponsesMock({ artistUserId: "user-1" }, []),
				createMock(input, fatAutoResponse({ id: "ar-2", name: "New reminder", enabled: false })),
				autoResponsesMock({ artistUserId: "user-1" }, [fatAutoResponse({ id: "ar-2", name: "New reminder" })]),
			],
		});

		await screen.findByText("Your Auto-Responses");
		await user.click(screen.getByRole("button", { name: "New Auto-Response" }));
		await user.type(within(screen.getByRole("dialog")).getByLabelText("Name"), "New reminder");
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "success", message: "Auto-Response created." }),
			),
		);
		// MUI's Dialog keeps its content mounted through its own exit transition rather than removing
		// it the instant `open` goes false - see the matching note in
		// SystemMessageTemplatesPanel.test.jsx, which hit the same race.
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
	});

	it("includes shopId in the input for a shop-scoped create", async () => {
		const user = userEvent.setup();
		const input = {
			shopId: "shop-1",
			name: "Shop welcome",
			trigger: "SESSION_COMPLETED",
			enabled: false,
			emailEnabled: true,
			smsEnabled: false,
			emailSubjectTemplate: null,
			emailBodyTemplate: null,
			smsTemplate: null,
		};
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				autoResponsesMock({ artistUserId: "user-3" }, []),
				autoResponsesMock({ shopId: "shop-1" }, []),
				createMock(input, fatAutoResponse({ id: "ar-3", shopId: "shop-1", artistUserId: null, name: "Shop welcome" })),
				autoResponsesMock({ shopId: "shop-1" }, [
					fatAutoResponse({ id: "ar-3", shopId: "shop-1", artistUserId: null, name: "Shop welcome" }),
				]),
			],
		});

		await screen.findByText("Iron Anchor Tattoo Auto-Responses");
		const shopCard = screen.getByText("Iron Anchor Tattoo Auto-Responses").closest(".ibCardWrapper");
		await user.click(within(shopCard).getByRole("button", { name: "New Auto-Response" }));
		await user.type(within(screen.getByRole("dialog")).getByLabelText("Name"), "Shop welcome");
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "success", message: "Auto-Response created." }),
			),
		);
	});
});

describe("editing an existing Auto-Response", () => {
	it("prefills the dialog and disables the trigger picker", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [fatAutoResponse()])],
		});

		await screen.findByText("Session complete thank-you");
		await user.click(screen.getByRole("button", { name: "Edit" }));

		const dialog = within(screen.getByRole("dialog"));
		expect(dialog.getByText("Edit Auto-Response")).toBeInTheDocument();
		expect(dialog.getByLabelText("Name")).toHaveValue("Session complete thank-you");
		expect(dialog.getByRole("combobox", { name: "When this sends" })).toHaveTextContent(
			"After a session",
		);
		expect(dialog.getByRole("combobox", { name: "When this sends" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(dialog.getByText("Can't be changed after creation.")).toBeInTheDocument();
	});

	// The trigger is never part of UpdateAutoResponseInput - reaching the success alert IS the
	// assertion that the sent input has no `trigger` field.
	it("sends only the editable fields and alerts success", async () => {
		const user = userEvent.setup();
		const input = {
			autoResponseId: "ar-1",
			name: "Session complete thank-you",
			enabled: false,
			emailEnabled: true,
			smsEnabled: false,
			emailSubjectTemplate: "Thanks for coming in, {{clientFirstName}}!",
			emailBodyTemplate: "It was great working on your piece today.",
			smsTemplate: null,
		};
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				autoResponsesMock({ artistUserId: "user-1" }, [fatAutoResponse({ enabled: true })]),
				updateMock(input, fatAutoResponse({ enabled: false })),
				autoResponsesMock({ artistUserId: "user-1" }, [fatAutoResponse({ enabled: false })]),
			],
		});

		await screen.findByText("Session complete thank-you");
		await user.click(screen.getByRole("button", { name: "Edit" }));
		await user.click(within(screen.getByRole("dialog")).getByRole("switch", { name: "Send automatically" }));
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "success", message: "Auto-Response updated." }),
			),
		);
	});

	it("surfaces the server's field-specific validation message on failure", async () => {
		const user = userEvent.setup();
		const input = {
			autoResponseId: "ar-1",
			name: "",
			enabled: true,
			emailEnabled: true,
			smsEnabled: false,
			emailSubjectTemplate: "Thanks for coming in, {{clientFirstName}}!",
			emailBodyTemplate: "It was great working on your piece today.",
			smsTemplate: null,
		};
		// The dialog itself blocks an empty name (Save stays disabled), so exercising the server's
		// own error message uses a name-related complaint the client can't pre-empt - a duplicate
		// name, say - to prove handleSave's err.graphQLErrors?.[...]?.extensions?.errors?.name
		// fallback actually reaches the alert.
		const failing = updateMockError(
			{ ...input, name: "Session complete thank-you" },
			"Validation failed",
			{ name: "You already have an Auto-Response with that name." },
		);
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [fatAutoResponse()]), failing],
		});

		await screen.findByText("Session complete thank-you");
		await user.click(screen.getByRole("button", { name: "Edit" }));
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: "error",
					message: "You already have an Auto-Response with that name.",
				}),
			),
		);
	});

	it("closes without saving on Cancel", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [autoResponsesMock({ artistUserId: "user-1" }, [fatAutoResponse()])],
		});

		await screen.findByText("Session complete thank-you");
		await user.click(screen.getByRole("button", { name: "Edit" }));
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

		// Same MUI Dialog exit-transition race as the create/save case above.
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
	});
});
