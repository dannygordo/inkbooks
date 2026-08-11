// SquarePricingPanel.jsx tests. The panel converts between what a person types (9.4%, $6.00) and
// what the server stores (940 basis points, 600 cents), and it is the only place in the client
// that does - so most of these are about that boundary.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import SquarePricingPanel from "./SquarePricingPanel";
import ShopService from "../../services/ShopService";

// The real documents, imported from the service - a hand-written near-copy stops matching after
// one field of drift and fails as a network error that looks like a component bug.
const pricingMock = (settings) => ({
	request: { query: ShopService.MY_SQUARE_PRICING },
	result: {
		data: {
			getMySquarePricingSettings: { __typename: "SquarePricingSettings", ...settings },
		},
	},
});

const INDEPENDENT = {
	source: "artist",
	ownerName: null,
	taxRateBasisPoints: 940,
	squareFeeOffsetCents: 600,
	canEdit: true,
};

const UNCONFIGURED = { ...INDEPENDENT, taxRateBasisPoints: 0, squareFeeOffsetCents: 0 };

const SHOP_READ_ONLY = {
	source: "shop",
	ownerName: "Iron Anchor Tattoo",
	taxRateBasisPoints: 940,
	squareFeeOffsetCents: 600,
	canEdit: false,
};

function renderPanel({ settings, extraMocks = [] } = {}) {
	render(
		<MockedProvider mocks={[pricingMock(settings), ...extraMocks]}>
			<SquarePricingPanel />
		</MockedProvider>,
	);
}

describe("units at the boundary", () => {
	// 940 basis points is 9.4%, and nobody should ever see "940" in a tax field.
	it("shows basis points as a percentage", async () => {
		renderPanel({ settings: INDEPENDENT });

		expect(await screen.findByLabelText(/Sales tax/)).toHaveValue(9.4);
	});

	it("shows the offset in dollars, not cents", async () => {
		renderPanel({ settings: INDEPENDENT });

		expect(await screen.findByLabelText(/processing offset/)).toHaveValue(6);
	});

	// The offset is PER HOUR and scales with the session, which a single figure does not convey.
	it("works an example so the per-hour part is visible", async () => {
		renderPanel({ settings: INDEPENDENT });

		expect(await screen.findByText(/three-hour session/)).toBeInTheDocument();
		expect(screen.getByText(/\$18\.00/)).toBeInTheDocument();
	});

	it("sends a typed percentage back as basis points", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ShopService.UPDATE_SQUARE_PRICING,
				variables: { taxRateBasisPoints: 825, squareFeeOffsetCents: 600 },
			},
			result: {
				data: {
					updateSquarePricingSettings: {
						__typename: "SquarePricingSettings",
						...INDEPENDENT,
						taxRateBasisPoints: 825,
					},
				},
			},
		};
		renderPanel({ settings: INDEPENDENT, extraMocks: [updateMock, pricingMock(INDEPENDENT)] });

		const field = await screen.findByLabelText(/Sales tax/);
		await user.clear(field);
		await user.type(field, "8.25");
		await user.click(screen.getByRole("button", { name: "Save" }));

		// MockedProvider matches on variables, so reaching "Saved" IS the assertion that 8.25
		// was sent as 825.
		expect(await screen.findByText("Saved")).toBeInTheDocument();
	});
});

describe("an unconfigured rate", () => {
	// A zero rate is a real configuration and a plausible mistake, and the difference shows up on
	// every ticket. This is the state every shop was silently in before this panel existed.
	it("says plainly that no tax is being collected", async () => {
		renderPanel({ settings: UNCONFIGURED });

		expect(
			await screen.findByText(/No sales tax is being collected/),
		).toBeInTheDocument();
	});

	it("says nothing of the sort once a rate is set", async () => {
		renderPanel({ settings: INDEPENDENT });

		await screen.findByLabelText(/Sales tax/);
		expect(screen.queryByText(/No sales tax is being collected/)).not.toBeInTheDocument();
	});

	// No offset is an ordinary choice, not a warning - it means the artist absorbs card fees.
	it("does not warn about a zero offset", async () => {
		renderPanel({ settings: UNCONFIGURED });

		await screen.findByLabelText(/processing offset/);
		expect(screen.queryByText(/three-hour session/)).not.toBeInTheDocument();
	});
});

describe("an artist whose shop sets the rate", () => {
	it("names the shop and disables the fields", async () => {
		renderPanel({ settings: SHOP_READ_ONLY });

		expect(await screen.findByText(/Iron Anchor Tattoo/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Sales tax/)).toBeDisabled();
		expect(screen.getByLabelText(/processing offset/)).toBeDisabled();
	});

	// A save button that always fails is worse than none - the server refuses this caller.
	it("offers no save button", async () => {
		renderPanel({ settings: SHOP_READ_ONLY });

		await screen.findByLabelText(/Sales tax/);
		expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
		expect(screen.getByText(/Only a shop admin can change these/)).toBeInTheDocument();
	});

	// They still see the figures, because these apply to every charge they take.
	it("still shows them what applies to their charges", async () => {
		renderPanel({ settings: SHOP_READ_ONLY });

		expect(await screen.findByLabelText(/Sales tax/)).toHaveValue(9.4);
	});
});
