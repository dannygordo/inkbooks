// React imported explicitly: under Vitest, @vitejs/plugin-react compiles JSX with the CLASSIC
// runtime, so a component rendered by a test needs React in scope or it throws "React is not
// defined" - in that test's file, not this one. See vite.config.js and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { Button } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import "./pager.css";

// 10/25/50 - matches EntityListPager.jsx's own options, so "how many records before paging kicks
// in" means the same three choices everywhere in the app rather than each list inventing its own.
const PAGE_SIZE_OPTIONS = [10, 25, 50];

/**
 * Page controls for any list backed by the server's PageInput/pageInfo pair.
 *
 * ONE COMPONENT, because the alternative is each list inventing its own arithmetic. Off-by-ones in
 * "showing 51-100 of 240" are individually trivial and collectively corrosive: a list that
 * miscounts is a list people stop trusting for counting, which is most of why they opened it.
 *
 * Shows the RANGE and the TOTAL, not just next/prev. "Showing 1-50 of 240" answers the question a
 * bare arrow cannot - how much is there, and am I near the end - and it is the single thing that
 * makes a truncated list honest rather than merely short. The whole reason this exists is that
 * lists were silently capping at their fetch limit and looking complete.
 *
 * NO SEPARATE onPageSizeChange PROP - unlike EntityListPager, this reuses the same onChange a
 * Previous/Next click already calls, since both are just "ask the server for a different
 * {limit, offset}" and every caller here already accepts that shape. Choosing a size resets
 * offset to 0 - the alternative (keeping the current offset) would land on a page number that may
 * not exist any more the moment the size grows.
 *
 * The Previous/Next row hides once everything fits on one page - those controls, disabled, are
 * furniture. The size selector does NOT hide then: choosing a smaller size is exactly the action
 * that would turn a one-page list into a multi-page one, so it has to stay reachable at the one
 * moment someone might want it. The whole component still renders nothing for an empty list -
 * there's no size worth choosing for zero rows.
 */
const Pager = ({ pageInfo, onChange, pageSizeOptions = PAGE_SIZE_OPTIONS }) => {
  if (!pageInfo || pageInfo.totalCount === 0) {
    return null;
  }

  const { totalCount, limit, offset } = pageInfo;
  const first = offset + 1;
  // The last row on THIS page, which is not offset+limit on the final page.
  const last = Math.min(offset + limit, totalCount);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < totalCount;
  const fitsOnOnePage = totalCount <= limit;

  return (
    <div className="pager">
      <span className="pagerRange">
        Showing {first}–{last} of {totalCount}
      </span>
      <label className="pagerPageSize">
        Show
        <select
          value={limit}
          onChange={(e) => onChange({ limit: Number(e.target.value), offset: 0 })}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      {!fitsOnOnePage && (
        <div className="pagerButtons">
          <Button
            size="small"
            disabled={!hasPrev}
            startIcon={<ChevronLeftIcon />}
            // Clamped at zero rather than trusting offset >= limit: a limit changed between
            // renders would otherwise produce a negative offset, which the server refuses
            // outright (see utils/pagination.js) and which would surface as an error rather than
            // a first page.
            onClick={() => onChange({ limit, offset: Math.max(0, offset - limit) })}
          >
            Previous
          </Button>
          <Button
            size="small"
            disabled={!hasNext}
            endIcon={<ChevronRightIcon />}
            onClick={() => onChange({ limit, offset: offset + limit })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default Pager;
