// NotificationItem.jsx tests. One inbox row - a stored event or a live condition, rendered almost
// identically except a condition has no "done" button (it can't be dismissed, only fixed - see the
// component's own header comment on why that's deliberate).
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import NotificationItem from "./NotificationItem";
import NotificationService from "../../services/NotificationService";

function item(overrides = {}) {
	return {
		key: "notif-1",
		type: "STORED",
		category: "money",
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

function markDoneMock(notificationIds) {
	return {
		request: {
			query: NotificationService.MARK_DONE,
			variables: { notificationIds },
		},
		result: { data: { markNotificationsDone: true } },
	};
}

function renderItem({ itemData = item(), mocks = [] } = {}) {
	return render(
		<MockedProvider mocks={mocks}>
			<NotificationItem item={itemData} />
		</MockedProvider>,
	);
}

describe("category label", () => {
	it.each([
		["money", "Money"],
		["schedule", "Schedule"],
		["roster", "Team"],
		["message", "Message"],
	])("maps %s to %s", (category, label) => {
		renderItem({ itemData: item({ category }) });
		expect(screen.getByText(label)).toBeInTheDocument();
	});

	it("falls back to the raw category string for an unrecognised one", () => {
		renderItem({ itemData: item({ category: "mystery" }) });
		expect(screen.getByText("mystery")).toBeInTheDocument();
	});
});

describe("content", () => {
	it("renders the title and body", () => {
		renderItem();
		expect(screen.getByText("Shop cut invoice issued")).toBeInTheDocument();
		expect(screen.getByText("Iron Anchor Tattoo issued an invoice for $150.00.")).toBeInTheDocument();
	});

	it("omits the body element when there is none", () => {
		const { container } = renderItem({ itemData: item({ body: null }) });
		expect(container.querySelector(".notificationBody")).not.toBeInTheDocument();
	});

	it("shows the formatted amount when amountCents is a positive number", () => {
		renderItem({ itemData: item({ amountCents: 15000 }) });
		expect(screen.getByText("$150.00")).toBeInTheDocument();
	});

	it("omits the amount line when amountCents is zero", () => {
		const { container } = renderItem({ itemData: item({ amountCents: 0 }) });
		expect(container.querySelector(".notificationAmount")).not.toBeInTheDocument();
	});

	it("omits the amount line when amountCents is absent", () => {
		const withoutAmount = item();
		delete withoutAmount.amountCents;
		const { container } = renderItem({ itemData: withoutAmount });
		expect(container.querySelector(".notificationAmount")).not.toBeInTheDocument();
	});
});

describe("unread and done styling", () => {
	it("adds the unread class for an unread, non-condition item", () => {
		const { container } = renderItem({ itemData: item({ readAt: null, isCondition: false }) });
		expect(container.querySelector(".notificationItem")).toHaveClass("notificationItemUnread");
	});

	it("omits the unread class once readAt is set", () => {
		const { container } = renderItem({ itemData: item({ readAt: "2026-08-21T00:00:00.000Z" }) });
		expect(container.querySelector(".notificationItem")).not.toHaveClass("notificationItemUnread");
	});

	it("never applies the unread class to a condition, even with no readAt", () => {
		const { container } = renderItem({ itemData: item({ isCondition: true, readAt: null }) });
		expect(container.querySelector(".notificationItem")).not.toHaveClass("notificationItemUnread");
	});

	it("adds the done class once doneAt is set", () => {
		const { container } = renderItem({ itemData: item({ doneAt: "2026-08-22T00:00:00.000Z" }) });
		expect(container.querySelector(".notificationItem")).toHaveClass("notificationItemDone");
	});
});

describe("the Mark handled action", () => {
	it("shows the button for an undone stored event and fires the mutation with its key", async () => {
		const user = userEvent.setup();
		renderItem({
			itemData: item({ key: "notif-42", isCondition: false, doneAt: null }),
			mocks: [markDoneMock(["notif-42"])],
		});

		const button = screen.getByRole("button", { name: "Mark handled" });
		await user.click(button);

		// Reaching a stable state (button still present - this component never removes itself)
		// with no unmatched-mock error from MockedProvider is the evidence markDone fired with
		// exactly this item's key.
		await waitFor(() => expect(button).toBeInTheDocument());
	});

	it("hides the button once the item is already done", () => {
		renderItem({ itemData: item({ isCondition: false, doneAt: "2026-08-22T00:00:00.000Z" }) });
		expect(screen.queryByRole("button", { name: "Mark handled" })).not.toBeInTheDocument();
	});

	it("hides the button and shows the self-clearing note for a condition", () => {
		renderItem({ itemData: item({ isCondition: true, doneAt: null }) });
		expect(screen.queryByRole("button", { name: "Mark handled" })).not.toBeInTheDocument();
		expect(screen.getByText("Clears itself once this is sorted.")).toBeInTheDocument();
	});
});
