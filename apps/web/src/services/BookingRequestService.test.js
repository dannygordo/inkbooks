// BookingRequestService.js tests, following the same convention ClientService.test.js already
// established: a "Service" file here is an IIFE (plus, in this file's case, a few top-level named
// exports alongside it) exporting a mix of React-hook factories wrapping useQuery around a gql
// document, and raw gql documents meant to be passed directly to useMutation by a calling
// component - there is almost no pure logic to unit-test in isolation, so every export below is
// exercised through a tiny throwaway harness component rendered under MockedProvider, built from
// the REAL exported gql document (BookingRequestService happens to export every document it
// defines, so no field-for-field reconstruction is needed anywhere in this file).
//
// Written with React.createElement rather than JSX: this codebase's .js files (as opposed to
// .jsx) cannot contain literal JSX at all under this project's Vite/oxc pipeline, and this file
// stays a .js to match its sibling BookingRequestService.js.
//
// Note on scope: BookingRequestService.js's own header comment says this is the SHARED
// gql-document service for the createBookingRequest -> convertBookingRequest pipeline, used by the
// public intake form, the artist's dashboard, and AppointmentWizard.jsx's "Consult" path. It is
// unrelated to FormService.js's separate handling of a shop's own configurable "booking_request"
// intake FORM (fields/layout) - that is a different feature entirely and out of scope here. This
// file tests only what BookingRequestService.js itself exports.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useQuery, useMutation } from "@apollo/client";
import BookingRequestService, {
	GET_PENDING_BOOKING_REQUEST_COUNT,
	BOOKING_BADGE_REFETCH,
	usePendingBookingRequestCount,
} from "./BookingRequestService";

// ---- generic harnesses -----------------------------------------------------------------------
// (same shapes as ClientService.test.js's QueryHarness/MutationHarness - kept local rather than
// shared across test files so each Service's test suite stays self-contained.)

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

// ---- GET_PENDING_BOOKING_REQUEST_COUNT (raw document) ------------------------------------------

describe("BookingRequestService.GET_PENDING_BOOKING_REQUEST_COUNT (raw document)", () => {
	it("works standalone via useQuery, the way a caller reaching for the raw document would use it", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => useQuery(GET_PENDING_BOOKING_REQUEST_COUNT),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: GET_PENDING_BOOKING_REQUEST_COUNT },
							result: { data: { getPendingBookingRequestCount: 3 } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("3");
	});
});

// ---- BOOKING_BADGE_REFETCH (plain constant, not a gql document) --------------------------------

describe("BookingRequestService.BOOKING_BADGE_REFETCH", () => {
	// Apollo's refetchQueries matches by OPERATION NAME (a string), not by document reference - so
	// this constant has to be the literal operation names other queries in this codebase declare,
	// not e.g. the gql documents themselves. A typo here is not an error, just a badge that never
	// refreshes, which is exactly the failure mode this file's own header comment describes.
	it("names the exact operations whose completion should refresh the booking badge", () => {
		expect(BOOKING_BADGE_REFETCH).toEqual(["GetPendingBookingRequestCount", "GetUnreadMessageCount"]);
	});
});

// ---- usePendingBookingRequestCount --------------------------------------------------------------

describe("BookingRequestService.usePendingBookingRequestCount", () => {
	it("resolves with the pending count via GET_PENDING_BOOKING_REQUEST_COUNT", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => usePendingBookingRequestCount() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: GET_PENDING_BOOKING_REQUEST_COUNT },
							result: { data: { getPendingBookingRequestCount: 7 } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("7");
	});

	it("takes no arguments - it always fires the same fixed query with no variables", async () => {
		// Calling it with a stray argument (as if a caller mistakenly tried to parameterize it)
		// must not change what gets requested - _usePendingBookingRequestCount ignores its
		// arguments entirely, unlike e.g. ClientService's updateClient which at least takes one.
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => usePendingBookingRequestCount("ignored-arg"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: GET_PENDING_BOOKING_REQUEST_COUNT },
							result: { data: { getPendingBookingRequestCount: 0 } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("0");
	});
});

// ---- CREATE_BOOKING_REQUEST_MUTATION ------------------------------------------------------------

describe("BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION", () => {
	it("creates a booking request and returns its id and status", async () => {
		const user = userEvent.setup();
		const bookingRequestInput = {
			shopId: "shop-1",
			name: "Gendry Baratheon",
			email: "gendry@example.com",
			message: "Looking for a half sleeve consult.",
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION,
				variables: { bookingRequestInput },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION,
								variables: { bookingRequestInput },
							},
							result: {
								data: {
									createBookingRequest: {
										__typename: "BookingRequest",
										id: "req-1",
										status: "pending",
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
		expect(result).toHaveTextContent("req-1");
		expect(result).toHaveTextContent("pending");
	});
});

// ---- CONVERT_BOOKING_REQUEST_MUTATION -----------------------------------------------------------

describe("BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION", () => {
	it("converts a booking request into a session, returning the resulting appointment", async () => {
		const user = userEvent.setup();
		const variables = {
			bookingRequestId: "req-1",
			outcome: "scheduled",
			appointmentInput: { appointmentDate: "2026-09-01T12:00:00.000Z", appointmentType: "session" },
			projectTitle: "Half sleeve - koi",
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION,
								variables,
							},
							result: {
								data: {
									convertBookingRequest: {
										__typename: "BookingRequest",
										id: "req-1",
										status: "converted",
										resultingAppointmentId: "appt-1",
										resultingAppointment: {
											__typename: "Appointment",
											id: "appt-1",
											projectId: "project-1",
										},
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
		expect(result).toHaveTextContent("converted");
		expect(result).toHaveTextContent("appt-1");
		expect(result).toHaveTextContent("project-1");
	});

	// appointmentInput and projectTitle are both optional in the schema (AppointmentInput,
	// String with no `!`) - ConsultDetail.jsx's "Convert to Session" call and a plain
	// "mark as no outcome yet" call don't necessarily have either. Variables still have to be
	// sent explicitly as undefined for the two optional args, matching how MutationHarness (and
	// any real caller spreading its own local state into `variables`) would build the call.
	it("still works when the optional appointmentInput and projectTitle are omitted", async () => {
		const user = userEvent.setup();
		const variables = {
			bookingRequestId: "req-2",
			outcome: "declined",
			appointmentInput: undefined,
			projectTitle: undefined,
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION,
								variables,
							},
							result: {
								data: {
									convertBookingRequest: {
										__typename: "BookingRequest",
										id: "req-2",
										status: "declined",
										resultingAppointmentId: null,
										resultingAppointment: null,
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
		expect(await screen.findByTestId("result")).toHaveTextContent("declined");
	});
});
