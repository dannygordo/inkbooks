import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { styled } from "@mui/material/styles";
import InputBase from "@mui/material/InputBase";
import SearchIcon from "@mui/icons-material/Search";
import CircularProgress from "@mui/material/CircularProgress";
import SearchService from "../../services/SearchService";
import "./globalSearch.css";

/**
 * The app bar's search box - previously a styled shell wired to `console.log(e.target.value)` and
 * nothing else (see the git history on Sidebar.jsx, which is where these styled components and
 * this box originally lived; moved here so Sidebar.jsx isn't also the file that owns fetching and
 * rendering search results). See server/utils/search.js for what it actually searches.
 *
 * DEBOUNCED, NOT ON ENTER. The stub this replaced only fired on Enter, which is a fine pattern for
 * "go to a results page" but not for "show me a dropdown" - the ask ("grouped by type") reads as
 * an at-a-glance panel, not a second full page, so this fires ~300ms after the last keystroke and
 * renders inline instead.
 */

// Was alpha(theme.palette.common.black, 0.15) - the stock MUI AppBar-search look, a translucent
// black wash. That reads as a plausible light gray on a WHITE app bar and is nearly invisible on a
// dark one, since a black wash over near-black background has almost no contrast left to give -
// exactly the "doesn't theme" report this replaces. --ib-surface-subtle/--ib-surface-hover already
// flip correctly for both modes (see tokens.css), so the search pill now reads as a real recessed
// field against the app bar's --ib-surface-card, in both modes, instead of a fixed-opacity overlay
// that only happened to look right in one of them.
const Search = styled("div")(({ theme }) => ({
	position: "relative",
	borderRadius: theme.shape.borderRadius,
	border: "1px solid var(--ib-border)",
	backgroundColor: "var(--ib-surface-subtle)",
	"&:hover": {
		backgroundColor: "var(--ib-surface-hover)",
	},
	"&:focus-within": {
		borderColor: "var(--ib-primary)",
	},
	marginRight: theme.spacing(2),
	marginLeft: 0,
	width: "100%",
	[theme.breakpoints.up("sm")]: {
		marginLeft: theme.spacing(3),
		flexGrow: 1,
		width: "auto",
		maxWidth: 520,
	},
}));

const SearchIconWrapper = styled("div")(({ theme }) => ({
	padding: theme.spacing(0, 2),
	height: "100%",
	position: "absolute",
	pointerEvents: "none",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	color: "var(--ib-text-muted)",
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
	color: "var(--ib-text-primary)",
	"& .MuiInputBase-input": {
		padding: theme.spacing(1, 1, 1, 0),
		paddingLeft: `calc(1em + ${theme.spacing(4)})`,
		transition: theme.transitions.create("width"),
		width: "100%",
		"&::placeholder": {
			color: "var(--ib-text-muted)",
			opacity: 1,
		},
	},
}));

const DEBOUNCE_MS = 300;
// Below this, a $text query is more likely to return noise than anything the person meant - and
// firing a query on every one- or two-character keystroke is a query for every keystroke of a
// search that hasn't really started yet.
const MIN_QUERY_LENGTH = 2;

function truncate(text, max = 80) {
	const flat = String(text || "").replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

const GlobalSearch = () => {
	const navigate = useNavigate();
	const containerRef = useRef(null);
	const debounceRef = useRef(null);

	const [inputValue, setInputValue] = useState("");
	const [open, setOpen] = useState(false);
	const [runSearch, { data, loading }] = SearchService.useSearch();

	useEffect(() => {
		clearTimeout(debounceRef.current);
		const trimmed = inputValue.trim();
		if (trimmed.length < MIN_QUERY_LENGTH) {
			return undefined;
		}
		debounceRef.current = setTimeout(() => {
			runSearch({ variables: { query: trimmed } });
		}, DEBOUNCE_MS);
		return () => clearTimeout(debounceRef.current);
	}, [inputValue, runSearch]);

	// Closes the dropdown on an outside click - the standard "click away" pattern, done by hand
	// rather than pulling in a library for one listener.
	useEffect(() => {
		const handleClickOutside = (e) => {
			if (containerRef.current && !containerRef.current.contains(e.target)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const results = data?.search;
	const trimmedQuery = inputValue.trim();
	const hasQuery = trimmedQuery.length >= MIN_QUERY_LENGTH;
	const hasResults =
		results && (results.clients.length || results.projects.length || results.messages.length);

	const goTo = (path) => {
		navigate(path);
		setOpen(false);
		setInputValue("");
	};

	// Enter, or the "see all results" row, both land on the full /search page - the dropdown stays
	// for quick single-result jumps, but a query that doesn't have an obvious single answer (or
	// just has more matches than the dropdown's own small per-type cap shows) needs the fuller
	// page. Unlike goTo() above, this deliberately does NOT clear the input - the box should still
	// show what was searched once you're looking at the results for it.
	const goToResultsPage = () => {
		if (!hasQuery) {
			return;
		}
		navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
		setOpen(false);
	};

	return (
		<Search ref={containerRef} className="globalSearch">
			<SearchIconWrapper>
				<SearchIcon />
			</SearchIconWrapper>
			<StyledInputBase
				placeholder="Search clients, projects, messages…"
				value={inputValue}
				onFocus={() => setOpen(true)}
				onChange={(e) => {
					setInputValue(e.target.value);
					setOpen(true);
				}}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						setOpen(false);
						e.target.blur();
					} else if (e.key === "Enter") {
						e.preventDefault();
						goToResultsPage();
					}
				}}
				inputProps={{ "aria-label": "search" }}
			/>
			{open && hasQuery && (
				<div className="globalSearchResults">
					{loading && (
						<div className="globalSearchLoading">
							<CircularProgress size={16} />
						</div>
					)}
					{!loading && !hasResults && (
						<div className="globalSearchEmpty">No results for &ldquo;{trimmedQuery}&rdquo;.</div>
					)}
					{!loading && results && results.clients.length > 0 && (
						<div className="globalSearchSection">
							<div className="globalSearchSectionLabel">Clients</div>
							{results.clients.map((client) => (
								<button
									type="button"
									key={client.id}
									className="globalSearchResultRow"
									onClick={() => goTo(`/client/${client.id}`)}
								>
									<span className="globalSearchResultPrimary">
										{client.firstName} {client.lastName}
									</span>
									<span className="globalSearchResultSecondary">{client.email}</span>
								</button>
							))}
						</div>
					)}
					{!loading && results && results.projects.length > 0 && (
						<div className="globalSearchSection">
							<div className="globalSearchSectionLabel">Projects</div>
							{results.projects.map((project) => (
								<button
									type="button"
									key={project.id}
									className="globalSearchResultRow"
									onClick={() => goTo(`/project/${project.id}`)}
								>
									<span className="globalSearchResultPrimary">{project.title}</span>
									<span className="globalSearchResultSecondary">{project.status}</span>
								</button>
							))}
						</div>
					)}
					{!loading && results && results.messages.length > 0 && (
						<div className="globalSearchSection">
							<div className="globalSearchSectionLabel">Messages</div>
							{results.messages.map((message) => (
								<button
									type="button"
									key={message.id}
									className="globalSearchResultRow"
									onClick={() => goTo(`/messenger?conversation=${message.conversationId}`)}
								>
									<span className="globalSearchResultPrimary">
										{message.user ? `${message.user.firstName} ${message.user.lastName}` : "Message"}
									</span>
									<span className="globalSearchResultSecondary">
										{truncate(message.message)}
									</span>
								</button>
							))}
						</div>
					)}
					{!loading && (
						<button
							type="button"
							className="globalSearchSeeAll"
							onClick={goToResultsPage}
						>
							See all results for &ldquo;{trimmedQuery}&rdquo;
						</button>
					)}
				</div>
			)}
		</Search>
	);
};

export default GlobalSearch;
