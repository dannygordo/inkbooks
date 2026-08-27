// SystemMessageTemplatesPanel.jsx tests. Same two-section shape as ResponseTimePanel.jsx and
// AutoResponsesPanel.jsx - a shop-connected artist who can manage the shop sees BOTH their own
// overrides AND the shop's, at the same time. Unlike ResponseTimePanel, both sections here are
// editable; the split between them is which of the 7 fixed KEY_META keys each section is allowed
// to touch (artistOnly/shopOnly), not authority over the other side's row at all.
//
// FETCH_SYSTEM_MESSAGE_TEMPLATES, UPDATE_SYSTEM_MESSAGE_TEMPLATE, and RESET_SYSTEM_MESSAGE_TEMPLATE
// are all exported directly by SystemMessageTemplateService, so the real documents are imported
// and used as-is rather than reconstructed - see FormsPanel.test.jsx's own comment on why that
// matters wherever it's possible.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { GraphQLError } from "graphql";
import SystemMessageTemplatesPanel from "./SystemMessageTemplatesPanel";
import { AuthContext } from "../../context/auth";
import SystemMessageTemplateService from "../../services/SystemMessageTemplateService";
import { ROLES } from "../../constants/auth";

function templatesMock(scope, rows = []) {
	return {
		request: {
			query: SystemMessageTemplateService.FETCH_SYSTEM_MESSAGE_TEMPLATES,
			variables: scope,
		},
		result: {
			data: {
				getSystemMessageTemplates: rows.map((row) => ({ __typename: "SystemMessageTemplate", ...row })),
			},
		},
	};
}

function overrideRow(scope, overrides = {}) {
	return {
		id: "tmpl-1",
		shopId: scope.shopId || null,
		artistUserId: scope.artistUserId || null,
		key: "NEW_MESSAGE_TO_GUEST",
		emailSubjectTemplate: "You have a new message from {{artistName}}",
		emailBodyTemplate: null,
		extraNoteTemplate: null,
		setByUserId: scope.artistUserId || "admin-1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

const INDEPENDENT_ARTIST = {
	id: "artist-1",
	userType: "artist",
	role: ROLES.ARTIST,
	userInfo: { id: "artist-1" },
};

const SHOP_ARTIST = {
	id: "artist-2",
	userType: "artist",
	role: ROLES.ARTIST,
	userInfo: { id: "artist-2", shop: { id: "shop-1", name: "Iron Anchor Tattoo" } },
};

const SHOP_ADMIN_ARTIST = {
	id: "admin-1",
	userType: "artist",
	role: ROLES.SHOP_ADMIN,
	userInfo: { id: "admin-1", shop: { id: "shop-1", name: "Iron Anchor Tattoo" } },
};

function renderPanel({ user, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<SystemMessageTemplatesPanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

// Scopes an assertion to one section's own card - both sections can render the identical row
// labels (every key not filtered by shopOnly/artistOnly appears in both).
async function cardFor(headingName) {
	const heading = await screen.findByRole("heading", { name: headingName });
	return heading.closest(".ibCardWrapper");
}

describe("an independent artist (no shop)", () => {
	it("shows only Your System Messages, with a Default badge on every key", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [templatesMock({ artistUserId: "artist-1" }, [])],
		});

		expect(
			await screen.findByRole("heading", { name: "Your System Messages" }),
		).toBeInTheDocument();
		expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
		expect(screen.queryByText("Customized")).not.toBeInTheDocument();
	});

	// SHOP_CUT_MARKED_PAID is shopOnly per KEY_META - an artist-scoped section must never offer
	// to edit a message that only ever goes to a shop.
	it("does not list the shop-only key", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [templatesMock({ artistUserId: "artist-1" }, [])],
		});

		await screen.findByRole("heading", { name: "Your System Messages" });
		expect(screen.queryByText("Shop cut marked paid (to shop)")).not.toBeInTheDocument();
		expect(screen.getByText("Shop cut confirmed (to you)")).toBeInTheDocument();
	});

	it("renders nothing while the query is still loading", () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [templatesMock({ artistUserId: "artist-1" }, [])],
		});

		expect(
			screen.queryByRole("heading", { name: "Your System Messages" }),
		).not.toBeInTheDocument();
	});

	it("shows Customized (with a reset control) only for a key that has an override row", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				templatesMock({ artistUserId: "artist-1" }, [
					overrideRow({ artistUserId: "artist-1" }, { key: "NEW_MESSAGE_TO_GUEST" }),
				]),
			],
		});

		await screen.findByRole("heading", { name: "Your System Messages" });
		const row = screen.getByText("New message notification (to client)").closest(".autoResponseRow");
		expect(within(row).getByText("Customized")).toBeInTheDocument();
		expect(within(row).getByRole("button", { name: "Reset to default" })).toBeInTheDocument();

		const defaultRow = screen
			.getByText("New booking request notification (to you)")
			.closest(".autoResponseRow");
		expect(within(defaultRow).getByText("Default")).toBeInTheDocument();
		expect(within(defaultRow).queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();
	});
});

describe("a shop-connected artist who is not shop admin", () => {
	it("shows only Your System Messages, not the shop's section", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [templatesMock({ artistUserId: "artist-2" }, [])],
		});

		expect(
			await screen.findByRole("heading", { name: "Your System Messages" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: "Iron Anchor Tattoo System Messages" }),
		).not.toBeInTheDocument();
	});
});

describe("a shop admin who is also an artist", () => {
	it("shows both Your System Messages and the shop's own section", async () => {
		renderPanel({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				templatesMock({ artistUserId: "admin-1" }, []),
				templatesMock({ shopId: "shop-1" }, []),
			],
		});

		expect(await cardFor("Your System Messages")).toBeTruthy();
		expect(await cardFor("Iron Anchor Tattoo System Messages")).toBeTruthy();
	});

	it("excludes the artist-only key from the shop's section and the shop-only key from the artist's", async () => {
		renderPanel({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				templatesMock({ artistUserId: "admin-1" }, []),
				templatesMock({ shopId: "shop-1" }, []),
			],
		});

		const artistCard = await cardFor("Your System Messages");
		const shopCard = await cardFor("Iron Anchor Tattoo System Messages");

		expect(within(artistCard).getByText("Shop cut confirmed (to you)")).toBeInTheDocument();
		expect(within(artistCard).queryByText("Shop cut marked paid (to shop)")).not.toBeInTheDocument();

		expect(within(shopCard).getByText("Shop cut marked paid (to shop)")).toBeInTheDocument();
		expect(within(shopCard).queryByText("Shop cut confirmed (to you)")).not.toBeInTheDocument();
	});
});

describe("editing a template", () => {
	it("opens the edit dialog prefilled with the existing override", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				templatesMock({ artistUserId: "artist-1" }, [
					overrideRow(
						{ artistUserId: "artist-1" },
						{ key: "NEW_MESSAGE_TO_GUEST", emailSubjectTemplate: "Hey, you've got mail" },
					),
				]),
			],
		});

		await screen.findByText("New message notification (to client)");
		const row = screen.getByText("New message notification (to client)").closest(".autoResponseRow");
		await user.click(within(row).getByRole("button", { name: "Edit" }));

		expect(await screen.findByRole("heading", { name: "New message notification (to client)" })).toBeInTheDocument();
		expect(screen.getByLabelText("Email subject")).toHaveValue("Hey, you've got mail");
		expect(screen.getByLabelText("Email body")).toBeInTheDocument();
	});

	it("shows the merge fields available for the key being edited", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [templatesMock({ artistUserId: "artist-1" }, [])],
		});

		await screen.findByText("New booking request notification (to you)");
		await user.click(
			within(
				screen.getByText("New booking request notification (to you)").closest(".autoResponseRow"),
			).getByRole("button", { name: "Edit" }),
		);

		expect(await screen.findByText("{{artistFirstName}}")).toBeInTheDocument();
		expect(screen.getByText("{{clientName}}")).toBeInTheDocument();
	});

	// BOOKING_CONFIRMATION is the one key with hasExtraNote - it shows the narrower "extra note"
	// field instead of "Email body" (per KEY_META's own comment: the schedule/deposit/request
	// details always stay code-generated, only an appendable line is editable).
	it("shows the extra-note field, not Email body, for BOOKING_CONFIRMATION", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [templatesMock({ artistUserId: "artist-1" }, [])],
		});

		await screen.findByText("Booking confirmation (to client)");
		await user.click(
			within(
				screen.getByText("Booking confirmation (to client)").closest(".autoResponseRow"),
			).getByRole("button", { name: "Edit" }),
		);

		expect(
			await screen.findByLabelText("Extra note (appended to the confirmation)"),
		).toBeInTheDocument();
		expect(screen.queryByLabelText("Email body")).not.toBeInTheDocument();
	});

	it("saves the edited subject and body, alerts success, and closes the dialog", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				templatesMock({ artistUserId: "artist-1" }, []),
				{
					request: {
						query: SystemMessageTemplateService.UPDATE_SYSTEM_MESSAGE_TEMPLATE,
						variables: {
							input: {
								key: "NEW_MESSAGE_TO_GUEST",
								emailSubjectTemplate: "New wording",
								emailBodyTemplate: null,
								extraNoteTemplate: null,
							},
						},
					},
					result: {
						data: {
							updateSystemMessageTemplate: overrideRow(
								{ artistUserId: "artist-1" },
								{ key: "NEW_MESSAGE_TO_GUEST", emailSubjectTemplate: "New wording" },
							),
						},
					},
				},
				// Post-save refetch of the same section.
				templatesMock({ artistUserId: "artist-1" }, [
					overrideRow(
						{ artistUserId: "artist-1" },
						{ key: "NEW_MESSAGE_TO_GUEST", emailSubjectTemplate: "New wording" },
					),
				]),
			],
		});

		await screen.findByText("New message notification (to client)");
		await user.click(
			within(
				screen.getByText("New message notification (to client)").closest(".autoResponseRow"),
			).getByRole("button", { name: "Edit" }),
		);
		const subjectField = await screen.findByLabelText("Email subject");
		await user.clear(subjectField);
		await user.type(subjectField, "New wording");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "success", message: "Template updated." }),
			),
		);
		// MUI's Dialog keeps its content mounted through its own exit transition (Fade, ~200ms real
		// time by default) rather than removing it the instant `open` goes false, so an unwaited
		// synchronous check here races that transition and finds the heading still present. waitFor
		// polls until the transition actually finishes closing it.
		await waitFor(() =>
			expect(
				screen.queryByRole("heading", { name: "New message notification (to client)" }),
			).not.toBeInTheDocument(),
		);
	});

	// The narrower BOOKING_CONFIRMATION case: only extraNoteTemplate is ever editable for this
	// key, but the input still sends all three template fields, with the un-editable body staying
	// null - per SystemMessageTemplateService.test.js's own comment on this exact shape.
	it("saves only extraNoteTemplate for BOOKING_CONFIRMATION on the shop's section", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				templatesMock({ artistUserId: "admin-1" }, []),
				templatesMock({ shopId: "shop-1" }, []),
				{
					request: {
						query: SystemMessageTemplateService.UPDATE_SYSTEM_MESSAGE_TEMPLATE,
						variables: {
							input: {
								shopId: "shop-1",
								key: "BOOKING_CONFIRMATION",
								emailSubjectTemplate: null,
								emailBodyTemplate: null,
								extraNoteTemplate: "Please arrive 10 minutes early.",
							},
						},
					},
					result: {
						data: {
							updateSystemMessageTemplate: overrideRow(
								{ shopId: "shop-1" },
								{
									key: "BOOKING_CONFIRMATION",
									emailSubjectTemplate: null,
									extraNoteTemplate: "Please arrive 10 minutes early.",
								},
							),
						},
					},
				},
				templatesMock({ shopId: "shop-1" }, [
					overrideRow(
						{ shopId: "shop-1" },
						{ key: "BOOKING_CONFIRMATION", extraNoteTemplate: "Please arrive 10 minutes early." },
					),
				]),
			],
		});

		const shopCard = await cardFor("Iron Anchor Tattoo System Messages");
		await user.click(
			within(within(shopCard).getByText("Booking confirmation (to client)").closest(".autoResponseRow")).getByRole(
				"button",
				{ name: "Edit" },
			),
		);
		const noteField = await screen.findByLabelText("Extra note (appended to the confirmation)");
		await user.type(noteField, "Please arrive 10 minutes early.");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "success", message: "Template updated." }),
			),
		);
	});

	it("closes without saving when Cancel is clicked", async () => {
		const user = userEvent.setup();
		// No update mutation mocked - if Cancel accidentally saved, MockedProvider would surface
		// an unmatched-request error.
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [templatesMock({ artistUserId: "artist-1" }, [])],
		});

		await screen.findByText("New message notification (to client)");
		await user.click(
			within(
				screen.getByText("New message notification (to client)").closest(".autoResponseRow"),
			).getByRole("button", { name: "Edit" }),
		);
		await screen.findByLabelText("Email subject");
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		// MUI's Dialog keeps its content mounted through its own exit transition (Fade, ~200ms real
		// time by default) rather than removing it the instant `open` goes false, so an unwaited
		// synchronous check here races that transition and finds the heading still present. waitFor
		// polls until the transition actually finishes closing it.
		await waitFor(() =>
			expect(
				screen.queryByRole("heading", { name: "New message notification (to client)" }),
			).not.toBeInTheDocument(),
		);
	});

	it("alerts the server's error message when saving fails", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				templatesMock({ artistUserId: "artist-1" }, []),
				{
					request: {
						query: SystemMessageTemplateService.UPDATE_SYSTEM_MESSAGE_TEMPLATE,
						variables: {
							input: {
								key: "NEW_MESSAGE_TO_GUEST",
								emailSubjectTemplate: "Bad wording",
								emailBodyTemplate: null,
								extraNoteTemplate: null,
							},
						},
					},
					result: { errors: [new GraphQLError("That merge field isn't recognized.")] },
				},
			],
		});

		await screen.findByText("New message notification (to client)");
		await user.click(
			within(
				screen.getByText("New message notification (to client)").closest(".autoResponseRow"),
			).getByRole("button", { name: "Edit" }),
		);
		const subjectField = await screen.findByLabelText("Email subject");
		await user.clear(subjectField);
		await user.type(subjectField, "Bad wording");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "error", message: "That merge field isn't recognized." }),
			),
		);
		// The failed save leaves the dialog open rather than discarding what was typed.
		expect(await screen.findByLabelText("Email subject")).toHaveValue("Bad wording");
	});
});

describe("resetting a template", () => {
	it("resets a customized key and alerts success", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				templatesMock({ artistUserId: "artist-1" }, [
					overrideRow({ artistUserId: "artist-1" }, { key: "NEW_MESSAGE_TO_GUEST" }),
				]),
				{
					request: {
						query: SystemMessageTemplateService.RESET_SYSTEM_MESSAGE_TEMPLATE,
						variables: { key: "NEW_MESSAGE_TO_GUEST" },
					},
					result: { data: { resetSystemMessageTemplate: true } },
				},
				// Post-reset refetch - back to no overrides.
				templatesMock({ artistUserId: "artist-1" }, []),
			],
		});

		await screen.findByText("New message notification (to client)");
		const row = screen.getByText("New message notification (to client)").closest(".autoResponseRow");
		await user.click(within(row).getByRole("button", { name: "Reset to default" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Reset to the built-in default.",
				}),
			),
		);
	});

	it("includes shopId when resetting the shop's own template", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				templatesMock({ artistUserId: "admin-1" }, []),
				templatesMock({ shopId: "shop-1" }, [
					overrideRow({ shopId: "shop-1" }, { key: "SHOP_CUT_MARKED_PAID" }),
				]),
				{
					request: {
						query: SystemMessageTemplateService.RESET_SYSTEM_MESSAGE_TEMPLATE,
						variables: { shopId: "shop-1", key: "SHOP_CUT_MARKED_PAID" },
					},
					result: { data: { resetSystemMessageTemplate: true } },
				},
				templatesMock({ shopId: "shop-1" }, []),
			],
		});

		const shopCard = await cardFor("Iron Anchor Tattoo System Messages");
		const row = within(shopCard).getByText("Shop cut marked paid (to shop)").closest(".autoResponseRow");
		await user.click(within(row).getByRole("button", { name: "Reset to default" }));

		// Reaching the success alert (rather than an Apollo "no matching mock" error) IS the
		// assertion that shopId was included in the reset's variables.
		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "success", message: "Reset to the built-in default." }),
			),
		);
	});

	it("alerts the server's error message when resetting fails", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				templatesMock({ artistUserId: "artist-1" }, [
					overrideRow({ artistUserId: "artist-1" }, { key: "NEW_MESSAGE_TO_GUEST" }),
				]),
				{
					request: {
						query: SystemMessageTemplateService.RESET_SYSTEM_MESSAGE_TEMPLATE,
						variables: { key: "NEW_MESSAGE_TO_GUEST" },
					},
					result: { errors: [new GraphQLError("Could not reset that template right now.")] },
				},
			],
		});

		await screen.findByText("New message notification (to client)");
		const row = screen.getByText("New message notification (to client)").closest(".autoResponseRow");
		await user.click(within(row).getByRole("button", { name: "Reset to default" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: "error",
					message: "Could not reset that template right now.",
				}),
			),
		);
	});
});
