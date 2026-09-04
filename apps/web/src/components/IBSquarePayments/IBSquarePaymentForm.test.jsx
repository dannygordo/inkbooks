// IBSquarePaymentForm.jsx tests. This is the real, working replacement for the retired
// SqPaymentForm-based version (see the component's own header comment) - the SDK itself
// (loadSquareSdk/loadSquareConfig) is mocked at the module boundary, same as any other
// third-party-script wrapper in this app, so these tests exercise the component's own state
// machine (loading -> ready -> submitting -> ready/error) and what it actually sends the server,
// not Square's real SDK.
//
// THE two rules this file exists to pin, both called out explicitly in the component's own
// comments:
//   1. amountCents is display-only and must never appear in the POST body - the server derives
//      the charge from stored rates (DECISIONS.md M8), so the browser telling it a number here
//      would be exactly the bug that fix closed.
//   2. idempotencyKey is generated once per mount, not once per submit - a retry after a failed
//      or timed-out payment must carry the SAME key so Square treats it as one payment, not two.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBSquarePaymentForm from "./IBSquarePaymentForm";
import { AuthContext } from "../../context/auth";
import { loadSquareSdk } from "./loadSquareSdk";
import { loadSquareConfig } from "./squareConfig";

vi.mock("./loadSquareSdk", () => ({ loadSquareSdk: vi.fn() }));
vi.mock("./squareConfig", () => ({ loadSquareConfig: vi.fn() }));

const USER = { id: "artist-1", accessToken: "test-access-token" };

// A minimal stand-in for the real Square.payments(appId, locationId).card() chain. tokenizeResult
// defaults to a successful nonce; attachError lets a test simulate the card field itself failing
// to mount (network/SDK failure, not a decline - see the component's "error" status).
function buildSquare({ attachError, tokenizeResult } = {}) {
	const card = {
		attach: vi.fn(async () => {
			if (attachError) {
				throw attachError;
			}
		}),
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
			<IBSquarePaymentForm
				amountCents={5000}
				appointmentId="appt-1"
				chargeType="deposit"
				applyFeeOffset={false}
				tipCents={0}
				note="Session deposit"
				{...props}
			/>
		</AuthContext.Provider>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	global.fetch = vi.fn();
});

it("shows a loading spinner while the SDK loads and the card field attaches", () => {
	// Never resolves - this is checking the synchronous initial render, not waiting anything out.
	loadSquareSdk.mockReturnValue(new Promise(() => {}));
	loadSquareConfig.mockReturnValue(new Promise(() => {}));
	renderForm();

	expect(screen.getByRole("progressbar")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: /Pay \$50\.00/ })).toBeDisabled();
});

it("attaches the card field and enables Pay once the SDK and config both resolve", async () => {
	const { card, paymentsInstance } = setupSquare();
	renderForm();

	await waitFor(() => expect(screen.getByRole("button", { name: /Pay \$50\.00/ })).toBeEnabled());
	expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
	// The card id/location passed to payments() come from the server-provided config, not from
	// anything hardcoded here - see squareConfig.js's own comment on the app-id/token mismatch bug
	// this guards against.
	expect(paymentsInstance.card).toHaveBeenCalled();
	expect(card.attach).toHaveBeenCalled();
});

it("shows an error, calls onError, and leaves Pay disabled when the SDK itself fails to load", async () => {
	loadSquareSdk.mockRejectedValue(new Error("Failed to load the Square Web Payments SDK script."));
	loadSquareConfig.mockResolvedValue({ applicationId: "app-1", locationId: "loc-1" });
	const onError = vi.fn();
	renderForm({ onError });

	expect(await screen.findByText("Failed to load the Square Web Payments SDK script.")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: /Pay \$50\.00/ })).toBeDisabled();
	expect(onError).toHaveBeenCalledWith("Failed to load the Square Web Payments SDK script.");
	// Never got as far as trying to charge anything.
	expect(global.fetch).not.toHaveBeenCalled();
});

it("tokenizes, posts to square/process-payment without amountCents, and calls onSuccess with the paymentId", async () => {
	setupSquare();
	global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ paymentId: "pay_123" }) });
	const onSuccess = vi.fn();
	const user = userEvent.setup();
	renderForm({ onSuccess, tipCents: 1000, applyFeeOffset: true });

	await user.click(await screen.findByRole("button", { name: /Pay \$50\.00/ }));

	await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("pay_123"));
	expect(global.fetch).toHaveBeenCalledTimes(1);
	const [url, init] = global.fetch.mock.calls[0];
	expect(url).toContain("square/process-payment");
	expect(init.method).toBe("POST");
	expect(init.headers.Authorization).toBe("Bearer test-access-token");
	const body = JSON.parse(init.body);
	expect(body).toEqual({
		sourceId: "fake-nonce",
		idempotencyKey: expect.any(String),
		note: "Session deposit",
		appointmentId: "appt-1",
		chargeType: "deposit",
		applyFeeOffset: true,
		tipCents: 1000,
	});
	// THE regression this test exists to catch: the browser must never tell the server what to
	// charge. amountCents is for display (the Pay button's own label) only.
	expect(body).not.toHaveProperty("amountCents");
	// Back to "ready", not stuck showing "Processing...".
	expect(screen.getByRole("button", { name: /Pay \$50\.00/ })).toBeInTheDocument();
});

it("surfaces a decline message from the server, calls onError, and never mutates the idempotency key on retry", async () => {
	setupSquare();
	global.fetch
		.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Card declined." }) })
		.mockResolvedValueOnce({ ok: true, json: async () => ({ paymentId: "pay_456" }) });
	const onError = vi.fn();
	const onSuccess = vi.fn();
	const user = userEvent.setup();
	renderForm({ onError, onSuccess });

	const payButton = await screen.findByRole("button", { name: /Pay \$50\.00/ });
	await user.click(payButton);
	expect(await screen.findByText("Card declined.")).toBeInTheDocument();
	expect(onError).toHaveBeenCalledWith("Card declined.");

	// Retry - same press, same mounted form.
	await user.click(screen.getByRole("button", { name: /Pay \$50\.00/ }));
	await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("pay_456"));

	expect(global.fetch).toHaveBeenCalledTimes(2);
	const firstKey = JSON.parse(global.fetch.mock.calls[0][1].body).idempotencyKey;
	const secondKey = JSON.parse(global.fetch.mock.calls[1][1].body).idempotencyKey;
	// A key generated inside handlePay (rather than once per mount, via a ref) would make this
	// fail - that used to be exactly how the server itself charged a retry twice.
	expect(secondKey).toBe(firstKey);
});

it("shows the tokenizer's own error message and never calls fetch when tokenize itself fails", async () => {
	setupSquare({ tokenizeResult: { status: "INVALID", errors: [{ message: "Invalid card number." }] } });
	const onError = vi.fn();
	const user = userEvent.setup();
	renderForm({ onError });

	await user.click(await screen.findByRole("button", { name: /Pay \$50\.00/ }));

	expect(await screen.findByText("Invalid card number.")).toBeInTheDocument();
	expect(onError).toHaveBeenCalledWith("Invalid card number.");
	expect(global.fetch).not.toHaveBeenCalled();
});

it("destroys the card field on unmount so a repeatedly opened form doesn't leak Square's iframe", async () => {
	const { card } = setupSquare();
	const { unmount } = renderForm();

	await waitFor(() => expect(screen.getByRole("button", { name: /Pay \$50\.00/ })).toBeEnabled());
	unmount();

	expect(card.destroy).toHaveBeenCalled();
});
