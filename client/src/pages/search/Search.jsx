import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { InputAdornment, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import EntityList from "../../components/entityList/EntityList";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import SearchService from "../../services/SearchService";
import UtilsService from "../../services/UtilsService";
import { APP_SETTINGS_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
import "./search.css";

/**
 * The dedicated results page for global search - see components/search/GlobalSearch.jsx (the app
 * bar's own live dropdown, for quick single-result jumps) and server/utils/search.js (what's
 * actually being searched and how it's scoped).
 *
 * `?q=` DRIVES THE QUERY, same convention Settings uses for `?category=` - so a link straight to
 * "search results for X" is shareable/bookmarkable/back-button-able, and landing here from the app
 * bar's Enter key or "See all results" row is just a normal navigation to a URL, not a special
 * hand-off between two components that both know about each other.
 */

const RESULTS_LIMIT = 25;
const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

const CLIENT_COLUMNS = [
	{ key: "phone", label: "Phone", width: "140px" },
	{ key: "location", label: "Location", width: "160px" },
];
const PROJECT_COLUMNS = [
	{ key: "artist", label: "Artist", width: "160px" },
	{ key: "client", label: "Client", width: "160px" },
	{ key: "status", label: "Status", width: "120px" },
];
const MESSAGE_COLUMNS = [{ key: "date", label: "Date", width: "160px" }];

const Search = () => {
	const [searchParams, setSearchParams] = useSearchParams();
	const initialQuery = searchParams.get("q") || "";

	const [inputValue, setInputValue] = useState(initialQuery);
	const [runSearch, { data, loading, called }] = SearchService.useSearch();

	const debounceRef = useRef(null);
	// Skips the debounce exactly once - the query arriving in the URL (Enter, or "See all
	// results", from the app bar) should search immediately, not wait out a 300ms delay meant for
	// someone actively typing INTO this page's own box a moment later.
	const isFirstRun = useRef(true);

	useEffect(() => {
		const trimmed = inputValue.trim();
		clearTimeout(debounceRef.current);

		if (trimmed.length < MIN_QUERY_LENGTH) {
			isFirstRun.current = false;
			return undefined;
		}

		if (isFirstRun.current) {
			isFirstRun.current = false;
			runSearch({ variables: { query: trimmed, limit: RESULTS_LIMIT } });
			return undefined;
		}

		debounceRef.current = setTimeout(() => {
			runSearch({ variables: { query: trimmed, limit: RESULTS_LIMIT } });
			// replace, not push - a URL that changed on every keystroke would fill the back button
			// with one stop per character typed instead of one stop for "I searched something".
			setSearchParams({ q: trimmed }, { replace: true });
		}, DEBOUNCE_MS);
		return () => clearTimeout(debounceRef.current);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [inputValue]);

	const trimmedQuery = inputValue.trim();
	const results = data?.search;

	const clientItems = (results?.clients || []).map((client) => ({
		key: client.id,
		linkTo: `${ROUTE_CONSTANTS.CLIENT}${client.id}`,
		avatar: client.avatar,
		primary: `${client.firstName} ${client.lastName}`,
		secondary: client.email,
		values: {
			phone: UtilsService.formatPhone(client.phone),
			location: [client.city, client.state].filter(Boolean).join(", "),
		},
	}));

	const projectItems = (results?.projects || []).map((project) => ({
		key: project.id,
		linkTo: `${ROUTE_CONSTANTS.PROJECT}${project.id}`,
		avatar: project.artist?.avatar,
		primary: project.title,
		secondary: project.description,
		values: {
			artist: project.artist ? `${project.artist.firstName} ${project.artist.lastName}` : "",
			client: project.client ? `${project.client.firstName} ${project.client.lastName}` : "",
			status: UtilsService.prettyConstantsListValue(
				APP_SETTINGS_CONSTANTS.PROJECT_STATUS,
				project.status
			),
		},
	}));

	const messageItems = (results?.messages || []).map((message) => ({
		key: message.id,
		linkTo: `/messenger?conversation=${message.conversationId}`,
		avatar: message.user?.avatar,
		primary: message.user ? `${message.user.firstName} ${message.user.lastName}` : "Message",
		secondary: message.message,
		values: {
			date: message.createdAt ? new Date(message.createdAt).toLocaleString() : "",
		},
	}));

	// A capped result set that came back exactly at the cap COULD be hiding more matches - shown
	// as a hint to narrow the search rather than as a bare count, which would otherwise be read as
	// a total.
	const showsMoreHint = (list) => list.length === RESULTS_LIMIT;

	return (
		<div className="searchPage">
			<h1 className="searchPageTitle">Search</h1>
			<TextField
				fullWidth
				autoFocus
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				placeholder="Search clients, projects, messages…"
				variant="outlined"
				size="small"
				className="searchPageInput"
				slotProps={{
					input: {
						startAdornment: (
							<InputAdornment position="start">
								<SearchIcon fontSize="small" />
							</InputAdornment>
						),
					},
				}}
			/>

			{trimmedQuery.length < MIN_QUERY_LENGTH && (
				<p className="searchPageHint">Type at least two characters to search.</p>
			)}

			{trimmedQuery.length >= MIN_QUERY_LENGTH && loading && !called && <IBPageLoader />}

			{trimmedQuery.length >= MIN_QUERY_LENGTH && results && (
				<>
					<section className="searchPageSection">
						<h2 className="searchPageSectionTitle">Clients</h2>
						<EntityList
							columns={CLIENT_COLUMNS}
							items={clientItems}
							emptyMessage="No matching clients."
						/>
						{showsMoreHint(clientItems) && (
							<p className="searchPageMoreHint">
								Showing the top {RESULTS_LIMIT} matches - refine your search to narrow further.
							</p>
						)}
					</section>
					<section className="searchPageSection">
						<h2 className="searchPageSectionTitle">Projects</h2>
						<EntityList
							columns={PROJECT_COLUMNS}
							items={projectItems}
							emptyMessage="No matching projects."
						/>
						{showsMoreHint(projectItems) && (
							<p className="searchPageMoreHint">
								Showing the top {RESULTS_LIMIT} matches - refine your search to narrow further.
							</p>
						)}
					</section>
					<section className="searchPageSection">
						<h2 className="searchPageSectionTitle">Messages</h2>
						<EntityList
							columns={MESSAGE_COLUMNS}
							items={messageItems}
							emptyMessage="No matching messages."
						/>
						{showsMoreHint(messageItems) && (
							<p className="searchPageMoreHint">
								Showing the top {RESULTS_LIMIT} matches - refine your search to narrow further.
							</p>
						)}
					</section>
				</>
			)}
		</div>
	);
};

export default Search;
