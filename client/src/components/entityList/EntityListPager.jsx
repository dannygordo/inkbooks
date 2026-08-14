import React from "react";
import "./entityList.css";

// 10/25/50 - matches Pager.jsx's own options (components/pagination/Pager.jsx), so "how many
// records before paging kicks in" means the same three choices everywhere in the app rather than
// each list inventing its own set.
const PAGE_SIZE_OPTIONS = [10, 25, 50];

/**
 * Page controls for a directory.
 *
 * Rendered by the list pages, NOT by EntityList itself. EntityList draws whatever rows it's
 * given; whether those rows are one page of many is the page's business. Folding paging into the
 * list component would force every caller that isn't paged - the artist dashboard's "next five",
 * the payout list - to pass a prop saying "no pager please", which is the wrong default and the
 * wrong shape.
 *
 * Shows a count, because a directory's most useful fact is often how many there are. "1,247
 * clients" is an answer; "page 1 of 25" is trivia.
 *
 * THE SIZE SELECTOR (onPageSizeChange), when a caller passes one, renders even when everything
 * already fits on one page - unlike the Previous/Next buttons, which stay hidden then. Choosing a
 * SMALLER page size is exactly the action that would turn a one-page list into a multi-page one,
 * so hiding the control whenever there's nothing to page through yet would make it disappear at
 * the one moment someone might reach for it.
 *
 * Reads the CURRENT size off pageInfo.limit rather than a separate prop - the server always
 * echoes back the limit it actually used, so there is nothing for a caller to keep in sync by
 * hand.
 *
 * @param {object} pageInfo - { totalCount, hasMore, limit, offset } from the server
 * @param {function} onChange - called with the new offset
 * @param {string} noun - "client"/"clients", for the count line
 * @param {function} [onPageSizeChange] - called with the new limit; omit to hide the selector
 * @param {number[]} [pageSizeOptions]
 */
const EntityListPager = ({
	pageInfo,
	onChange,
	noun = "record",
	onPageSizeChange,
	pageSizeOptions = PAGE_SIZE_OPTIONS,
}) => {
	if (!pageInfo) {
		return null;
	}

	const { totalCount, hasMore, limit, offset } = pageInfo;
	const onFirstPage = offset === 0;

	const sizeSelector = onPageSizeChange && (
		<label className="entityListPageSize">
			Show
			<select
				value={limit}
				onChange={(e) => onPageSizeChange(Number(e.target.value))}
			>
				{pageSizeOptions.map((size) => (
					<option key={size} value={size}>
						{size}
					</option>
				))}
			</select>
		</label>
	);

	if (onFirstPage && !hasMore) {
		// Everything fits. The count still gets shown for lists worth counting, and the size
		// selector stays available - see its own comment above on why it doesn't hide here too.
		if (totalCount === 0 && !sizeSelector) {
			return null;
		}
		return (
			<div className="entityListPager entityListPagerCountOnly">
				{totalCount > 0 && (
					<span className="entityListCount">
						{totalCount} {totalCount === 1 ? noun : `${noun}s`}
					</span>
				)}
				{sizeSelector}
			</div>
		);
	}

	// Human numbering: "1-50 of 1,247", not "offset 0, limit 50".
	const firstShown = offset + 1;
	const lastShown = Math.min(offset + limit, totalCount);

	return (
		<div className="entityListPager">
			<span className="entityListCount">
				{firstShown.toLocaleString()}-{lastShown.toLocaleString()} of{" "}
				{totalCount.toLocaleString()} {totalCount === 1 ? noun : `${noun}s`}
			</span>
			{sizeSelector}
			<div className="entityListPagerButtons">
				<button
					type="button"
					className="ibButtonSecondary"
					disabled={onFirstPage}
					onClick={() => onChange(Math.max(0, offset - limit))}
				>
					Previous
				</button>
				<button
					type="button"
					className="ibButtonSecondary"
					disabled={!hasMore}
					onClick={() => onChange(offset + limit)}
				>
					Next
				</button>
			</div>
		</div>
	);
};

export default EntityListPager;
