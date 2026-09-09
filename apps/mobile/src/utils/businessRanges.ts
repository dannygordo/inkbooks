// The preset ranges Income/Expenses offer for filtering history - a trimmed port of apps/web's
// utils/dateRanges.js's buildPresetRanges/getDefaultRange (the "look backward, how did I do"
// presets; NOT that file's separate scheduling ranges, which mobile's own dateRanges.ts already
// covers for appointments). Native Date arithmetic, not moment - moment isn't a mobile dependency
// and every calculation here is a plain calendar boundary, the same reasoning dateRanges.ts's own
// header comment gives for getThisWeekFilter. See DECISIONS.md X26.
//
// No custom range picker (two free-form date pickers to define an arbitrary window) - the five
// presets below are the whole of this port; see DECISIONS.md X26 for why that's a named scope cut,
// not an oversight.
//
// Every range is HALF-OPEN: start inclusive, end exclusive, matching web's own comment exactly -
// server/utils/analytics.js's $gte/$lt aggregation (reused here via getIncomes/getExpenses' own
// start/end args) expects the two halves to agree by construction.

export type RangeKey = 'this_month' | 'last_month' | 'this_quarter' | 'year_to_date' | 'last_12_months';

export type DateRangePreset = {
  key: RangeKey;
  label: string;
  start: Date;
  end: Date;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function startOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

export function buildPresetRanges(now: Date = new Date()): DateRangePreset[] {
  const monthStart = startOfMonth(now);
  const yearStart = startOfYear(now);

  return [
    { key: 'this_month', label: 'This month', start: monthStart, end: addMonths(now, 1) },
    { key: 'last_month', label: 'Last month', start: addMonths(now, -1), end: monthStart },
    { key: 'this_quarter', label: 'This quarter', start: startOfQuarter(now), end: addMonths(startOfQuarter(now), 3) },
    { key: 'year_to_date', label: 'Year to date', start: yearStart, end: addMonths(yearStart, 12) },
    // A rolling window from the start of the month 11 back, so it's twelve whole months rather
    // than twelve months and a fraction - matches web's own comment on this exact range.
    { key: 'last_12_months', label: 'Last 12 months', start: addMonths(monthStart, -11), end: addMonths(now, 1) },
  ];
}

export function getDefaultRange(now: Date = new Date()): DateRangePreset {
  return buildPresetRanges(now)[0];
}
