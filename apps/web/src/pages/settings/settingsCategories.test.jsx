// Unit tests for settingsCategories.jsx - per its own header comment, "ONE PLACE THAT KNOWS THE
// FULL LIST": a nav item, a visibility rule, and the component(s) that render, for every settings
// category. Settings.jsx itself is a thin shell over this file (see Settings.test.jsx), so the
// actual logic worth pinning down lives here: who sees which category, and what each category
// actually renders.
//
// .jsx, not .js, because every render() below is a JSX expression - see this file's own header
// comment on why that extension matters under this codebase's Vite/oxc pipeline. But the substance
// under test is plain data/logic (a filter predicate per category, and which components a category
// composes), not component *behaviour* - so unlike a MockedProvider+RTL test, nothing here is
// mounted to a DOM. React elements are inspected directly by their .type/.props, the same way you'd
// inspect any other returned data structure, which sidesteps needing Apollo mocks or an AuthContext
// for every one of the ~20 real panels this file imports and wires together.
import React from "react";
import { describe, it, expect } from "vitest";
import { ROLES } from "../../constants/auth";
import CATEGORIES, { visibleSettingsCategories } from "./settingsCategories";
import AccountPanel from "../../components/settings/AccountPanel";
import AppearancePanel from "../../components/settings/AppearancePanel";
import ShopPanel from "../../components/settings/ShopPanel";
import ShopConnectionPanel from "../../components/settings/ShopConnectionPanel";
import RatesPanel from "../../components/settings/RatesPanel";
import BoothRentPanel from "../../components/settings/BoothRentPanel";
import SquarePanel from "../../components/settings/SquarePanel";
import SquarePricingPanel from "../../components/settings/SquarePricingPanel";
import NotificationSettingsPanel from "../../components/notifications/NotificationSettingsPanel";
import EventLogPanel from "../../components/settings/EventLogPanel";
import RemindersPanel from "../../components/settings/RemindersPanel";
import AutoResponsesPanel from "../../components/settings/AutoResponsesPanel";
import ResponseTimePanel from "../../components/settings/ResponseTimePanel";
import SystemMessageTemplatesPanel from "../../components/settings/SystemMessageTemplatesPanel";
import ComingSoonPanel from "../../components/settings/ComingSoonPanel";
import ExpenseTypesPanel from "../../components/settings/ExpenseTypesPanel";
import IncomeTypesPanel from "../../components/settings/IncomeTypesPanel";
import RecurringExpensesPanel from "../../components/settings/RecurringExpensesPanel";
import FormsPanel from "../../components/settings/FormsPanel";

const ALL_KEYS = CATEGORIES.map((c) => c.key);

function renderOf(key, user) {
	return CATEGORIES.find((c) => c.key === key).render(user);
}

// children() normalises a Fragment's props.children (which React leaves as a single element,
// rather than an array, when there's only one child) to always be an array, so tests can index
// into it consistently regardless of how many entries a given category's Fragment has.
function children(element) {
	const kids = element.props.children;
	return Array.isArray(kids) ? kids : [kids];
}

function independentArtist(role = ROLES.ARTIST, id = "artist-1") {
	return { userType: "artist", role, userInfo: { id } };
}

function shopArtist(role = ROLES.ARTIST, shopId = "shop-1", id = "artist-2") {
	return { userType: "artist", role, userInfo: { id, shop: { id: shopId, name: "Copper Wolf" } } };
}

function shopAdminNonArtist(shopId = null) {
	return {
		userType: "user",
		role: ROLES.SHOP_ADMIN,
		userInfo: shopId ? { shop: { id: shopId } } : null,
	};
}

function shopStaff(shopId = "shop-1") {
	return { userType: "staff", role: ROLES.SHOP_STAFF, userInfo: { shop: { id: shopId } } };
}

function client(shopId = null) {
	return {
		userType: "client",
		role: ROLES.CLIENT,
		userInfo: shopId ? { shop: { id: shopId } } : {},
	};
}

describe("visibleSettingsCategories", () => {
	it("shows an independent artist (no shop) every category", () => {
		// isArtist is true and hasAuditAuthority is true (no shop at all satisfies the "OR no shop"
		// half of hasAuditAuthority), so nothing is gated out.
		expect(visibleSettingsCategories(independentArtist()).map((c) => c.key)).toEqual(ALL_KEYS);
	});

	it("shows a shop-admin artist with a shop every category too", () => {
		// isShopAdminOrBetter is true here, satisfying hasAuditAuthority the other way (shop-admin-
		// or-better rather than no-shop), so this also gets the full list despite having a shop.
		expect(
			visibleSettingsCategories(shopArtist(ROLES.SHOP_ADMIN)).map((c) => c.key),
		).toEqual(ALL_KEYS);
	});

	it("hides Security, Taxes and Analytics from a plain shop-connected artist (not shop admin)", () => {
		const keys = visibleSettingsCategories(shopArtist(ROLES.ARTIST)).map((c) => c.key);
		expect(keys).toEqual([
			"account",
			"shop",
			"rates",
			"expenses",
			"income",
			"square",
			"appearance",
			"notifications",
			"calendar",
			"messages",
			"forms",
		]);
		expect(keys).not.toContain("security");
		expect(keys).not.toContain("taxes");
		expect(keys).not.toContain("analytics");
	});

	it("shows a shop admin who isn't an artist only the everyone/audit-authority categories", () => {
		// isArtist is false (no userInfo at all), so every isArtist-gated category (Shop, Rates,
		// Expenses, Income, Square Config, Calendar, Messages) is hidden. hasAuditAuthority is true
		// (isShopAdminOrBetter), so Security/Taxes/Analytics show, and Forms shows via its
		// isArtist-OR-hasAuditAuthority gate even though isArtist alone is false.
		expect(visibleSettingsCategories(shopAdminNonArtist()).map((c) => c.key)).toEqual([
			"account",
			"appearance",
			"notifications",
			"security",
			"taxes",
			"forms",
			"analytics",
		]);
	});

	it("hides everything but the always-visible categories from shop staff", () => {
		// Shop staff are neither shop-admin-or-better nor artist-typed, and they belong to a shop -
		// so both isArtist and hasAuditAuthority are false, same shape as the shop-connected-artist
		// case above minus the isArtist-gated categories.
		expect(visibleSettingsCategories(shopStaff()).map((c) => c.key)).toEqual([
			"account",
			"appearance",
			"notifications",
		]);
	});

	it("hides everything but the always-visible categories from a client who belongs to a shop", () => {
		expect(visibleSettingsCategories(client("shop-1")).map((c) => c.key)).toEqual([
			"account",
			"appearance",
			"notifications",
		]);
	});

	// SURPRISING, and worth pinning down as the actual behaviour rather than an assumption:
	// hasAuditAuthority is `isShopAdminOrBetter(user) || !hasShop(user)`, which only asks "is this
	// account a shop admin, or does it have no shop at all" - it does not ask "is this an artist or
	// staff account in the first place". A client with no shop of their own satisfies the "no shop"
	// half exactly the same way an independent artist does, so this pure filter would show them
	// Security/Taxes/Analytics/Forms too. In the running app a client never reaches this function at
	// all - ClientSettings.jsx (a separate, deliberately smaller page) is what they're routed to
	// instead, per its own header comment - but settingsCategories.jsx itself has no such guard.
	it("would show a shop-less client Security/Taxes/Analytics/Forms too, since hasAuditAuthority only checks shop-admin-or-no-shop", () => {
		expect(visibleSettingsCategories(client(null)).map((c) => c.key)).toEqual([
			"account",
			"appearance",
			"notifications",
			"security",
			"taxes",
			"forms",
			"analytics",
		]);
	});

	it("preserves CATEGORIES's own declared order rather than sorting or grouping", () => {
		const keys = visibleSettingsCategories(independentArtist()).map((c) => c.key);
		expect(keys).toEqual(CATEGORIES.map((c) => c.key));
	});
});

describe("category.render composition", () => {
	it("account renders AccountPanel alone, ignoring the user argument", () => {
		const element = renderOf("account", shopArtist());
		expect(element.type).toBe(AccountPanel);
	});

	it("shop renders ShopPanel (with the shop's id/name) plus ShopConnectionPanel for a shop admin with a shop", () => {
		const user = shopArtist(ROLES.SHOP_ADMIN, "shop-99");
		const [shopPanel, connectionPanel] = children(renderOf("shop", user));

		expect(shopPanel.type).toBe(ShopPanel);
		expect(shopPanel.props).toEqual({ shopId: "shop-99", shopName: "Copper Wolf" });
		expect(connectionPanel.type).toBe(ShopConnectionPanel);
	});

	it("shop omits ShopPanel for a shop-connected artist who is not shop admin, but keeps ShopConnectionPanel", () => {
		const [shopPanel, connectionPanel] = children(renderOf("shop", shopArtist(ROLES.ARTIST)));

		expect(shopPanel).toBe(false);
		expect(connectionPanel.type).toBe(ShopConnectionPanel);
	});

	it("shop omits ShopPanel for an independent artist with no shop at all", () => {
		const [shopPanel, connectionPanel] = children(renderOf("shop", independentArtist()));

		expect(shopPanel).toBe(false);
		expect(connectionPanel.type).toBe(ShopConnectionPanel);
	});

	it("rates renders RatesPanel and BoothRentPanel, ignoring the user argument", () => {
		const [rates, booth] = children(renderOf("rates", independentArtist()));
		expect(rates.type).toBe(RatesPanel);
		expect(booth.type).toBe(BoothRentPanel);
	});

	it("expenses renders ExpenseTypesPanel and RecurringExpensesPanel", () => {
		const [expenseTypes, recurring] = children(renderOf("expenses", independentArtist()));
		expect(expenseTypes.type).toBe(ExpenseTypesPanel);
		expect(recurring.type).toBe(RecurringExpensesPanel);
	});

	it("income renders IncomeTypesPanel alone", () => {
		expect(renderOf("income", independentArtist()).type).toBe(IncomeTypesPanel);
	});

	it("square renders SquarePanel and SquarePricingPanel, ignoring the user argument", () => {
		const [square, pricing] = children(renderOf("square", independentArtist()));
		expect(square.type).toBe(SquarePanel);
		expect(pricing.type).toBe(SquarePricingPanel);
	});

	it("appearance renders AppearancePanel alone", () => {
		expect(renderOf("appearance", independentArtist()).type).toBe(AppearancePanel);
	});

	it("notifications renders NotificationSettingsPanel alone", () => {
		expect(renderOf("notifications", independentArtist()).type).toBe(NotificationSettingsPanel);
	});

	it("security renders EventLogPanel alone", () => {
		expect(renderOf("security", shopAdminNonArtist()).type).toBe(EventLogPanel);
	});

	it("calendar renders a ComingSoonPanel labelled Calendar", () => {
		const element = renderOf("calendar", independentArtist());
		expect(element.type).toBe(ComingSoonPanel);
		expect(element.props.label).toBe("Calendar");
	});

	it("taxes renders a ComingSoonPanel labelled Taxes", () => {
		const element = renderOf("taxes", shopAdminNonArtist());
		expect(element.type).toBe(ComingSoonPanel);
		expect(element.props.label).toBe("Taxes");
	});

	it("analytics renders a ComingSoonPanel labelled Analytics", () => {
		const element = renderOf("analytics", shopAdminNonArtist());
		expect(element.type).toBe(ComingSoonPanel);
		expect(element.props.label).toBe("Analytics");
	});

	it("messages renders Reminders, AutoResponses, ResponseTime and SystemMessageTemplates panels, in that order", () => {
		const [reminders, autoResponses, responseTime, templates] = children(
			renderOf("messages", independentArtist()),
		);
		expect(reminders.type).toBe(RemindersPanel);
		expect(autoResponses.type).toBe(AutoResponsesPanel);
		expect(responseTime.type).toBe(ResponseTimePanel);
		expect(templates.type).toBe(SystemMessageTemplatesPanel);
	});

	it("forms renders FormsPanel alone, ignoring the user argument", () => {
		expect(renderOf("forms", shopAdminNonArtist()).type).toBe(FormsPanel);
	});
});
