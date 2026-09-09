// StatCard.jsx tests - one figure on a dashboard. The whole reason this component exists as its
// own file rather than being inlined at each call site is the null-renders-as-an-em-dash rule
// (see the component's own header comment), so that rule is what these tests exist to pin.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatCard from "./StatCard";

describe("StatCard", () => {
	it("renders the label and an already-formatted value as given", () => {
		render(<StatCard label="Revenue" value="$1,200.00" />);

		expect(screen.getByText("Revenue")).toBeInTheDocument();
		expect(screen.getByText("$1,200.00")).toBeInTheDocument();
	});

	// THE rule this component exists to enforce. A Staff-role caller gets null for every money
	// field (server/graphql/resolvers/analytics.js), and "$0.00" would be a confident, specific,
	// wrong answer to "how much did the shop make" - an em dash says nothing, which is the truth.
	it("renders a null value as an em dash, never as $0.00 or 0", () => {
		render(<StatCard label="Revenue" value={null} />);

		expect(screen.getByText("—")).toBeInTheDocument();
		expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
		expect(screen.queryByText("0")).not.toBeInTheDocument();
	});

	// A real 0 (an actual zero-dollar figure a caller IS allowed to see) is not the same value as
	// null and must not be swallowed by the same em-dash branch - value == null is deliberately a
	// loose check for null/undefined, not falsiness.
	it("renders a real numeric 0 as 0, not as an em dash", () => {
		render(<StatCard label="New clients" value={0} />);

		expect(screen.getByText("0")).toBeInTheDocument();
		expect(screen.queryByText("—")).not.toBeInTheDocument();
	});

	it("applies the empty-value class only when the value is null", () => {
		const { container: withValue } = render(<StatCard label="Revenue" value="$5.00" />);
		expect(withValue.querySelector(".analyticsStatValueEmpty")).not.toBeInTheDocument();

		const { container: withNull } = render(<StatCard label="Revenue" value={null} />);
		expect(withNull.querySelector(".analyticsStatValueEmpty")).toBeInTheDocument();
	});

	it("shows a subLabel only when one is given", () => {
		const { container: withSub } = render(
			<StatCard label="Avg tip" value="$8.00" subLabel="over 4 tipped sessions" />
		);
		expect(screen.getByText("over 4 tipped sessions")).toBeInTheDocument();

		const { container: withoutSub } = render(<StatCard label="Avg tip" value="$8.00" />);
		expect(withoutSub.querySelector(".analyticsStatSubLabel")).not.toBeInTheDocument();
	});
});
