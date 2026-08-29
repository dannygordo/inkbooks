// Ports the ONE range mobile's v1 appointments screen needs - "this week" - from apps/web's
// utils/dateRanges.js (buildScheduleRanges/getDefaultScheduleRange), not the whole module. Native
// Date rather than moment: mobile has no other date-arithmetic need yet, and the ISO-week
// calculation below is the entire reason moment would be added as a dependency. Web's date-range
// PICKER (This month/Next month/This week/Next week, a custom range) and its pager are
// deliberately not ported - v1 opens on a fixed window with no picker, same trim
// DECISIONS.md's mobile-auth-foundation entry documents for the rest of this screen. Add the
// picker back here, not as a second implementation, if/when mobile needs it.
export type AppointmentDateFilter = {
  from: string;
  to: string;
};

/**
 * Monday-start ISO week containing `now`, as the half-open `[from, to)` bounds
 * server/graphql/resolvers/appointments.js's `appointmentFilterToQuery` expects - matches web's
 * `buildScheduleRanges()[0]` exactly (`now.startOf("isoWeek")` through `+1 week`).
 */
export function getThisWeekFilter(now: Date = new Date()): AppointmentDateFilter {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  // Date#getDay() is 0 (Sunday) through 6 (Saturday); ISO weeks start Monday, so Sunday is 6 days
  // past the most recent Monday rather than 0.
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return { from: start.toISOString(), to: end.toISOString() };
}
