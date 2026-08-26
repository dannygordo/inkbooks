// EntityListPager.jsx tests. See the component's own header comment for what it is and how it
// differs from its sibling Pager.jsx (components/pagination/Pager.jsx): this one drives an
// offset-only onChange (the caller owns `limit` itself, there's no combined {limit, offset}
// object), reports a count "1,247 clients" rather than a bare range, and its page-size selector is
// entirely optional - passed as onPageSizeChange, omitted to hide it - rather than always present.
//
// Three states this component can be in are each covered on purpose, because they render
// genuinely different markup, not just different text:
//   1. no pageInfo at all -> renders nothing
//   2. everything fits on one page (onFirstPage && !hasMore) -> "count only" markup, no
//      Previous/Next buttons, but the optional size selector still renders if given one
//   3. a real multi-page list -> full range text plus working Previous/Next
//
// Plain presentational component - no router, no Apollo, no AuthContext, just pageInfo/onChange/
// noun/onPageSizeChange props - so no providers are needed to render it.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EntityListPager from "./EntityListPager";

function pageInfo(overrides = {}) {
	return { totalCount: 1247, hasMore: true, limit: 50, offset: 0, ...overrides };
}

describe("no pageInfo", () => {
	it("renders nothing when pageInfo is undefined", () => {
		const { container } = render(<EntityListPager onChange={() => {}} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing when pageInfo is null", () => {
		const { container } = render(<EntityListPager pageInfo={null} onChange={() => {}} />);
		expect(container).toBeEmptyDOMElement();
	});
});

describe("everything fits on one page", () => {
	const ONE_PAGE = pageInfo({ totalCount: 3, hasMore: false, limit: 50, offset: 0 });

	it("renders nothing at all when the list is also empty and there's no size selector", () => {
		const { container } = render(
			<EntityListPager pageInfo={pageInfo({ totalCount: 0, hasMore: false })} onChange={() => {}} />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("still renders a size selector for an empty list, when one was given", () => {
		render(
			<EntityListPager
				pageInfo={pageInfo({ totalCount: 0, hasMore: false })}
				onChange={() => {}}
				onPageSizeChange={() => {}}
			/>,
		);
		expect(screen.getByRole("combobox")).toBeInTheDocument();
	});

	it("shows a plain count with the default noun pluralized, and no Previous/Next buttons", () => {
		render(<EntityListPager pageInfo={ONE_PAGE} onChange={() => {}} />);
		expect(screen.getByText("3 records")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
	});

	it("uses the singular noun for a count of exactly one", () => {
		render(
			<EntityListPager
				pageInfo={pageInfo({ totalCount: 1, hasMore: false })}
				onChange={() => {}}
				noun="client"
			/>,
		);
		expect(screen.getByText("1 client")).toBeInTheDocument();
	});

	it("pluralizes a caller-supplied noun", () => {
		render(
			<EntityListPager pageInfo={ONE_PAGE} onChange={() => {}} noun="client" />,
		);
		expect(screen.getByText("3 clients")).toBeInTheDocument();
	});

	it("still renders the size selector - shrinking the page size is exactly what could turn this into a multi-page list", () => {
		render(
			<EntityListPager pageInfo={ONE_PAGE} onChange={() => {}} onPageSizeChange={() => {}} />,
		);
		expect(screen.getByRole("combobox")).toBeInTheDocument();
	});

	it("omits the size selector entirely when no onPageSizeChange is passed", () => {
		render(<EntityListPager pageInfo={ONE_PAGE} onChange={() => {}} />);
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	});
});

describe("multi-page list", () => {
	it("shows a comma-formatted human range and total", () => {
		render(
			<EntityListPager
				pageInfo={pageInfo({ totalCount: 1247, hasMore: true, limit: 50, offset: 0 })}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByText("1-50 of 1,247 records")).toBeInTheDocument();
	});

	it("shows the correct range for a middle page", () => {
		render(
			<EntityListPager
				pageInfo={pageInfo({ totalCount: 1247, hasMore: true, limit: 50, offset: 100 })}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByText("101-150 of 1,247 records")).toBeInTheDocument();
	});

	it("clamps the last-shown row to totalCount on the final page", () => {
		render(
			<EntityListPager
				pageInfo={pageInfo({ totalCount: 1247, hasMore: false, limit: 50, offset: 1200 })}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByText("1,201-1,247 of 1,247 records")).toBeInTheDocument();
	});

	it("reads the current page size off pageInfo.limit, not a separate prop", () => {
		render(
			<EntityListPager
				pageInfo={pageInfo({ limit: 25 })}
				onChange={() => {}}
				onPageSizeChange={() => {}}
			/>,
		);
		expect(screen.getByRole("combobox")).toHaveValue("25");
	});

	it("disables Previous and enables Next on the first page", () => {
		render(<EntityListPager pageInfo={pageInfo({ offset: 0, hasMore: true })} onChange={() => {}} />);
		expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
	});

	it("enables Previous and disables Next on the last page", () => {
		render(
			<EntityListPager
				pageInfo={pageInfo({ totalCount: 1247, limit: 50, offset: 1200, hasMore: false })}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
	});

	it("calls onChange with the next offset when Next is clicked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<EntityListPager
				pageInfo={pageInfo({ totalCount: 1247, limit: 50, offset: 0, hasMore: true })}
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(onChange).toHaveBeenCalledWith(50);
	});

	it("calls onChange with the previous offset when Previous is clicked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<EntityListPager
				pageInfo={pageInfo({ totalCount: 1247, limit: 50, offset: 100, hasMore: true })}
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Previous" }));

		expect(onChange).toHaveBeenCalledWith(50);
	});

	it("clamps the previous offset at 0 rather than going negative", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<EntityListPager
				pageInfo={pageInfo({ totalCount: 60, limit: 50, offset: 30, hasMore: true })}
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Previous" }));

		expect(onChange).toHaveBeenCalledWith(0);
	});

	it("calls onPageSizeChange with the newly chosen limit when the selector is used", async () => {
		const user = userEvent.setup();
		const onPageSizeChange = vi.fn();
		render(
			<EntityListPager
				pageInfo={pageInfo({ limit: 50 })}
				onChange={() => {}}
				onPageSizeChange={onPageSizeChange}
			/>,
		);

		await user.selectOptions(screen.getByRole("combobox"), "25");

		expect(onPageSizeChange).toHaveBeenCalledWith(25);
	});

	it("honors a caller-supplied pageSizeOptions list", () => {
		render(
			<EntityListPager
				pageInfo={pageInfo({ limit: 20 })}
				onChange={() => {}}
				onPageSizeChange={() => {}}
				pageSizeOptions={[20, 40]}
			/>,
		);
		expect(screen.getAllByRole("option").map((o) => o.value)).toEqual(["20", "40"]);
	});
});
