// DepositService.js tests, following the same convention ClientService.test.js already
// established: a "Service" file here is an IIFE exporting a mix of a React-hook factory wrapping
// useQuery around a gql document, and raw gql documents meant to be passed directly to
// useMutation by a calling component - there is almost no pure logic to unit-test in isolation, so
// every export below is exercised through a tiny throwaway harness component rendered under
// MockedProvider, built from the REAL exported gql document (DepositService exports every
// document it defines directly, so no field-for-field reconstruction is needed anywhere in this
// file).
//
// Written with React.createElement rather than JSX: this codebase's .js files (as opposed to
// .jsx) cannot contain literal JSX at all under this project's Vite/oxc pipeline, and this file
// stays a .js to match its sibling DepositService.js.
//
// One thing specific to this file: it exports its IIFE result BOTH as a named export
// (`export const DepositService = ...`) AND as the default export (`export default DepositService`)
// - unlike every other Service file in this codebase, which is default-only. A short test below
// locks in that both import forms really do resolve to the same object, since a future refactor
// splitting them apart would be an easy, silent break for whichever callers use the named form.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation, useQuery } from "@apollo/client";
import DepositService, { DepositService as NamedDepositService } from "./DepositService";

// ---- generic harnesses -----------------------------------------------------------------------

function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

function MutationHarness({ document, variables }) {
	const [result, setResult] = React.useState(null);
	const [mutate] = useMutation(document, { onCompleted: setResult });
	return React.createElement(
		"div",
		null,
		React.createElement("button", { onClick: () => mutate({ variables }) }, "go"),
		result && React.createElement("div", { "data-testid": "result" }, JSON.stringify(result)),
	);
}

async function clickGo(user) {
	await user.click(screen.getByRole("button", { name: "go" }));
}

// ---- dual export sanity check ------------------------------------------------------------------

describe("DepositService's default and named exports", () => {
	it("are the exact same object", () => {
		expect(DepositService).toBe(NamedDepositService);
	});
});

// ---- getAvailableDeposits / FETCH_AVAILABLE_DEPOSITS -------------------------------------------

describe("DepositService.getAvailableDeposits", () => {
	it("resolves with the appointment's available deposits", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => DepositService.getAvailableDeposits("appt-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: DepositService.FETCH_AVAILABLE_DEPOSITS,
								variables: { appointmentId: "appt-1" },
							},
							result: {
								data: {
									getAvailableDeposits: [
										{
											__typename: "Appointment",
											id: "appt-0",
											title: "Consult",
											appointmentType: "consult",
											appointmentDate: "2026-07-01T12:00:00.000Z",
											depositCents: 5000,
											depositStatus: "collected",
											depositCollectedAt: "2026-07-01T12:30:00.000Z",
										},
									],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Consult");
		expect(result).toHaveTextContent("5000");
	});

	// No `skip` argument passed at all beyond the default {} - falsy appointmentId alone must
	// still skip.
	it("skips when appointmentId is falsy, with no request and no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => DepositService.getAvailableDeposits(null),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// The skip formula is `!appointmentId || options.skip` - an explicit options.skip:true adds
	// an ADDITIONAL reason to skip even when appointmentId is present and valid.
	it("also skips when a valid appointmentId is given but options.skip is explicitly true", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => DepositService.getAvailableDeposits("appt-1", { skip: true }),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// The reverse does NOT hold: unlike BoothRentService's getBoothRentPlans/getBoothRentCharges
	// (where `...options` is spread AFTER the computed skip/fetchPolicy and so can override them),
	// here `...options` is spread BEFORE `skip:` and `fetchPolicy:` in the object literal passed to
	// useQuery - so a caller cannot force skip:false back on through options once appointmentId is
	// falsy. `!appointmentId` on its own is already `true`, and `true || options.skip` is `true`
	// regardless of what options.skip says.
	it("cannot be forced to fire via options.skip:false when appointmentId is falsy", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => DepositService.getAvailableDeposits(null, { skip: false }),
			});
		}
		// Zero mocks: if the skip guard had actually been overridden, this would fire a real
		// request with no matching mock and surface as an error - it doesn't.
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("passes other options (e.g. notifyOnNetworkStatusChange) through to useQuery untouched", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					DepositService.getAvailableDeposits("appt-1", { notifyOnNetworkStatusChange: true }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: DepositService.FETCH_AVAILABLE_DEPOSITS,
								variables: { appointmentId: "appt-1" },
							},
							result: { data: { getAvailableDeposits: [] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("[]");
	});
});

describe("DepositService.FETCH_AVAILABLE_DEPOSITS (raw document)", () => {
	it("works standalone via useQuery, the same document _getAvailableDeposits runs internally", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(DepositService.FETCH_AVAILABLE_DEPOSITS, {
						variables: { appointmentId: "appt-1" },
					}),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: DepositService.FETCH_AVAILABLE_DEPOSITS,
								variables: { appointmentId: "appt-1" },
							},
							result: { data: { getAvailableDeposits: [] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("[]");
	});
});

// ---- RECORD_DEPOSIT -----------------------------------------------------------------------------

describe("DepositService.RECORD_DEPOSIT", () => {
	it("records a deposit and returns the fields that change as a side effect", async () => {
		const user = userEvent.setup();
		const variables = {
			appointmentId: "appt-1",
			depositCents: 5000,
			paymentMethod: "cash",
			squarePaymentId: undefined,
			pending: undefined,
		};
		function Harness() {
			return React.createElement(MutationHarness, {
				document: DepositService.RECORD_DEPOSIT,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: DepositService.RECORD_DEPOSIT, variables },
							result: {
								data: {
									recordDeposit: {
										__typename: "Appointment",
										id: "appt-1",
										depositCents: 5000,
										depositStatus: "collected",
										depositCollectedAt: "2026-08-21T00:00:00.000Z",
										depositPaymentMethod: "cash",
										depositSquarePaymentId: null,
										subtotalCents: 20000,
										totalCents: 15000,
										shopCutCents: 6000,
										shopCutStatus: "pending",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("collected");
		// The header comment's whole point: applying/recording a deposit rewrites totalCents AND
		// the shop cut together, so both must actually be selected back.
		expect(result).toHaveTextContent('"totalCents":15000');
		expect(result).toHaveTextContent('"shopCutCents":6000');
	});

	// `pending: true` writes the agreed amount with no money actually taken yet, per the source
	// file's own comment on this mutation (the card-charge path uses this).
	it("supports the pending (card-charge-quote) path with pending:true and a squarePaymentId", async () => {
		const user = userEvent.setup();
		const variables = {
			appointmentId: "appt-1",
			depositCents: 7500,
			paymentMethod: "card",
			squarePaymentId: "sq-payment-1",
			pending: true,
		};
		function Harness() {
			return React.createElement(MutationHarness, {
				document: DepositService.RECORD_DEPOSIT,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: DepositService.RECORD_DEPOSIT, variables },
							result: {
								data: {
									recordDeposit: {
										__typename: "Appointment",
										id: "appt-1",
										depositCents: 7500,
										depositStatus: "pending",
										depositCollectedAt: null,
										depositPaymentMethod: "card",
										depositSquarePaymentId: "sq-payment-1",
										subtotalCents: 20000,
										totalCents: 12500,
										shopCutCents: 5000,
										shopCutStatus: "pending",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"depositStatus":"pending"');
		expect(result).toHaveTextContent("sq-payment-1");
	});
});

// ---- APPLY_DEPOSIT -------------------------------------------------------------------------------

describe("DepositService.APPLY_DEPOSIT", () => {
	it("applies a deposit from one appointment to another and returns the target's updated totals", async () => {
		const user = userEvent.setup();
		const variables = { depositAppointmentId: "appt-consult", targetAppointmentId: "appt-session" };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: DepositService.APPLY_DEPOSIT,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: DepositService.APPLY_DEPOSIT, variables },
							result: {
								data: {
									applyDeposit: {
										__typename: "Appointment",
										id: "appt-session",
										depositCreditCents: 5000,
										depositCreditFromAppointmentId: "appt-consult",
										subtotalCents: 20000,
										totalCents: 15000,
										shopCutCents: 6000,
										shopCutPercentApplied: 40,
										shopCutStatus: "pending",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"depositCreditCents":5000');
		expect(result).toHaveTextContent('"depositCreditFromAppointmentId":"appt-consult"');
		// Same point as RECORD_DEPOSIT above: the reduced totalCents AND the shop cut that follows
		// it (see server/utils/shop-cut.js per the header comment) both have to come back together.
		expect(result).toHaveTextContent('"totalCents":15000');
		expect(result).toHaveTextContent('"shopCutCents":6000');
	});
});
