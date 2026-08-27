// ResponseTimePanel.jsx tests. Same two-section shape as AutoResponsesPanel.jsx per the
// component's own header comment, but the artist's own card is the only ever-editable one - a
// shop-connected artist sees their own row AND (read-only, as a `shopCeiling`) their shop's
// cap, never a second editable copy of the shop's own row unless they can actually manage it
// (isShopAdminOrBetter && shop.id).
//
// Both FETCH_RESPONSE_TIME_SETTINGS and UPDATE_RESPONSE_TIME_SETTINGS are exported directly by
// ResponseTimeSettingsService (unlike e.g. FormsPanel's fetchArtist/getMyFormLinks, which build
// their documents inside the hook and never export them) - so the real documents are imported
// and used as-is here rather than reconstructed by hand. See FormsPanel.test.jsx's own comment
// on why that distinction matters: MockedProvider matches by printed shape, so a hand-written
// near-copy would silently stop matching the moment the service drifts, and this sidesteps that
// entirely.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { GraphQLError } from "graphql";
import ResponseTimePanel from "./ResponseTimePanel";
import { AuthContext } from "../../context/auth";
import ResponseTimeSettingsService from "../../services/ResponseTimeSettingsService";
import { ROLES } from "../../constants/auth";

function settingsRow(scope, overrides = {}) {
	return {
		__typename: "ResponseTimeSettings",
		id: scope.shopId ? "rts-shop" : "rts-artist",
		shopId: scope.shopId || null,
		artistUserId: scope.artistUserId || null,
		initialThresholdMinutes: 480,
		repeatIntervalMinutes: 180,
		shopCeiling: null,
		setByUserId: scope.artistUserId || "admin-1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function settingsMock(scope, overrides = {}) {
	return {
		request: {
			query: ResponseTimeSettingsService.FETCH_RESPONSE_TIME_SETTINGS,
			variables: scope,
		},
		result: { data: { getResponseTimeSettings: settingsRow(scope, overrides) } },
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
				<ResponseTimePanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

// Scopes an assertion to one section's own card, since both sections render fields with the
// identical labels ("Nudge after...", "Repeat every...") when both are on screen at once.
async function cardFor(headingName) {
	const heading = await screen.findByRole("heading", { name: headingName });
	return heading.closest(".ibCardWrapper");
}

describe("an independent artist (no shop)", () => {
	it("shows only Your Response Time, with minutes converted to hours for display", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [settingsMock({ artistUserId: "artist-1" })],
		});

		expect(
			await screen.findByRole("heading", { name: "Your Response Time" }),
		).toBeInTheDocument();
		// 480 minutes -> 8 hours, 180 minutes -> 3 hours. Awaited: the fields' values come from a
		// useEffect keyed off `settings`, which commits one render AFTER the one that first shows
		// the heading - asserting synchronously here races that effect.
		await waitFor(() => {
			expect(screen.getByLabelText("Nudge after (hours unanswered)")).toHaveValue(8);
			expect(screen.getByLabelText("Repeat every (hours)")).toHaveValue(3);
		});
		expect(screen.getAllByRole("heading", { name: /Response Time/ })).toHaveLength(1);
	});

	// loading && !data returns null from ResponseTimeSection - the whole card is absent, not a
	// spinner, until the query resolves.
	it("renders nothing while the query is still loading", () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [settingsMock({ artistUserId: "artist-1" })],
		});

		expect(
			screen.queryByRole("heading", { name: "Your Response Time" }),
		).not.toBeInTheDocument();
	});

	it("shows no shop-ceiling hint - there is no shop above an independent artist", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [settingsMock({ artistUserId: "artist-1" })],
		});

		await screen.findByLabelText("Nudge after (hours unanswered)");
		expect(screen.queryByText(/Your shop limits this to at most/)).not.toBeInTheDocument();
	});
});

describe("a shop-connected artist who is not shop admin", () => {
	it("shows Your Response Time with the shop's ceiling as read-only info, and no shop-wide section", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				settingsMock(
					{ artistUserId: "artist-2" },
					{
						shopCeiling: {
							__typename: "ResponseTimeCeiling",
							initialThresholdMinutes: 600,
							repeatIntervalMinutes: 240,
						},
					},
				),
			],
		});

		expect(
			await screen.findByRole("heading", { name: "Your Response Time" }),
		).toBeInTheDocument();
		// 600 minutes -> 10 hours, 240 minutes -> 4 hours.
		expect(
			screen.getByText(
				/Your shop limits this to at most 10 hour\(s\) before the first nudge, repeating at most every 4 hour\(s\)/,
			),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: "Iron Anchor Tattoo Response Time" }),
		).not.toBeInTheDocument();
	});

	it("disables Save and shows the clamp error once a typed value exceeds the shop's ceiling", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				settingsMock(
					{ artistUserId: "artist-2" },
					{
						shopCeiling: {
							__typename: "ResponseTimeCeiling",
							initialThresholdMinutes: 600,
							repeatIntervalMinutes: 240,
						},
					},
				),
			],
		});

		const initialField = await screen.findByLabelText("Nudge after (hours unanswered)");
		await user.clear(initialField);
		await user.type(initialField, "11");

		expect(
			await screen.findByText(
				/Your shop caps this at 10 hour\(s\) before the first nudge and 4 hour\(s\) between repeats/,
			),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	});

	it("does not flag the clamp error for values at or under the ceiling", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				settingsMock(
					{ artistUserId: "artist-2" },
					{
						shopCeiling: {
							__typename: "ResponseTimeCeiling",
							initialThresholdMinutes: 600,
							repeatIntervalMinutes: 240,
						},
					},
				),
			],
		});

		const initialField = await screen.findByLabelText("Nudge after (hours unanswered)");
		await user.clear(initialField);
		await user.type(initialField, "10");

		expect(
			screen.queryByText(/Your shop caps this at/),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
	});
});

describe("a shop admin who is also an artist", () => {
	it("shows both Your Response Time and the shop's own section", async () => {
		renderPanel({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				settingsMock({ artistUserId: "admin-1" }),
				settingsMock(
					{ shopId: "shop-1" },
					{ initialThresholdMinutes: 600, repeatIntervalMinutes: 240 },
				),
			],
		});

		expect(await cardFor("Your Response Time")).toBeTruthy();
		expect(await cardFor("Iron Anchor Tattoo Response Time")).toBeTruthy();
	});

	it("scopes each section's fields to its own data (artist's own hours vs. the shop's)", async () => {
		renderPanel({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				settingsMock(
					{ artistUserId: "admin-1" },
					{ initialThresholdMinutes: 120, repeatIntervalMinutes: 60 },
				),
				settingsMock(
					{ shopId: "shop-1" },
					{ initialThresholdMinutes: 600, repeatIntervalMinutes: 240 },
				),
			],
		});

		const artistCard = await cardFor("Your Response Time");
		const shopCard = await cardFor("Iron Anchor Tattoo Response Time");

		// Same race as the independent-artist test above - each field's value lands one render
		// after its card's heading does, via a useEffect keyed off `settings`.
		await waitFor(() => {
			expect(within(artistCard).getByLabelText("Nudge after (hours unanswered)")).toHaveValue(2);
			expect(within(shopCard).getByLabelText("Nudge after (hours unanswered)")).toHaveValue(10);
		});
	});

	// Shops have no ceiling above them - shopCeiling is only ever populated on an ARTIST's own
	// row (from the shop's row), never on the shop's row itself.
	it("shows no ceiling hint on the shop's own section", async () => {
		renderPanel({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				settingsMock({ artistUserId: "admin-1" }),
				settingsMock({ shopId: "shop-1" }),
			],
		});

		const shopCard = await cardFor("Iron Anchor Tattoo Response Time");
		expect(
			within(shopCard).queryByText(/Your shop limits this to at most/),
		).not.toBeInTheDocument();
	});
});

describe("saving", () => {
	it("converts typed hours to minutes and shows a success alert", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				settingsMock({ artistUserId: "artist-1" }),
				{
					request: {
						query: ResponseTimeSettingsService.UPDATE_RESPONSE_TIME_SETTINGS,
						variables: {
							input: { initialThresholdMinutes: 240, repeatIntervalMinutes: 30 },
						},
					},
					result: {
						data: {
							updateResponseTimeSettings: settingsRow(
								{ artistUserId: "artist-1" },
								{ initialThresholdMinutes: 240, repeatIntervalMinutes: 30 },
							),
						},
					},
				},
			],
		});

		const initialField = await screen.findByLabelText("Nudge after (hours unanswered)");
		const repeatField = screen.getByLabelText("Repeat every (hours)");
		// 4 hours -> 240 minutes, 0.5 hours -> 30 minutes.
		await user.clear(initialField);
		await user.type(initialField, "4");
		await user.clear(repeatField);
		await user.type(repeatField, "0.5");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Response time settings updated.",
				}),
			),
		);
	});

	// ResponseTimePanel.jsx's handleSave conditionally includes shopId in the input only when
	// scope.shopId is set (a shop admin managing the shop's own row) - reaching the success alert
	// rather than an Apollo "no matching mock" error IS the assertion that shopId was included.
	it("includes shopId in the input when saving the shop's own section", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN_ARTIST,
			mocks: [
				settingsMock({ artistUserId: "admin-1" }),
				settingsMock({ shopId: "shop-1" }),
				{
					request: {
						query: ResponseTimeSettingsService.UPDATE_RESPONSE_TIME_SETTINGS,
						variables: {
							input: {
								shopId: "shop-1",
								initialThresholdMinutes: 600,
								repeatIntervalMinutes: 120,
							},
						},
					},
					result: {
						data: {
							updateResponseTimeSettings: settingsRow(
								{ shopId: "shop-1" },
								{ initialThresholdMinutes: 600, repeatIntervalMinutes: 120 },
							),
						},
					},
				},
			],
		});

		const shopCard = await cardFor("Iron Anchor Tattoo Response Time");
		const initialField = within(shopCard).getByLabelText("Nudge after (hours unanswered)");
		const repeatField = within(shopCard).getByLabelText("Repeat every (hours)");
		await user.clear(initialField);
		await user.type(initialField, "10");
		await user.clear(repeatField);
		await user.type(repeatField, "2");
		await user.click(within(shopCard).getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: "success",
					message: "Response time settings updated.",
				}),
			),
		);
	});

	it("shows the server's field-specific error message when the save fails", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				settingsMock({ artistUserId: "artist-1" }),
				{
					request: {
						query: ResponseTimeSettingsService.UPDATE_RESPONSE_TIME_SETTINGS,
						variables: {
							input: { initialThresholdMinutes: 12, repeatIntervalMinutes: 180 },
						},
					},
					result: {
						errors: [
							new GraphQLError("Validation failed.", {
								extensions: {
									errors: { initialThresholdMinutes: "Must be at least 30 minutes." },
								},
							}),
						],
					},
				},
			],
		});

		const initialField = await screen.findByLabelText("Nudge after (hours unanswered)");
		await user.clear(initialField);
		await user.type(initialField, "0.2");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: "error",
					message: "Must be at least 30 minutes.",
				}),
			),
		);
	});
});
