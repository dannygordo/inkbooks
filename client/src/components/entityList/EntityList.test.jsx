// EntityList.jsx tests. This is the generic, prop-driven list used by Clients.jsx, Staff.jsx,
// Artists.jsx, Shops.jsx and others (see EntityList.jsx's own header comment for why lists replaced
// the old card grid). No GraphQL, no AuthContext - the component only reads its own props - but it
// does call useNavigate() internally on a row click, so tests exercise a real MemoryRouter with a
// second route as a navigation probe rather than mocking react-router-dom, matching the pattern
// Project.test.jsx and Clients.test.jsx already use for the same reason.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import EntityList from "./EntityList";
import { tagColorRowStyle } from "../../utils/tagColor";

function DetailProbe() {
	const { entityId } = useParams();
	return <div data-testid="navigated">Detail page for {entityId}</div>;
}

function renderList(props) {
	return render(
		<MemoryRouter initialEntries={["/list"]}>
			<Routes>
				<Route path="/list" element={<EntityList {...props} />} />
				<Route path="/detail/:entityId" element={<DetailProbe />} />
			</Routes>
		</MemoryRouter>,
	);
}

const COLUMNS = [
	{ key: "email", label: "Email", width: "220px" },
	{ key: "phone", label: "Phone" }, // no width - exercises the "160px" fallback
];

function item(overrides = {}) {
	return {
		key: "row-1",
		primary: "Arya Stark",
		secondary: "arya@example.com",
		values: { email: "arya@example.com", phone: "5551234567" },
		...overrides,
	};
}

describe("empty state", () => {
	it("shows the default empty message when items is an empty array", () => {
		renderList({ columns: COLUMNS, items: [] });
		expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
	});

	it("shows a caller-supplied emptyMessage", () => {
		renderList({ columns: COLUMNS, items: [], emptyMessage: "No clients yet." });
		expect(screen.getByText("No clients yet.")).toBeInTheDocument();
		expect(screen.queryByText("Nothing here yet.")).not.toBeInTheDocument();
	});

	it("shows the empty state when items is undefined", () => {
		renderList({ columns: COLUMNS });
		expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
	});

	it("shows the empty state when items is null", () => {
		renderList({ columns: COLUMNS, items: null });
		expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
	});

	it("renders no header or rows in the empty state", () => {
		const { container } = renderList({ columns: COLUMNS, items: [] });
		expect(container.querySelector(".entityListHeader")).toBeNull();
		expect(container.querySelector(".entityRow")).toBeNull();
	});
});

describe("header", () => {
	it("renders one header cell per declared column, labelled correctly", () => {
		renderList({ columns: COLUMNS, items: [item()] });
		const header = document.querySelector(".entityListHeader");
		const cells = within(header).getAllByText((content, el) =>
			el.classList.contains("entityHeaderCell"),
		);
		expect(cells).toHaveLength(2);
		expect(cells[0]).toHaveTextContent("Email");
		expect(cells[1]).toHaveTextContent("Phone");
	});

	it("builds the grid template from a fixed avatar/name pair plus each column's width, falling back to 160px", () => {
		renderList({ columns: COLUMNS, items: [item()] });
		const header = document.querySelector(".entityListHeader");
		expect(header.style.gridTemplateColumns).toBe("40px minmax(0, 1fr) 220px 160px");
	});

	it("renders with no columns at all (still shows avatar/name tracks only)", () => {
		renderList({ columns: [], items: [item({ values: undefined })] });
		expect(screen.getByText("Arya Stark")).toBeInTheDocument();
		const header = document.querySelector(".entityListHeader");
		expect(header.style.gridTemplateColumns).toBe("40px minmax(0, 1fr) ");
	});
});

describe("row rendering", () => {
	it("renders one row per item", () => {
		renderList({
			columns: COLUMNS,
			items: [item(), item({ key: "row-2", primary: "Gendry Baratheon", values: {} })],
		});
		expect(document.querySelectorAll(".entityRow")).toHaveLength(2);
	});

	it("renders the primary and secondary text", () => {
		renderList({ columns: COLUMNS, items: [item()] });
		expect(screen.getByText("Arya Stark")).toBeInTheDocument();
		expect(screen.getByText("arya@example.com")).toBeInTheDocument();
	});

	it("omits the secondary line entirely when secondary is not supplied", () => {
		const { container } = renderList({
			columns: COLUMNS,
			items: [item({ secondary: undefined })],
		});
		expect(container.querySelector(".entityRowSecondary")).toBeNull();
	});

	it("renders each column's value from item.values, matched by column key", () => {
		renderList({
			columns: COLUMNS,
			items: [item({ values: { email: "arya@example.com", phone: "5551234567" } })],
		});
		const row = screen.getByText("Arya Stark").closest(".entityRow");
		const cells = within(row).getAllByText((c, el) => el.classList.contains("entityRowCell"));
		expect(cells[0]).toHaveTextContent("arya@example.com");
		expect(cells[1]).toHaveTextContent("5551234567");
	});

	it("carries the column label as data-label on each cell, for the narrow-screen layout", () => {
		renderList({ columns: COLUMNS, items: [item()] });
		const row = screen.getByText("Arya Stark").closest(".entityRow");
		const cells = within(row).getAllByText((c, el) => el.classList.contains("entityRowCell"));
		expect(cells[0]).toHaveAttribute("data-label", "Email");
		expect(cells[1]).toHaveAttribute("data-label", "Phone");
	});

	it.each([
		["null", null],
		["undefined", undefined],
		["empty string", ""],
	])("renders an em dash, not a blank cell, when a column value is %s", (_label, value) => {
		renderList({
			columns: COLUMNS,
			items: [item({ values: { email: value, phone: "5551234567" } })],
		});
		const row = screen.getByText("Arya Stark").closest(".entityRow");
		expect(within(row).getByText("—")).toBeInTheDocument();
	});

	it("renders a real falsy value (0) verbatim rather than as an em dash", () => {
		renderList({
			columns: COLUMNS,
			items: [item({ values: { email: 0, phone: "5551234567" } })],
		});
		const row = screen.getByText("Arya Stark").closest(".entityRow");
		expect(within(row).getByText("0")).toBeInTheDocument();
	});

	it("renders an em dash for every column when item.values itself is missing", () => {
		renderList({ columns: COLUMNS, items: [item({ values: undefined })] });
		const row = screen.getByText("Arya Stark").closest(".entityRow");
		const dashes = within(row).getAllByText("—");
		expect(dashes).toHaveLength(2);
	});

	it("passes the avatar url and primary label through to IBAvatar", () => {
		renderList({
			columns: COLUMNS,
			items: [item({ avatar: "https://example.com/arya.png" })],
		});
		const img = screen.getByRole("img", { name: "Arya Stark" });
		expect(img).toHaveAttribute("src", "https://example.com/arya.png");
	});
});

describe("archived rows", () => {
	it("adds the archived class and an Archived tag next to the primary text", () => {
		renderList({ columns: COLUMNS, items: [item({ archived: true })] });
		const row = screen.getByText("Arya Stark").closest(".entityRow");
		expect(row).toHaveClass("entityRowArchived");
		expect(within(row).getByText("Archived")).toBeInTheDocument();
	});

	it("does not add the archived class or tag for a plain row", () => {
		renderList({ columns: COLUMNS, items: [item()] });
		const row = screen.getByText("Arya Stark").closest(".entityRow");
		expect(row).not.toHaveClass("entityRowArchived");
		expect(within(row).queryByText("Archived")).not.toBeInTheDocument();
	});
});

describe("clickable rows and navigation", () => {
	it("adds entityRowClickable and navigates to linkTo on click when linkTo is set", async () => {
		const user = userEvent.setup();
		renderList({ columns: COLUMNS, items: [item({ linkTo: "/detail/row-1" })] });

		const row = screen.getByText("Arya Stark").closest(".entityRow");
		expect(row).toHaveClass("entityRowClickable");

		await user.click(row);
		expect(await screen.findByTestId("navigated")).toHaveTextContent(
			"Detail page for row-1",
		);
	});

	it("does not add entityRowClickable and does not navigate when linkTo is absent", async () => {
		const user = userEvent.setup();
		renderList({ columns: COLUMNS, items: [item({ linkTo: undefined })] });

		const row = screen.getByText("Arya Stark").closest(".entityRow");
		expect(row).not.toHaveClass("entityRowClickable");

		await user.click(row);
		expect(screen.queryByTestId("navigated")).not.toBeInTheDocument();
		// Still on the list, not navigated anywhere.
		expect(screen.getByText("Arya Stark")).toBeInTheDocument();
	});
});

describe("tag-colour tinting", () => {
	const TAG_COLOR = "#122152";

	it("applies the resting tint/border style from tagColorRowStyle when the item has a tagColor", () => {
		renderList({ columns: COLUMNS, items: [item({ tagColor: TAG_COLOR })] });
		const row = screen.getByText("Arya Stark").closest(".entityRow");
		const expected = tagColorRowStyle(TAG_COLOR, false);
		expect(row.style.backgroundColor).toBe(expected.backgroundColor);
		expect(row.style.borderLeft).toBe(expected.borderLeft);
	});

	it("switches to the hover-strength tint on mouseEnter and back on mouseLeave", () => {
		renderList({ columns: COLUMNS, items: [item({ tagColor: TAG_COLOR })] });
		const row = screen.getByText("Arya Stark").closest(".entityRow");

		fireEvent.mouseEnter(row);
		const hovered = tagColorRowStyle(TAG_COLOR, true);
		expect(row.style.backgroundColor).toBe(hovered.backgroundColor);

		fireEvent.mouseLeave(row);
		const rest = tagColorRowStyle(TAG_COLOR, false);
		expect(row.style.backgroundColor).toBe(rest.backgroundColor);
	});

	it("leaves no inline background/border style on a row with no tagColor", () => {
		renderList({ columns: COLUMNS, items: [item({ tagColor: undefined })] });
		const row = screen.getByText("Arya Stark").closest(".entityRow");
		expect(row.style.backgroundColor).toBe("");
		expect(row.style.borderLeft).toBe("");
	});
});
