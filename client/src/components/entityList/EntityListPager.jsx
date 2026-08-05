import React from "react";
import "./entityList.css";

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
 * Hides itself entirely on a single page. A pager under a list of six clients is noise that
 * implies there's something else to see.
 *
 * @param {object} pageInfo - { totalCount, hasMore, limit, offset } from the server
 * @param {function} onChange - called with the new offset
 * @param {string} noun - "client"/"clients", for the count line
 */
const EntityListPager = ({ pageInfo, onChange, noun = "record" }) => {
	if (!pageInfo) {
		return null;
	}

	const { totalCount, hasMore, limit, offset } = pageInfo;
	const onFirstPage = offset === 0;

	if (onFirstPage && !hasMore) {
		// Everything fits. The count still gets shown for lists worth counting, but there's
		// nothing to navigate.
		return totalCount > 0 ? (
			<div className="entityListPager entityListPagerCountOnly">
				<span className="entityListCount">
					{totalCount} {totalCount === 1 ? noun : `${noun}s`}
				</span>
			</div>
		) : null;
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
