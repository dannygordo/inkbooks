// NotificationSettingsPanel.jsx tests. Six per-category toggles (four rendered, per the
// component's own CATEGORIES list) resolving to a mode, plus a digest hour/timezone pair shown
// only when something actually digests - see the component's own header comment on why there's no
// per-event-type granularity and why in-app itself can't be switched off.
//
// The real GET_SETTINGS query runs through MockedProvider (so the loading/loaded states are real),
// but useUpdateSettings is replaced with a plain mock function - the mutation's own success path
// never updates the getNotificationSettings query in the cache (different root fields, no id to
// normalize by), and its failure path is swallowed silently by the component's own `.catch(() =>
// {})` (see its comment on why), so asserting through MockedProvider's request matching would only
// prove UI that doesn't move. Spying on the call directly is the reliable way to check what each
// interaction actually sends.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import NotificationSettingsPanel from "./NotificationSettingsPanel";
import NotificationService from "../../services/NotificationService";

const { mockUpdateSettings, updateState } = vi.hoisted(() => ({
	mockUpdateSettings: vi.fn(),
	updateState: { loading: false },
}));

vi.mock("../../services/NotificationService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		default: {
			...actual.default,
			useUpdateSettings: () => [mockUpdateSettings, updateState],
		},
	};
});

function settings(overrides = {}) {
	return {
		__typename: "NotificationSettings",
		prefs: {
			__typename: "NotificationPrefs",
			moneyEmail: true,
			scheduleEmail: true,
			rosterEmail: true,
			messageEmail: false,
		},
		moneyMode: "immediate",
		scheduleMode: "immediate",
		rosterMode: "immediate",
		messageMode: "off",
		timezone: "America/Chicago",
		digestHour: 8,
		...overrides,
	};
}

function settingsMock(settingsData) {
	return {
		request: { query: NotificationService.GET_SETTINGS },
		result: { data: { getNotificationSettings: settingsData } },
	};
}

function renderPanel(settingsData = settings()) {
	return render(
		<MockedProvider mocks={[settingsMock(settingsData)]}>
			<NotificationSettingsPanel />
		</MockedProvider>,
	);
}

beforeEach(() => {
	mockUpdateSettings.mockReset();
	mockUpdateSettings.mockResolvedValue({ data: { updateNotificationSettings: settings() } });
	updateState.loading = false;
	vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({
		resolvedOptions: () => ({ timeZone: "America/New_York" }),
	}));
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("loading", () => {
	it("renders nothing before settings have arrived", () => {
		const { container } = renderPanel();
		expect(container).toBeEmptyDOMElement();
	});
});

describe("once loaded", () => {
	it("renders the heading, help text, and each category's hint and resolved mode", async () => {
		renderPanel();

		expect(await screen.findByText("Notifications")).toBeInTheDocument();
		expect(
			screen.getByText(/These control email only\. Everything still appears/),
		).toBeInTheDocument();

		expect(screen.getByText("Deposits, payments, shop cuts.")).toBeInTheDocument();
		expect(screen.getByText("Booking requests, bookings, cancellations.")).toBeInTheDocument();
		expect(screen.getByText("Artists joining or leaving, rate changes.")).toBeInTheDocument();
		expect(screen.getByText("New messages from clients and artists.")).toBeInTheDocument();

		// Three categories resolve to "immediate", one ("Messages") to "off".
		expect(screen.getAllByText("Emailed as it happens")).toHaveLength(3);
		expect(screen.getByText("In-app only")).toBeInTheDocument();
	});

	it("checks the switch for a category whose mode isn't off, and unchecks it otherwise", async () => {
		renderPanel();
		await screen.findByText("Notifications");

		const moneyRow = screen.getByText("Money").closest(".notificationPrefRow");
		expect(within(moneyRow).getByRole("switch")).toBeChecked();

		const messagesRow = screen.getByText("Messages").closest(".notificationPrefRow");
		expect(within(messagesRow).getByRole("switch")).not.toBeChecked();
	});
});

describe("the digest row", () => {
	it("is hidden when no category resolves to digest", async () => {
		renderPanel();
		await screen.findByText("Notifications");

		expect(screen.queryByRole("combobox", { name: "Daily summary arrives at" })).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Your timezone")).not.toBeInTheDocument();
	});

	it("appears with the hour select and timezone field once a category digests", async () => {
		renderPanel(settings({ messageMode: "digest" }));
		await screen.findByText("Notifications");

		expect(screen.getByText("Rolled into your daily summary")).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Daily summary arrives at" })).toBeInTheDocument();
		expect(screen.getByLabelText("Your timezone")).toHaveValue("America/Chicago");
	});

	it("notes when the browser's own zone differs from the saved one", async () => {
		renderPanel(settings({ messageMode: "digest", timezone: "America/Chicago" }));
		await screen.findByText("Notifications");

		expect(screen.getByText("This browser says America/New_York")).toBeInTheDocument();
	});
});

describe("toggling a category switch", () => {
	it("sends the newly-resolved boolean for the category being turned off", async () => {
		const user = userEvent.setup();
		renderPanel();
		await screen.findByText("Notifications");

		const moneyRow = screen.getByText("Money").closest(".notificationPrefRow");
		await user.click(within(moneyRow).getByRole("switch"));

		expect(mockUpdateSettings).toHaveBeenCalledWith({ variables: { prefs: { moneyEmail: false } } });
	});

	it("sends true for a category currently off", async () => {
		const user = userEvent.setup();
		renderPanel();
		await screen.findByText("Notifications");

		const messagesRow = screen.getByText("Messages").closest(".notificationPrefRow");
		await user.click(within(messagesRow).getByRole("switch"));

		expect(mockUpdateSettings).toHaveBeenCalledWith({ variables: { prefs: { messageEmail: true } } });
	});
});

describe("the digest hour picker", () => {
	it("saves the newly-chosen hour", async () => {
		const user = userEvent.setup();
		renderPanel(settings({ messageMode: "digest", digestHour: 8 }));
		await screen.findByText("Notifications");

		await user.click(screen.getByRole("combobox", { name: "Daily summary arrives at" }));
		await user.click(await screen.findByRole("option", { name: "9 AM" }));

		expect(mockUpdateSettings).toHaveBeenCalledWith({ variables: { digestHour: 9 } });
	});
});

describe("the timezone field", () => {
	it("saves on blur, not on every keystroke", async () => {
		const user = userEvent.setup();
		renderPanel(settings({ messageMode: "digest", timezone: "America/Chicago" }));
		await screen.findByText("Notifications");

		const field = screen.getByLabelText("Your timezone");
		await user.clear(field);
		await user.type(field, "America/Denver");
		expect(mockUpdateSettings).not.toHaveBeenCalled();

		await user.tab();
		expect(mockUpdateSettings).toHaveBeenCalledWith({ variables: { timezone: "America/Denver" } });
	});
});

describe("while a save is in flight", () => {
	it("disables every switch and field", async () => {
		updateState.loading = true;
		renderPanel(settings({ messageMode: "digest" }));
		await screen.findByText("Notifications");

		for (const toggle of screen.getAllByRole("switch")) {
			expect(toggle).toBeDisabled();
		}
		expect(screen.getByRole("combobox", { name: "Daily summary arrives at" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(screen.getByLabelText("Your timezone")).toBeDisabled();
	});
});
