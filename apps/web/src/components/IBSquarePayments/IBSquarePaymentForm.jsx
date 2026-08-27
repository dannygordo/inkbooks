import React, { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { useAuth } from "../../context/auth";
import { loadSquareSdk } from "./loadSquareSdk";
import { loadSquareConfig } from "./squareConfig";
import { apiUrl } from "../../utils/apiUrl";

// Real, working replacement for the previous version of this component, which was built against
// Square's SqPaymentForm API - retired by Square years before this was ever written - and was
// never actually imported/rendered by any page in this app (confirmed via a full-codebase grep).
// This one uses Square's current Web Payments SDK (Square.payments()/card()/tokenize(), loaded
// dynamically via loadSquareSdk.js) and posts the resulting token to the real server route this
// session added at routes/squarePayments.js. Sandbox-only, matching that route - see its own
// comment for why.
//
// THIS COMPONENT NO LONGER SAYS WHAT THE CHARGE IS. It used to send amountCents plus a full
// subtotal/tax/fee/tip breakdown, and the server wrote those figures onto the session and computed
// the shop's cut from them - so the browser was, in effect, telling the server how much the shop
// was owed. The server now derives every figure from stored rates (see server/utils/charge-quote.js
// and DECISIONS.md M8); this posts only what the browser legitimately knows.
//
// The displayed total comes from getChargeQuote, computed by the same function that computes the
// charge, so what the artist agrees to on screen and what leaves the card cannot differ.
//
// Props:
// - appointmentId: required - the session being charged. The amount is looked up from it.
// - amountCents: display only, from the quote. NOT sent, and not what is charged.
// - applyFeeOffset: whether the artist accepted the Square_Fee_Offset (M5). Their choice to make;
//   whether it is honoured is the server's.
// - tipCents: decided at the counter, so genuinely input. Also the one money figure a caller can
//   set that cannot move the shop's cut, since tips sit outside the cuttable base (M2).
// - note: optional string describing what this charge is for (shown on the Square dashboard, not
//   to the payer).
// - onSuccess(paymentId): called once the server confirms the charge succeeded.
// - onError(message): called on any failure - card declined, network error, SDK load failure.
const IBSquarePaymentForm = ({
	amountCents,
	appointmentId,
	chargeType,
	applyFeeOffset,
	tipCents,
	note,
	onSuccess,
	onError,
}) => {
	const { user } = useAuth();
	const cardRef = useRef(null);
	const containerRef = useRef(null);
	// Generated once per mounted form, not per submit. That is the whole point: if the first POST
	// times out and the artist presses Pay again, the retry carries the SAME key and Square treats
	// it as the same payment rather than a second one. A key generated inside handlePay would make
	// every press a distinct charge, which is what the server used to do for itself.
	const idempotencyKeyRef = useRef(
		typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID()
			: `ib-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
	);
	// idle -> loading the SDK/attaching the card field; ready -> can tap Pay; submitting -> charge
	// in flight; error -> the card field itself never mounted (SDK/network failure, not a decline).
	const [status, setStatus] = useState("loading");
	const [errorMessage, setErrorMessage] = useState("");

	useEffect(() => {
		let cancelled = false;

		async function setup() {
			try {
				// Both in parallel - the SDK script and the config are independent, and the card
				// field can't attach without either.
				const [Square, config] = await Promise.all([loadSquareSdk(), loadSquareConfig()]);
				if (cancelled) {
					return;
				}
				// From the server, so the application this tokenizes against is by construction the
				// one whose access token will charge the resulting nonce. See squareConfig.js.
				const payments = Square.payments(config.applicationId, config.locationId);
				const card = await payments.card();
				if (cancelled) {
					return;
				}
				await card.attach(containerRef.current);
				cardRef.current = card;
				setStatus("ready");
			} catch (err) {
				if (!cancelled) {
					setErrorMessage(err.message);
					setStatus("error");
					if (onError) {
						onError(err.message);
					}
				}
			}
		}

		setup();

		return () => {
			cancelled = true;
			if (cardRef.current) {
				// destroy() detaches the card field's iframes - not calling this on unmount would
				// leak them if this form is opened/closed repeatedly (e.g. inside IBModal).
				cardRef.current.destroy().catch(() => {});
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handlePay = async () => {
		if (!cardRef.current) {
			return;
		}
		setStatus("submitting");
		setErrorMessage("");
		try {
			const tokenResult = await cardRef.current.tokenize();
			if (tokenResult.status !== "OK") {
				const message =
					(tokenResult.errors &&
						tokenResult.errors.map((e) => e.message).join("; ")) ||
					"Could not process this card.";
				throw new Error(message);
			}

			// Same host as GraphQL/socket.io - this is a plain Express route, not a GraphQL
			// mutation, same pattern BookingRequest.jsx already uses for its own non-GraphQL
			// upload endpoint.
			const processUrl = apiUrl("square/process-payment");
			const response = await fetch(processUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${user.accessToken}`,
				},
				body: JSON.stringify({
					sourceId: tokenResult.token,
					idempotencyKey: idempotencyKeyRef.current,
					note,
					appointmentId,
					chargeType,
					applyFeeOffset,
					tipCents,
				}),
			});
			const data = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error((data && data.error) || "Payment failed.");
			}

			setStatus("ready");
			if (onSuccess) {
				onSuccess(data.paymentId);
			}
		} catch (err) {
			setErrorMessage(err.message);
			setStatus("ready");
			if (onError) {
				onError(err.message);
			}
		}
	};

	return (
		<Box sx={{ minWidth: 320, p: 1 }}>
			<Box ref={containerRef} id="sq-card-container" sx={{ minHeight: 90, mb: 2 }} />
			{status === "loading" && <CircularProgress size={24} />}
			{errorMessage && (
				<Alert severity="error" sx={{ mb: 2 }}>
					{errorMessage}
				</Alert>
			)}
			<Button
				variant="contained"
				disabled={status === "loading" || status === "submitting" || status === "error"}
				onClick={handlePay}
			>
				{status === "submitting"
					? "Processing..."
					: `Pay $${(amountCents / 100).toFixed(2)}`}
			</Button>
		</Box>
	);
};

export default IBSquarePaymentForm;
