import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { List, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import "./settings.css";
import { useAuth } from "../../context/auth";
import { visibleSettingsCategories } from "./settingsCategories";

/**
 * Settings, organised by type rather than as one long scroll.
 *
 * THIS FILE USED TO OWN EVERYTHING - every panel's data-fetching, every mutation, every bit of
 * local state, all in one function component that kept growing every time a new kind of setting
 * needed a home (see settings.css's original header comment on exactly that problem: seven panels
 * shoulder to shoulder was already unreadable). It's a thin shell now: settingsCategories.jsx is
 * the single place that knows what categories exist, who can see each one, and which
 * self-contained component renders it. Every panel now fetches and owns its own state the way
 * AccountPanel already did - this file just picks which one is on screen.
 *
 * `?category=` IN THE URL, not local state alone - so a link to Settings can point at a specific
 * category (Square's own OAuth redirect does exactly this, see below), a refresh doesn't silently
 * reset to the first tab, and the browser back button works the way switching screens should.
 */
const Settings = () => {
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();

	const categories = useMemo(() => visibleSettingsCategories(user), [user]);

	// Landing back from Square's own OAuth redirect (?square=connected|denied|error - see
	// SquarePanel.jsx) should land on the Square category by default, since the banner it renders
	// is useless sitting behind a different tab. This only supplies the DEFAULT: an explicit
	// ?category= in the URL still wins, so picking a different tab after arriving - or a refresh
	// once the banner's been dismissed - doesn't keep yanking back to Square.
	const requestedCategory = searchParams.get("category");
	const defaultCategory = searchParams.get("square") ? "square" : categories[0]?.key;
	const activeKey = categories.some((c) => c.key === requestedCategory)
		? requestedCategory
		: defaultCategory;
	const activeCategory = categories.find((c) => c.key === activeKey) || categories[0];

	const handleSelect = (key) => {
		setSearchParams((prev) => {
			// A fresh URLSearchParams built from the previous one, not the previous instance
			// itself - SquarePanel's own dismissRedirectBanner also reads/writes this same
			// location's params (for `square`), and mutating a shared object from two places
			// would be exactly the kind of one-writer-assumption bug this app has been bitten by
			// before under different names.
			const next = new URLSearchParams(prev);
			next.set("category", key);
			return next;
		});
	};

	// Account and Notifications are visible to everyone (see settingsCategories.jsx), so this is
	// unreachable in practice - kept as an honest fallback rather than an assumption, the same
	// reasoning IBCardShowError exists for elsewhere in this app.
	if (!activeCategory) {
		return (
			<div className="settings">
				<div className="settingsTitleContainer">
					<h1 className="settingsTitle">Settings</h1>
				</div>
				<p className="settingsPanelHelp">Nothing to configure for this account yet.</p>
			</div>
		);
	}

	return (
		<div className="settings">
			<div className="settingsTitleContainer">
				<h1 className="settingsTitle">Settings</h1>
			</div>
			<div className="settingsShell">
				<nav className="settingsNav" aria-label="Settings categories">
					<List disablePadding>
						{categories.map((category) => {
							const Icon = category.icon;
							return (
								<ListItemButton
									key={category.key}
									selected={category.key === activeCategory.key}
									onClick={() => handleSelect(category.key)}
									className="settingsNavItem"
								>
									<ListItemIcon className="settingsNavIcon">
										<Icon fontSize="small" />
									</ListItemIcon>
									<ListItemText primary={category.label} />
								</ListItemButton>
							);
						})}
					</List>
				</nav>
				<div className="settingsContainer">{activeCategory.render(user)}</div>
			</div>
		</div>
	);
};

export default Settings;
