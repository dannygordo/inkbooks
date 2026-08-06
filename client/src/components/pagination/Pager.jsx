// React imported explicitly: under Vitest, @vitejs/plugin-react compiles JSX with the CLASSIC
// runtime, so a component rendered by a test needs React in scope or it throws "React is not
// defined" - in that test's file, not this one. See vite.config.js and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { Button } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import "./pager.css";

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
 * Renders nothing when everything fits on one page. Controls that can only be disabled are furniture.
 */
const Pager = ({ pageInfo, onChange }) => {
  if (!pageInfo || pageInfo.totalCount <= pageInfo.limit) {
    return null;
  }

  const { totalCount, limit, offset } = pageInfo;
  const first = offset + 1;
  // The last row on THIS page, which is not offset+limit on the final page.
  const last = Math.min(offset + limit, totalCount);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < totalCount;

  return (
    <div className="pager">
      <span className="pagerRange">
        Showing {first}–{last} of {totalCount}
      </span>
      <div className="pagerButtons">
        <Button
          size="small"
          disabled={!hasPrev}
          startIcon={<ChevronLeftIcon />}
          // Clamped at zero rather than trusting offset >= limit: a limit changed between renders
          // would otherwise produce a negative offset, which the server refuses outright (see
          // utils/pagination.js) and which would surface as an error rather than a first page.
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
    </div>
  );
};

export default Pager;
