import React, { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { useAuth } from "../../context/auth";
import { loadSquareSdk } from "./loadSquareSdk";
import { loadSquareConfig } from "./squareConfig";
import { apiUrl } from "../../utils/apiUrl";

// Sibling of IBSquarePaymentForm.jsx, not a generalization of it - see this session's own gift
// card slice (DECISIONS.md M6's payment-collection follow-up) for why: IBSquarePaymentForm is
// deposit/session-shaped (appointmentId, chargeType, tipCents) and already carries two real,
// tested callers (BookSessionDatesForm.jsx, SessionDetail.jsx). A gift card sale needs the exact
// same Square Web Payments SDK mechanics (attach a card field, tokenize, POST the resulting
// source id) but posts to a different route with a different, smaller body - copying that
// mechanic here rather than reshaping the existing, already-proven component's props keeps this
// new, money-moving code from touching either of its existing call sites at all. Worth
// consolidating into one shared hook if a THIRD real caller ever shows up - see
// utils/formBuilder.ts's own "extract on second/third use" precedent on the mobile side for the
// same restraint applied the other direction.
//
// Props:
// - giftCardId: required - the pending card this charges. The amount is read from it server-side.
// - amountCents: display only, from the create response's faceValueCents + feeOffsetCents. NOT
//   sent, and not what is charged - see routes/squarePayments.js's process-gift-card-payment.
// - note: optional string shown on the Square dashboard, not to the payer.
// - onSuccess(paymentId): called once the server confirms the charge succeeded.
// - onError(message): called on any failure - card declined, network error, SDK load failure.
const IBGiftCardPaymentForm = ({ giftCardId, amountCents, note, onSuccess, onError }) => {
	const { user } = useAuth();
	const cardRef = useRef(null);
	const containerRef = useRef(null);
	// Generated once per mounted form, not per submit - see IBSquarePaymentForm.jsx's own comment
	// on why (a retry after a timeout has to carry the SAME key so Square treats it as the same
	// payment, not a second one).
	const idempotencyKeyRef = useRef(
		typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID()
			: `ib-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
	);
	const [status, setStatus] = useState("loading");
	const [errorMessage, setErrorMessage] = useState("");

	useEffect(() => {
		let cancelled = false;

		async function setup() {
			try {
				const [Square, config] = await Promise.all([loadSquareSdk(), loadSquareConfig()]);
				if (cancelled) {
					return;
				}
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
					(tokenResult.errors && tokenResult.errors.map((e) => e.message).join("; ")) ||
					"Could not process this card.";
				throw new Error(message);
			}

			const processUrl = apiUrl("square/process-gift-card-payment");
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
					giftCardId,
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
			<Box ref={containerRef} id="sq-gift-card-container" sx={{ minHeight: 90, mb: 2 }} />
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
				{status === "submitting" ? "Processing..." : `Pay $${(amountCents / 100).toFixed(2)}`}
			</Button>
		</Box>
	);
};

export default IBGiftCardPaymentForm;
