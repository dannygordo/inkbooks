/**
 * Applies the "My Calendars" checkbox state (context/calendar.jsx's calendarFilters) to an
 * already-fetched list of appointments.
 *
 * Client-side, over data the server has already scoped correctly - not a second server round
 * trip per checkbox toggle. The server-side privacy rule (a personal appointment is only ever
 * fetched for its own owner - see resolvers/appointments.js) is what MUST be trusted; this is
 * purely a display preference layered on top of an already-safe result set, the same way the
 * old per-artist calendar checkbox filter worked before it was removed (see context/calendar.jsx's
 * own comment on that history).
 *
 * @param {Array} items - appointments, each carrying `isPersonal` (see AppointmentService.js's
 *   selection sets - every appointment-list query now selects it).
 * @param {{shop: boolean, personal: boolean}} calendarFilters
 * @returns {Array}
 */
export function filterByCalendars(items, calendarFilters) {
	if (!items || items.length === 0) {
		return items || [];
	}
	return items.filter((item) =>
		item.isPersonal ? calendarFilters.personal : calendarFilters.shop
	);
}
