// ShopCutRateService.js tests. Unlike ClientService.js, this file has no IIFE wrapper at all -
// GET_SHOP_CUT_RATES and SET_SHOP_CUT_RATE are raw exported gql documents, and useShopCutRates /
// useSetShopCutRate are thin named-export hook wrappers around them (useQuery with a skip guard,
// and useMutation with a refetchQueries list, respectively). Every export is exercised through the
// same tiny harness-under-MockedProvider pattern ClientService.test.js and AccountService.test.js
// already use, built from the REAL exported gql documents (never a hand-copied query string).
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment - this
// codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this project's
// Vite/oxc pipeline, and this file stays a .js to match its sibling ShopCutRateService.js.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation } from "@apollo/client";
import { print } from "graphql";
import {
	GET_SHOP_CUT_RATES,
	SET_SHOP_CUT_RATE,
	useShopCutRates,
	useSetShopCutRate,
} from "./ShopCutRateService";

// ---- generic harnesses -----------------------------------------------------------------------

// Renders whatever a query-returning hook function produces. `hookFn` is called with no args and
// must itself close over any variables it needs - same pattern as ClientService.test.js's
// QueryHarness.
function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		// Deliberately generic: these tests only need to know THAT a request errored (e.g. no mock
		// matched, proving a network call was actually attempted), not the message text.
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

// Renders a button that fires a mutation with fixed variables, and the onCompleted payload once it
// lands - same pattern as ClientService.test.js's MutationHarness, but built around the
// useSetShopCutRate hook itself (rather than a bare useMutation(document)) so its refetchQueries
// option is exercised too.
function SetShopCutRateHarness({ variables }) {
	const [result, setResult] = React.useState(null);
	// useSetShopCutRate takes no arguments of its own (its options are fixed internally to just
	// refetchQueries) - onCompleted is instead passed per-call to the mutate function itself, which
	// Apollo's useMutation supports just as well as passing it at hook-setup time.
	const [setShopCutRate] = useSetShopCutRate();
	return React.createElement(
		"div",
		null,
		React.createElement("button", { onClick: () => setShopCutRate({ variables, onCompleted: setResult }) }, "go"),
		result && React.createElement("div", { "data-testid": "result" }, JSON.stringify(result)),
	);
}

async function clickGo(user) {
	await user.click(screen.getByRole("button", { name: "go" }));
}

function rate(overrides = {}) {
	return {
		__typename: "ShopCutRate",
		id: "rate-1",
		artistId: "artist-1",
		shopId: "shop-1",
		percent: 40,
		effectiveFrom: "2026-01-01T00:00:00.000Z",
		setByUserId: "user-1",
		note: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// ---- GET_SHOP_CUT_RATES / useShopCutRates --------------------------------------------------------

describe("ShopCutRateService.useShopCutRates", () => {
	it("resolves with the artist's shop cut rate history", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => useShopCutRates("artist-1", "shop-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: GET_SHOP_CUT_RATES,
								variables: { artistId: "artist-1", shopId: "shop-1" },
							},
							result: { data: { getShopCutRates: [rate()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"percent":40');
		expect(result).toHaveTextContent("2026-01-01T00:00:00.000Z");
	});

	// skip: !artistId || !shopId - either half missing must never fire a request at all.
	it("skips the query when artistId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => useShopCutRates(undefined, "shop-1"),
			});
		}
		// Zero mocks registered: if this fired a real request it would blow up with "no matching
		// mock" and surface as an error, which the assertion below rules out.
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("skips the query when shopId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => useShopCutRates("artist-1", undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("skips the query when both artistId and shopId are missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => useShopCutRates(undefined, undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("still fires the query when both artistId and shopId are truthy, even for unusual falsy-looking ids", async () => {
		// "0" is a truthy string, so !artistId is false - this pins down that the skip guard checks
		// truthiness, not e.g. an explicit null/undefined check, matching ClientService's equivalent
		// !clientId behavior.
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => useShopCutRates("0", "shop-1"),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		expect(await screen.findByTestId("error")).toBeInTheDocument();
		spy.mockRestore();
	});
});

// ---- SET_SHOP_CUT_RATE / useSetShopCutRate -------------------------------------------------------

describe("ShopCutRateService.useSetShopCutRate", () => {
	it("sets a new rate and the created row flows back through onCompleted", async () => {
		const user = userEvent.setup();
		const variables = {
			artistId: "artist-1",
			shopId: "shop-1",
			percent: 50,
			effectiveFrom: "2026-08-01T00:00:00.000Z",
			note: "Renegotiated",
		};

		function Harness() {
			return React.createElement(SetShopCutRateHarness, { variables });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: SET_SHOP_CUT_RATE, variables },
							result: {
								data: {
									setShopCutRate: rate({
										id: "rate-2",
										percent: 50,
										effectiveFrom: "2026-08-01T00:00:00.000Z",
										note: "Renegotiated",
									}),
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
		expect(result).toHaveTextContent('"percent":50');
		expect(result).toHaveTextContent("Renegotiated");
	});

	// effectiveFrom and note are declared as optional (DateTime / String, no `!`) - confirms the
	// mutation document is usable with them omitted entirely, the way a caller recording a rate
	// with no note would call it.
	it("is usable with effectiveFrom and note omitted", async () => {
		const user = userEvent.setup();
		const variables = { artistId: "artist-1", shopId: "shop-1", percent: 25 };

		function Harness() {
			return React.createElement(SetShopCutRateHarness, { variables });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: SET_SHOP_CUT_RATE, variables },
							result: {
								data: {
									setShopCutRate: rate({ id: "rate-3", percent: 25, effectiveFrom: null, note: null }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"percent":25');
	});

	// SET_SHOP_CUT_RATE is also directly usable via a plain useMutation(document), the way a
	// caller reaching for the raw document instead of the wrapped hook would use it.
	it("SET_SHOP_CUT_RATE works standalone via useMutation", async () => {
		const user = userEvent.setup();
		const variables = { artistId: "artist-1", shopId: "shop-1", percent: 60 };

		function RawHarness() {
			const [result, setResult] = React.useState(null);
			const [mutate] = useMutation(SET_SHOP_CUT_RATE, { onCompleted: setResult });
			return React.createElement(
				"div",
				null,
				React.createElement("button", { onClick: () => mutate({ variables }) }, "go"),
				result && React.createElement("div", { "data-testid": "result" }, JSON.stringify(result)),
			);
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: SET_SHOP_CUT_RATE, variables },
							result: { data: { setShopCutRate: rate({ id: "rate-4", percent: 60 }) } },
						},
					],
				},
				React.createElement(RawHarness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"percent":60');
	});
});

// ---- GET_SHOP_CUT_RATES field shape ---------------------------------------------------------------

describe("ShopCutRateService field selection", () => {
	// Locks in that the shared SHOP_CUT_RATE_FIELDS fragment string is spliced into both documents
	// identically - a query/mutation selecting different fields for the "same" record would be a
	// silent drift between what a list shows and what a save immediately reflects.
	it("selects the same fields on both GET_SHOP_CUT_RATES and SET_SHOP_CUT_RATE", () => {
		const queryPrinted = print(GET_SHOP_CUT_RATES);
		const mutationPrinted = print(SET_SHOP_CUT_RATE);
		for (const field of ["percent", "effectiveFrom", "setByUserId", "note", "createdAt", "artistId", "shopId"]) {
			expect(queryPrinted).toContain(field);
			expect(mutationPrinted).toContain(field);
		}
	});
});
