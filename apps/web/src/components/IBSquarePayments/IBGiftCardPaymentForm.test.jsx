// IBGiftCardPaymentForm.jsx tests. Sibling of IBSquarePaymentForm.jsx, tested the same way for
// the same reason (see that file's own header comment on why this is a deliberate copy rather
// than a shared/generalized component) - the SDK is mocked at the module boundary and these tests
// pin the same two rules: amountCents is display-only and never sent, and the idempotency key is
// generated once per mount and survives a retry.
//
// This form's own distinct shape - smaller body (sourceId, idempotencyKey, note, giftCardId,
// nothing session-shaped), different route (square/process-gift-card-payment) - is what these
// tests exist to pin that IBSquarePaymentForm's own tests don't already cover.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBGiftCardPaymentForm from "./IBGiftCardPaymentForm";
import { AuthContext } from "../../context/auth";
import { loadSquareSdk } from "./loadSquareSdk";
import { loadSquareConfig } from "./squareConfig";

vi.mock("./loadSquareSdk", () => ({ loadSquareSdk: vi.fn() }));
vi.mock("./squareConfig", () => ({ loadSquareConfig: vi.fn() }));

const USER = { id: "shop-admin-1", accessToken: "test-access-token" };

function buildSquare({ tokenizeResult } = {}) {
	const card = {
		attach: vi.fn(async () => {}),
		tokenize: vi.fn(async () => tokenizeResult ?? { status: "OK", token: "fake-nonce" }),
		destroy: vi.fn(async () => {}),
	};
	const paymentsInstance = { card: vi.fn(async () => card) };
	const Square = { payments: vi.fn(() => paymentsInstance) };
	return { Square, card, paymentsInstance };
}

function setupSquare(opts) {
	const built = buildSquare(opts);
	loadSquareSdk.mockResolvedValue(built.Square);
	loadSquareConfig.mockResolvedValue({ applicationId: "app-1", locationId: "loc-1" });
	return built;
}

function renderForm(props = {}, user = USER) {
	return render(
		<AuthContext.Provider value={{ user }}>
			<IBGiftCardPaymentForm giftCardId="giftcard-1" amountCents={10000} note="Gift card sale" {...props} />
		</AuthContext.Provider>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	global.fetch = vi.fn();
});

it("shows a loading spinner before the SDK and config resolve", () => {
	loadSquareSdk.mockReturnValue(new Promise(() => {}));
	loadSquareConfig.mockReturnValue(new Promise(() => {}));
	renderForm();

	expect(screen.getByRole("progressbar")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: /Pay \$100\.00/ })).toBeDisabled();
});

it("enables Pay once the card field attaches", async () => {
	setupSquare();
	renderForm();

	await waitFor(() => expect(screen.getByRole("button", { name: /Pay \$100\.00/ })).toBeEnabled());
});

it("posts giftCardId (not amountCents) to square/process-gift-card-payment and calls onSuccess", async () => {
	setupSquare();
	global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ paymentId: "pay_gc_1" }) });
	const onSuccess = vi.fn();
	const user = userEvent.setup();
	renderForm({ onSuccess });

	await user.click(await screen.findByRole("button", { name: /Pay \$100\.00/ }));

	await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("pay_gc_1"));
	const [url, init] = global.fetch.mock.calls[0];
	expect(url).toContain("square/process-gift-card-payment");
	expect(init.headers.Authorization).toBe("Bearer test-access-token");
	const body = JSON.parse(init.body);
	expect(body).toEqual({
		sourceId: "fake-nonce",
		idempotencyKey: expect.any(String),
		note: "Gift card sale",
		giftCardId: "giftcard-1",
	});
	// Same regression IBSquarePaymentForm guards against: the server, not the browser, knows what
	// this card is worth (amountCents here comes from the create response's own faceValueCents).
	expect(body).not.toHaveProperty("amountCents");
});

it("keeps the same idempotency key across a retry after a decline", async () => {
	setupSquare();
	global.fetch
		.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Card declined." }) })
		.mockResolvedValueOnce({ ok: true, json: async () => ({ paymentId: "pay_gc_2" }) });
	const onError = vi.fn();
	const onSuccess = vi.fn();
	const user = userEvent.setup();
	renderForm({ onError, onSuccess });

	const payButton = await screen.findByRole("button", { name: /Pay \$100\.00/ });
	await user.click(payButton);
	expect(await screen.findByText("Card declined.")).toBeInTheDocument();
	expect(onError).toHaveBeenCalledWith("Card declined.");

	await user.click(screen.getByRole("button", { name: /Pay \$100\.00/ }));
	await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("pay_gc_2"));

	const firstKey = JSON.parse(global.fetch.mock.calls[0][1].body).idempotencyKey;
	const secondKey = JSON.parse(global.fetch.mock.calls[1][1].body).idempotencyKey;
	expect(secondKey).toBe(firstKey);
});

it("shows the tokenizer's own error and never calls fetch when tokenize fails", async () => {
	setupSquare({ tokenizeResult: { status: "INVALID", errors: [{ message: "Invalid card number." }] } });
	const onError = vi.fn();
	const user = userEvent.setup();
	renderForm({ onError });

	await user.click(await screen.findByRole("button", { name: /Pay \$100\.00/ }));

	expect(await screen.findByText("Invalid card number.")).toBeInTheDocument();
	expect(onError).toHaveBeenCalledWith("Invalid card number.");
	expect(global.fetch).not.toHaveBeenCalled();
});

it("destroys the card field on unmount", async () => {
	const { card } = setupSquare();
	const { unmount } = renderForm();

	await waitFor(() => expect(screen.getByRole("button", { name: /Pay \$100\.00/ })).toBeEnabled());
	unmount();

	expect(card.destroy).toHaveBeenCalled();
});
