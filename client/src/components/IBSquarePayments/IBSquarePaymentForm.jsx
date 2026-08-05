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
// Props:
// - amountCents: integer - the exact amount to charge. This is the grand total: work + tax +
//   fees + tip.
// - appointmentId: optional - when present, the server persists the breakdown below against that
//   session and recomputes its shop cut (see routes/squarePayments.js). Omitted for one-off
//   charges with no session behind them, e.g. a project deposit.
// - subtotalCents/taxCents/feeCents/tipCents: the components of amountCents. Passed explicitly
//   rather than derived server-side because they are NOT derivable from a total - and the tip in
//   particular has to be separable, since the artist keeps all of it and the shop cut is computed
//   without it. A charge that records only its total makes that permanently unanswerable.
// - note: optional string describing what this charge is for (shown on the Square sandbox
//   dashboard, not to the payer).
// - onSuccess(paymentId): called once the server confirms the charge succeeded.
// - onError(message): called on any failure - card declined, network error, SDK load failure.
const IBSquarePaymentForm = ({
	amountCents,
	appointmentId,
	subtotalCents,
	taxCents,
	feeCents,
	tipCents,
	note,
	onSuccess,
	onError,
}) => {
	const { user } = useAuth();
	const cardRef = useRef(null);
	const containerRef = useRef(null);
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
					amountCents,
					note,
					appointmentId,
					subtotalCents,
					taxCents,
					feeCents,
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
