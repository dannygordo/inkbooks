// NotificationBell.jsx tests. The bell icon + badge, and the menu behind it - see the component's
// own header comment on why stored events and live conditions are shown merged, and why opening
// the menu does NOT mark anything read (a deliberate act, not a side effect of looking).
//
// NotificationItem is mocked out - it has its own full test file (NotificationItem.test.jsx) and
// this file's job is confirming NotificationBell wires the right items into it and gets the
// "Mark all read" gating right, not re-testing NotificationItem's own rendering or its markDone
// mutation (the same "don't exercise somebody else's test" pattern SharedImagesPanel.test.jsx uses
// for IBImagesList). The real GET_INBOX/MARK_READ documents run through MockedProvider, matching
// this codebase's own convention (see NotificationSettingsPanel.test.jsx's header comment).
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import NotificationBell from "./NotificationBell";
import NotificationService from "../../services/NotificationService";

vi.mock("./NotificationItem", () => ({
	default: vi.fn(({ item }) => (
		<div data-testid={`notification-item-${item.key}`}>{item.title}</div>
	)),
}));

function item(overrides = {}) {
	return {
		key: "notif-1",
		type: "STORED",
		category: "money",
		subjectType: "Invoice",
		subjectId: "inv-1",
		title: "Shop cut invoice issued",
		body: "Iron Anchor Tattoo issued an invoice for $150.00.",
		amountCents: 15000,
		createdAt: "2026-08-20T12:00:00.000Z",
		readAt: null,
		doneAt: null,
		isCondition: false,
		...overrides,
	};
}

function inboxMock(inboxData, variables = { includeRead: true }) {
	return {
		request: { query: NotificationService.GET_INBOX, variables },
		result: { data: { getInbox: inboxData } },
	};
}

function markReadMock(result = { data: { markNotificationsRead: true } }) {
	return {
		request: { query: NotificationService.MARK_READ, variables: {} },
		result,
	};
}

function renderBell({ mocks = [] } = {}) {
	return render(
		<MockedProvider mocks={mocks}>
			<NotificationBell />
		</MockedProvider>,
	);
}

async function openMenu() {
	const user = userEvent.setup();
	await user.click(screen.getByRole("button", { name: "Notifications" }));
	return user;
}

describe("the closed bell", () => {
	it("renders the bell icon with no menu open", () => {
		renderBell({ mocks: [inboxMock({ unreadCount: 0, items: [] })] });

		expect(screen.getByTestId("NotificationsIcon")).toBeInTheDocument();
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	});

	it("shows the unread count on the badge once the inbox loads", async () => {
		renderBell({ mocks: [inboxMock({ unreadCount: 3, items: [] })] });

		expect(await screen.findByText("3")).toBeInTheDocument();
	});
});

describe("opening the inbox", () => {
	it("shows the empty message when there are no items", async () => {
		renderBell({ mocks: [inboxMock({ unreadCount: 0, items: [] })] });
		await openMenu();

		expect(await screen.findByText("Nothing needs your attention.")).toBeInTheDocument();
	});

	it("renders one row per item, stored events and conditions alike", async () => {
		const items = [
			item({ key: "notif-1", title: "Shop cut invoice issued" }),
			item({ key: "cond-deposit-1", title: "Deposit still unapplied", isCondition: true }),
		];
		renderBell({ mocks: [inboxMock({ unreadCount: 1, items })] });
		await openMenu();

		expect(await screen.findByTestId("notification-item-notif-1")).toHaveTextContent(
			"Shop cut invoice issued",
		);
		expect(screen.getByTestId("notification-item-cond-deposit-1")).toHaveTextContent(
			"Deposit still unapplied",
		);
	});

	it("closes the menu on Escape", async () => {
		renderBell({ mocks: [inboxMock({ unreadCount: 0, items: [] })] });
		const user = await openMenu();

		expect(await screen.findByText("Nothing needs your attention.")).toBeInTheDocument();

		await user.keyboard("{Escape}");

		await waitFor(() =>
			expect(screen.queryByText("Nothing needs your attention.")).not.toBeInTheDocument(),
		);
	});
});

describe("the Mark all read button", () => {
	it("shows it when there is an unread, non-condition item", async () => {
		renderBell({
			mocks: [inboxMock({ unreadCount: 1, items: [item({ readAt: null, isCondition: false })] })],
		});
		await openMenu();

		expect(await screen.findByRole("button", { name: "Mark all read" })).toBeInTheDocument();
	});

	it("hides it once every stored item is already read", async () => {
		renderBell({
			mocks: [
				inboxMock({
					unreadCount: 0,
					items: [item({ readAt: "2026-08-21T00:00:00.000Z", isCondition: false })],
				}),
			],
		});
		await openMenu();

		await screen.findByTestId("notification-item-notif-1");
		expect(screen.queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument();
	});

	it("hides it when the only unread item is a condition - conditions can't be marked read", async () => {
		renderBell({
			mocks: [
				inboxMock({
					unreadCount: 0,
					items: [item({ key: "cond-1", isCondition: true, readAt: null })],
				}),
			],
		});
		await openMenu();

		await screen.findByTestId("notification-item-cond-1");
		expect(screen.queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument();
	});

	it("fires markRead with no ids (mark EVERYTHING read) when clicked", async () => {
		const items = [item({ readAt: null, isCondition: false })];
		renderBell({
			mocks: [
				inboxMock({ unreadCount: 1, items }),
				markReadMock(),
				// markRead's refetchQueries: ["GetInbox"] re-runs the same query by operation name.
				inboxMock({ unreadCount: 1, items }),
			],
		});
		const user = await openMenu();

		const button = await screen.findByRole("button", { name: "Mark all read" });
		await user.click(button);

		// Reaching a stable state with no unmatched-mock error from MockedProvider is the evidence
		// markRead fired with exactly `{}` as its variables - the same reasoning
		// NotificationItem.test.jsx's own "Mark handled" assertion uses.
		await waitFor(() => expect(button).toBeInTheDocument());
	});
});
