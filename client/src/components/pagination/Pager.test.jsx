// Pager.jsx tests. See the component's own header comment for what it's for and why it's a single
// shared component: it turns a server {totalCount, limit, offset} pageInfo into a "Showing X-Y of
// Z" range plus Previous/Next controls, so every list backed by that shape gets the same counting
// rather than each screen reimplementing its own off-by-one-prone arithmetic.
//
// Coverage here leans hard on the boundary arithmetic the header comment calls out by name:
//   - `last` on a partial final page (offset+limit would overshoot totalCount)
//   - Previous/Next disabled state at each end
//   - the offset clamp on Previous, which exists specifically so a stale/changed limit can never
//     hand the caller a negative offset
//   - the page-size selector staying visible even when Previous/Next hide because everything
//     already fits on one page (shrinking the page size is exactly what would make it not fit)
//
// Plain presentational component - no router, no Apollo, no AuthContext, just pageInfo/onChange
// props - so no providers are needed to render it.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pager from "./Pager";

function pageInfo(overrides = {}) {
	return { totalCount: 25, limit: 10, offset: 0, ...overrides };
}

describe("empty/absent pageInfo", () => {
	it("renders nothing when pageInfo is null", () => {
		const { container } = render(<Pager pageInfo={null} onChange={() => {}} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing when pageInfo is undefined", () => {
		const { container } = render(<Pager onChange={() => {}} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing when totalCount is 0, even with a size selector's worth of options", () => {
		const { container } = render(
			<Pager pageInfo={pageInfo({ totalCount: 0 })} onChange={() => {}} />,
		);
		expect(container).toBeEmptyDOMElement();
	});
});

describe("range text", () => {
	it("shows the first page's range", () => {
		render(<Pager pageInfo={pageInfo({ totalCount: 25, limit: 10, offset: 0 })} onChange={() => {}} />);
		expect(screen.getByText("Showing 1–10 of 25")).toBeInTheDocument();
	});

	it("shows a middle page's range", () => {
		render(<Pager pageInfo={pageInfo({ totalCount: 25, limit: 10, offset: 10 })} onChange={() => {}} />);
		expect(screen.getByText("Showing 11–20 of 25")).toBeInTheDocument();
	});

	it("clamps the last-shown row to totalCount on a partial final page", () => {
		// offset(20) + limit(10) = 30, which overshoots the 25 rows that actually exist - `last`
		// has to be min(offset+limit, totalCount), not the raw arithmetic.
		render(<Pager pageInfo={pageInfo({ totalCount: 25, limit: 10, offset: 20 })} onChange={() => {}} />);
		expect(screen.getByText("Showing 21–25 of 25")).toBeInTheDocument();
	});
});

describe("page size selector", () => {
	it("lists the default 10/25/50 options and selects the current limit", () => {
		render(<Pager pageInfo={pageInfo({ limit: 25 })} onChange={() => {}} />);
		const select = screen.getByRole("combobox");
		expect(select).toHaveValue("25");
		expect(screen.getAllByRole("option").map((o) => o.value)).toEqual(["10", "25", "50"]);
	});

	it("honors a caller-supplied pageSizeOptions list", () => {
		render(
			<Pager
				pageInfo={pageInfo({ limit: 5 })}
				onChange={() => {}}
				pageSizeOptions={[5, 15]}
			/>,
		);
		expect(screen.getAllByRole("option").map((o) => o.value)).toEqual(["5", "15"]);
	});

	it("calls onChange with the new limit AND offset reset to 0", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Pager pageInfo={pageInfo({ totalCount: 100, limit: 10, offset: 30 })} onChange={onChange} />);

		await user.selectOptions(screen.getByRole("combobox"), "50");

		expect(onChange).toHaveBeenCalledWith({ limit: 50, offset: 0 });
	});

	it("stays visible even when everything already fits on one page", () => {
		// Shrinking the page size is exactly the action that would turn this one-page list into a
		// multi-page one, so the selector can't hide itself the one time someone might reach for it.
		render(<Pager pageInfo={pageInfo({ totalCount: 5, limit: 10, offset: 0 })} onChange={() => {}} />);
		expect(screen.getByRole("combobox")).toBeInTheDocument();
	});
});

describe("Previous/Next buttons", () => {
	it("hides the Previous/Next row entirely when everything fits on one page", () => {
		render(<Pager pageInfo={pageInfo({ totalCount: 5, limit: 10, offset: 0 })} onChange={() => {}} />);
		expect(screen.queryByRole("button", { name: /Previous/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Next/i })).not.toBeInTheDocument();
	});

	it("disables Previous and enables Next on the first page of a multi-page list", () => {
		render(<Pager pageInfo={pageInfo({ totalCount: 25, limit: 10, offset: 0 })} onChange={() => {}} />);
		expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
	});

	it("enables Previous and disables Next on the last page of a multi-page list", () => {
		render(<Pager pageInfo={pageInfo({ totalCount: 25, limit: 10, offset: 20 })} onChange={() => {}} />);
		expect(screen.getByRole("button", { name: /Previous/i })).toBeEnabled();
		expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
	});

	it("calls onChange with the next page's offset when Next is clicked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Pager pageInfo={pageInfo({ totalCount: 25, limit: 10, offset: 0 })} onChange={onChange} />);

		await user.click(screen.getByRole("button", { name: /Next/i }));

		expect(onChange).toHaveBeenCalledWith({ limit: 10, offset: 10 });
	});

	it("calls onChange with the previous page's offset when Previous is clicked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Pager pageInfo={pageInfo({ totalCount: 25, limit: 10, offset: 20 })} onChange={onChange} />);

		await user.click(screen.getByRole("button", { name: /Previous/i }));

		expect(onChange).toHaveBeenCalledWith({ limit: 10, offset: 10 });
	});

	it("clamps the offset at 0 on Previous rather than going negative", () => {
		// offset(5) < limit(10) but offset > 0, so hasPrev is true and the button is enabled - the
		// naive `offset - limit` would be -5, which the server rejects outright (utils/pagination.js).
		const onChange = vi.fn();
		render(<Pager pageInfo={pageInfo({ totalCount: 15, limit: 10, offset: 5 })} onChange={onChange} />);

		const previous = screen.getByRole("button", { name: /Previous/i });
		expect(previous).toBeEnabled();
		previous.click();

		expect(onChange).toHaveBeenCalledWith({ limit: 10, offset: 0 });
	});
});
