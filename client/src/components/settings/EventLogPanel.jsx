import React, { useState } from "react";
import moment from "moment";
import { MenuItem, TextField } from "@mui/material";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import EventLogService from "../../services/EventLogService";
import { formatCents } from "../../utils/money";

const DEFAULT_PAGE_SIZE = 25;
// Matches EntityListPager/Pager's own options (components/entityList/EntityListPager.jsx,
// components/pagination/Pager.jsx) - "how many records before paging kicks in" means the same
// three choices everywhere in the app, not a fourth set invented for this one panel.
const PAGE_SIZE_OPTIONS = [10, 25, 50];

const ENTITY_TYPES = [
	{ value: "", label: "Everything" },
	{ value: "Appointment", label: "Appointments" },
	{ value: "Client", label: "Clients" },
	{ value: "ShopCutRate", label: "Shop cut rates" },
];

const ACTION_LABELS = {
	create: "Created",
	update: "Changed",
	delete: "Deleted",
};

// Fields whose value is a whole number of cents - formatted as money rather than a bare integer.
// A field name convention rather than a lookup table, matching how the rest of this codebase
// already names every money field (see server/utils/money.js's own comment on the convention).
function formatChangeValue(field, value) {
	if (value === null || value === undefined || value === "") {
		return "—";
	}
	if (/Cents$/.test(field)) {
		const cents = Number(value);
		return Number.isFinite(cents) ? formatCents(cents) : value;
	}
	return value;
}

/**
 * The audit trail - who changed what, and when. Read-only; nothing here writes anything.
 *
 * Only visible to whoever the server's getEventLogs resolver would actually answer for (see
 * resolvers/eventLogs.js) - Settings.jsx gates this category out entirely for anyone else, so
 * this component never has to render an empty state explaining why nothing came back.
 */
const EventLogPanel = () => {
	const [entityType, setEntityType] = useState("");
	const [offset, setOffset] = useState(0);
	const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

	const { data, loading } = EventLogService.fetchEventLogs(entityType || undefined, {
		limit: pageSize,
		offset,
	});

	const page = data?.getEventLogs;
	const items = page?.items || [];

	const handleFilterChange = (e) => {
		setEntityType(e.target.value);
		setOffset(0);
	};

	return (
		<IBCardWrapper>
			<div>
				<h1>Activity Log</h1>
				<p className="settingsPanelHelp">
					Money, appointments, and client-record changes, with who made them and when.
					Notes and redactions are logged as having happened without repeating their
					content here.
				</p>
			</div>

			<TextField
				select
				size="small"
				label="Show"
				value={entityType}
				onChange={handleFilterChange}
				sx={{ minWidth: 220, mr: 2, mb: 2 }}
			>
				{ENTITY_TYPES.map((opt) => (
					<MenuItem key={opt.value} value={opt.value}>
						{opt.label}
					</MenuItem>
				))}
			</TextField>
			<TextField
				select
				size="small"
				label="Per page"
				value={pageSize}
				onChange={(e) => {
					setPageSize(Number(e.target.value));
					setOffset(0);
				}}
				sx={{ minWidth: 110, mb: 2 }}
			>
				{PAGE_SIZE_OPTIONS.map((size) => (
					<MenuItem key={size} value={size}>
						{size}
					</MenuItem>
				))}
			</TextField>

			{loading && items.length === 0 ? (
				<p className="settingsPanelHelp">Loading…</p>
			) : items.length === 0 ? (
				<p className="settingsPanelHelp">Nothing here yet.</p>
			) : (
				<ul className="eventLogList">
					{items.map((entry) => (
						<li key={entry.id} className="eventLogRow">
							<div className="eventLogRowHeader">
								<span className={`eventLogAction eventLogAction--${entry.action}`}>
									{ACTION_LABELS[entry.action] || entry.action}
								</span>
								<span className="eventLogSummary">{entry.summary}</span>
							</div>
							<div className="eventLogMeta">
								{entry.actorName} · {moment(entry.createdAt).format("MMM D, YYYY [at] h:mm A")}
							</div>
							{entry.changes.length > 0 && (
								<ul className="eventLogChanges">
									{entry.changes.map((change) => (
										<li key={change.field}>
											<span className="eventLogChangeField">{change.field}</span>:{" "}
											{formatChangeValue(change.field, change.from)}
											{" → "}
											{formatChangeValue(change.field, change.to)}
										</li>
									))}
								</ul>
							)}
						</li>
					))}
				</ul>
			)}

			{page?.pageInfo && (page.pageInfo.offset > 0 || page.pageInfo.hasMore) && (
				<div className="settingsActions">
					<button
						type="button"
						className="ibButtonSecondary"
						disabled={offset === 0}
						onClick={() => setOffset(Math.max(0, offset - pageSize))}
					>
						Newer
					</button>
					<button
						type="button"
						className="ibButtonSecondary"
						disabled={!page.pageInfo.hasMore}
						onClick={() => setOffset(offset + pageSize)}
					>
						Older
					</button>
				</div>
			)}
		</IBCardWrapper>
	);
};

export default EventLogPanel;
