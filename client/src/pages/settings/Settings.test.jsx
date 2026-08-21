// Settings.jsx tests. Per its own header comment this file "used to own everything" and is now a
// thin shell: settingsCategories.jsx is the single source of truth for which categories exist, who
// can see them, and what they render, and Settings.jsx just picks which one is on screen based on
// the `?category=` URL param (with a `?square=` redirect default for Square's OAuth landing).
//
// settingsCategories.jsx is mocked out here entirely (visibleSettingsCategories is a vi.fn()) so
// each test controls exactly which categories exist and what each one renders, rather than pulling
// in every real panel's own GraphQL data-fetching (AccountPanel, ShopPanel, SquarePanel, ...) -
// those each have their own test file. This mirrors AppointmentsList.test.jsx's approach of mocking
// out a sibling module and stubbing heavy child components so the page under test is isolated to
// its own logic: here, that logic is entirely "which category is active and how does the URL drive
// it", not what any individual panel renders.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import Settings from "./Settings";
import { AuthContext } from "../../context/auth";
import { visibleSettingsCategories } from "./settingsCategories";

vi.mock("./settingsCategories", () => ({
	visibleSettingsCategories: vi.fn(),
}));

// A stand-in for every real category icon (AccountCircle, Storefront, ...) - Settings.jsx renders
// `<Icon fontSize="small" />` directly, so this only needs to be a valid component, not a real
// MUI icon.
const FakeIcon = () => <span data-testid="fake-icon" />;

function category(key, label, renderPanel = () => <div data-testid="panel">{key}</div>) {
	return { key, label, icon: FakeIcon, isVisible: () => true, render: renderPanel };
}

// Renders the current search string so tests can assert what handleSelect actually wrote to the
// URL, not just which panel is on screen - there is no other way to observe
// `setSearchParams`'s output from outside the component.
function LocationProbe() {
	const location = useLocation();
	return <div data-testid="location-search">{location.search}</div>;
}

function renderSettings({ user = { id: "user-1" }, route = "/settings" } = {}) {
	render(
		<MemoryRouter initialEntries={[route]}>
			<AuthContext.Provider value={{ user }}>
				<Settings />
			</AuthContext.Provider>
			<LocationProbe />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	visibleSettingsCategories.mockReset();
});

describe("with more than one visible category", () => {
	const CATEGORIES = [
		category("account", "Account", () => <div data-testid="panel">Account panel</div>),
		category("shop", "Shop", () => <div data-testid="panel">Shop panel</div>),
	];

	beforeEach(() => {
		visibleSettingsCategories.mockReturnValue(CATEGORIES);
	});

	it("renders a nav item for every visible category and defaults to the first one's panel", () => {
		renderSettings();

		expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Shop" })).toBeInTheDocument();
		expect(screen.getByTestId("panel")).toHaveTextContent("Account panel");
	});

	it("switches the rendered panel and the URL's category param when a different nav item is clicked", async () => {
		const user = userEvent.setup();
		renderSettings();

		await user.click(screen.getByRole("button", { name: "Shop" }));

		expect(screen.getByTestId("panel")).toHaveTextContent("Shop panel");
		expect(screen.getByTestId("location-search")).toHaveTextContent("category=shop");
	});

	it("honors an explicit ?category= in the URL over the first-category default", () => {
		renderSettings({ route: "/settings?category=shop" });

		expect(screen.getByTestId("panel")).toHaveTextContent("Shop panel");
	});

	it("falls back to the first category when ?category= names one that doesn't exist", () => {
		renderSettings({ route: "/settings?category=bogus" });

		expect(screen.getByTestId("panel")).toHaveTextContent("Account panel");
	});

	it("preserves other existing search params (e.g. square) when selecting a category", async () => {
		const user = userEvent.setup();
		renderSettings({ route: "/settings?square=connected&category=shop" });

		await user.click(screen.getByRole("button", { name: "Account" }));

		const search = screen.getByTestId("location-search").textContent;
		expect(search).toContain("category=account");
		expect(search).toContain("square=connected");
	});

	it("passes the signed-in user through to visibleSettingsCategories and to the active category's render", () => {
		const user = { id: "artist-42" };
		visibleSettingsCategories.mockReturnValue([
			category("account", "Account", (u) => <div data-testid="panel">{u.id}</div>),
		]);

		renderSettings({ user });

		expect(visibleSettingsCategories).toHaveBeenCalledWith(user);
		expect(screen.getByTestId("panel")).toHaveTextContent("artist-42");
	});
});

describe("the ?square= redirect default", () => {
	const CATEGORIES = [
		category("account", "Account", () => <div data-testid="panel">Account panel</div>),
		category("square", "Square Config", () => <div data-testid="panel">Square panel</div>),
	];

	beforeEach(() => {
		visibleSettingsCategories.mockReturnValue(CATEGORIES);
	});

	it("lands on the square category when ?square= is present and no explicit category is given", () => {
		renderSettings({ route: "/settings?square=connected" });

		expect(screen.getByTestId("panel")).toHaveTextContent("Square panel");
	});

	it("still honors an explicit ?category= over the ?square= redirect", () => {
		renderSettings({ route: "/settings?square=connected&category=account" });

		expect(screen.getByTestId("panel")).toHaveTextContent("Account panel");
	});
});

describe("with no visible categories", () => {
	it("renders a fallback message instead of a nav and a blank panel", () => {
		visibleSettingsCategories.mockReturnValue([]);

		renderSettings();

		expect(screen.getByText("Nothing to configure for this account yet.")).toBeInTheDocument();
		expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
	});
});

it("always renders the Settings heading", () => {
	visibleSettingsCategories.mockReturnValue([category("account", "Account")]);
	renderSettings();

	expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
});
