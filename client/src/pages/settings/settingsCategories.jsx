import React from "react";
import {
	AccountBalance,
	AccountCircle,
	AttachMoney,
	Assignment,
	BarChart,
	CalendarMonth,
	Chat,
	CreditCard,
	DarkMode,
	Link as LinkIcon,
	Notifications,
	Receipt,
	Security,
	Storefront,
	TrendingUp,
} from "@mui/icons-material";
import AccountPanel from "../../components/settings/AccountPanel";
import AppearancePanel from "../../components/settings/AppearancePanel";
import ShopPanel from "../../components/settings/ShopPanel";
import ShopConnectionPanel from "../../components/settings/ShopConnectionPanel";
import BookingLinkPanel from "../../components/settings/BookingLinkPanel";
import RatesPanel from "../../components/settings/RatesPanel";
import SquarePanel from "../../components/settings/SquarePanel";
import SquarePricingPanel from "../../components/settings/SquarePricingPanel";
import NotificationSettingsPanel from "../../components/notifications/NotificationSettingsPanel";
import EventLogPanel from "../../components/settings/EventLogPanel";
import RemindersPanel from "../../components/settings/RemindersPanel";
import ComingSoonPanel from "../../components/settings/ComingSoonPanel";
import ExpenseTypesPanel from "../../components/settings/ExpenseTypesPanel";
import IncomeTypesPanel from "../../components/settings/IncomeTypesPanel";
import RecurringExpensesPanel from "../../components/settings/RecurringExpensesPanel";
import FormsPanel from "../../components/settings/FormsPanel";
import { ROLES } from "../../constants/auth";

/**
 * Settings, by type - see the user's own framing: "Square Config, Security, Notifications,
 * Account, Shop, Calendar, Taxes, Messages, Forms, Analytics, etc." Each entry here is one of
 * those types: a nav item, a visibility rule, and the component(s) that render when it's active.
 *
 * ONE PLACE THAT KNOWS THE FULL LIST. Settings.jsx itself doesn't know what categories exist or
 * who can see them - it asks this file for the list and renders whichever one is selected. Adding
 * a category later (Calendar's real content, say) is an edit here, not a restructuring of the
 * page - which is the whole point of splitting Settings up this way rather than letting one file
 * keep growing the way it had been (see settings.css's original header comment on exactly that
 * problem).
 *
 * .jsx, NOT .js - this file was originally written as settingsCategories.js despite containing
 * JSX (every render() below is a JSX expression), which is exactly the pattern vite.config.js's
 * own header comment documents as having been swept out of this codebase once already (91 of 112
 * client/src/*.js files renamed for this same reason). This file was created after that sweep and
 * reintroduced the bug it fixed - Vite's oxc transform rejects JSX in a plain .js file with
 * "JSX syntax is disabled". Renamed rather than reconfigured, for the same reason the original
 * sweep chose renaming: every JS toolchain auto-detects JSX correctly from the .jsx extension with
 * zero config, which a parser flag is one more thing to keep in sync across whatever Vite/esbuild/
 * oxc version happens to be running.
 *
 * WHY isVisible IS A FUNCTION OF `user` RATHER THAN A FLAT ROLE NUMBER: several of these mirror an
 * ownership rule that isn't expressible as a role floor - "Shop" only means something for an
 * artist, "Security" (the audit trail) only for whoever the server's getEventLogs would actually
 * answer for (see resolvers/eventLogs.js's assertAdminAuthority - a shop admin, OR an independent
 * artist with no shop of their own, but never a plain shop-connected artist or a client). Hiding a
 * category nobody can use is a UX improvement, not the security boundary - the server enforces
 * that regardless of what this file decides to show.
 */

const isArtist = (user) => Boolean(user.userInfo) && user.userType === "artist";
const isShopAdminOrBetter = (user) => user.role <= ROLES.SHOP_ADMIN;
const hasShop = (user) => Boolean(user.userInfo?.shop?.id);
// Mirrors the server's hasAdminAuthority (utils/shop-membership.js): shop-admin-or-better, OR no
// shop at all. A plain shop-connected artist and a client both fail this, same as the server.
const hasAuditAuthority = (user) => isShopAdminOrBetter(user) || !hasShop(user);

const CATEGORIES = [
	{
		key: "account",
		label: "Account",
		icon: AccountCircle,
		isVisible: () => true,
		render: () => <AccountPanel />,
	},
	{
		key: "shop",
		label: "Shop",
		icon: Storefront,
		isVisible: (user) => isArtist(user),
		render: (user) => (
			<>
				{isShopAdminOrBetter(user) && hasShop(user) && (
					<ShopPanel shopId={user.userInfo.shop.id} shopName={user.userInfo.shop.name} />
				)}
				<ShopConnectionPanel />
			</>
		),
	},
	{
		key: "booking",
		label: "Booking",
		icon: LinkIcon,
		isVisible: (user) => isArtist(user),
		render: () => <BookingLinkPanel />,
	},
	{
		key: "rates",
		label: "Rates",
		icon: AttachMoney,
		isVisible: (user) => isArtist(user),
		render: () => <RatesPanel />,
	},
	{
		key: "expenses",
		label: "Expenses",
		icon: AccountBalance,
		// Same floor as Security/Taxes/Analytics: shop-admin-or-better, or an independent artist
		// with no shop at all - matching the server's own gate (assertCanManageBusinessRecord in
		// utils/shop-membership.js). A plain shop-connected artist or Staff member manages neither
		// their shop's books nor has a personal ledger of their own here.
		//
		// Split from "income" below into its own category (was one combined "Expenses & Income"
		// entry) - each now matches its own sidebar link and its own /expenses or /income page,
		// so a shop that only cares about one side of the ledger isn't stuck scrolling past the
		// other one to reach it.
		isVisible: (user) => hasAuditAuthority(user),
		render: () => (
			<>
				<ExpenseTypesPanel />
				<RecurringExpensesPanel />
			</>
		),
	},
	{
		key: "income",
		label: "Income",
		icon: TrendingUp,
		isVisible: (user) => hasAuditAuthority(user),
		render: () => <IncomeTypesPanel />,
	},
	{
		key: "square",
		label: "Square Config",
		icon: CreditCard,
		isVisible: (user) => isArtist(user),
		render: () => (
			<>
				<SquarePanel />
				<SquarePricingPanel />
			</>
		),
	},
	{
		key: "appearance",
		label: "Appearance",
		icon: DarkMode,
		// Everyone - a client using the guest conversation view doesn't hit Settings at all, but
		// every real account type (artist, staff, shop admin) has a screen to look at.
		isVisible: () => true,
		render: () => <AppearancePanel />,
	},
	{
		key: "notifications",
		label: "Notifications",
		icon: Notifications,
		isVisible: () => true,
		render: () => <NotificationSettingsPanel />,
	},
	{
		key: "security",
		label: "Security",
		icon: Security,
		isVisible: (user) => hasAuditAuthority(user),
		render: () => <EventLogPanel />,
	},
	{
		key: "calendar",
		label: "Calendar",
		icon: CalendarMonth,
		isVisible: (user) => isArtist(user),
		render: () => (
			<ComingSoonPanel
				label="Calendar"
				description="Default appointment lengths, working hours, and booking-window rules will live here."
			/>
		),
	},
	{
		key: "taxes",
		label: "Taxes",
		icon: Receipt,
		isVisible: (user) => hasAuditAuthority(user),
		render: () => (
			<ComingSoonPanel
				label="Taxes"
				description="Sales tax and processing offset already live under Square Config - a dedicated jurisdiction/rate table is on the way here."
			/>
		),
	},
	{
		key: "messages",
		label: "Messages",
		icon: Chat,
		// Reminders are appointment-relative and only mean something for someone who HAS
		// appointments - same isArtist gate as Booking/Rates/Square Config, not the "everyone"
		// default this category briefly had as a ComingSoonPanel placeholder.
		isVisible: (user) => isArtist(user),
		render: () => <RemindersPanel />,
	},
	{
		key: "forms",
		label: "Forms",
		icon: Assignment,
		// Was isArtist - narrowed to match the feature's actual ownership model (models/Form.js:
		// shopId XOR artistUserId, gated server-side by assertCanManageBusinessRecord), the same
		// floor Expenses/Income/Security/Taxes/Analytics already use. A plain shop-connected artist
		// or Staff member manages neither their shop's forms nor has an independent set of their
		// own here, same reasoning as those categories.
		isVisible: (user) => hasAuditAuthority(user),
		render: () => <FormsPanel />,
	},
	{
		key: "analytics",
		label: "Analytics",
		icon: BarChart,
		isVisible: (user) => hasAuditAuthority(user),
		render: () => (
			<ComingSoonPanel
				label="Analytics"
				description="Dashboard figures already live on Home - export and custom-report options will land here."
			/>
		),
	},
];

/** The categories a given signed-in user actually gets to see, in display order. */
export function visibleSettingsCategories(user) {
	return CATEGORIES.filter((category) => category.isVisible(user));
}

export default CATEGORIES;
