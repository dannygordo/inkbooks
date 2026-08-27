// Unit tests for utils/calendarFilters.js - the "My Calendars" checkbox filter applied to an
// already-fetched appointment list. Worth testing directly rather than only through
// AppointmentsList/IBCalendar because a mistake here is a PRIVACY-adjacent display bug in either
// direction: filtering too aggressively hides an appointment the user should see (reads as "my
// appointment vanished"), and filtering too little would show a personal appointment when the
// checkbox says it shouldn't be visible - even though the real privacy boundary lives server-side
// (see resolvers/appointments.js), this is the last line of defense for what actually renders.
import { describe, it, expect } from "vitest";
import { filterByCalendars } from "./calendarFilters";

const shopAppt = (id) => ({ id, isPersonal: false });
const personalAppt = (id) => ({ id, isPersonal: true });

describe("filterByCalendars", () => {
	it("keeps shop appointments when shop is checked", () => {
		const items = [shopAppt("a"), shopAppt("b")];
		expect(filterByCalendars(items, { shop: true, personal: true })).toEqual(items);
	});

	it("drops shop appointments when shop is unchecked", () => {
		const items = [shopAppt("a"), personalAppt("b")];
		expect(filterByCalendars(items, { shop: false, personal: true })).toEqual([
			personalAppt("b"),
		]);
	});

	it("drops personal appointments when personal is unchecked", () => {
		const items = [shopAppt("a"), personalAppt("b")];
		expect(filterByCalendars(items, { shop: true, personal: false })).toEqual([shopAppt("a")]);
	});

	it("returns everything when both are checked", () => {
		const items = [shopAppt("a"), personalAppt("b"), shopAppt("c"), personalAppt("d")];
		expect(filterByCalendars(items, { shop: true, personal: true })).toEqual(items);
	});

	it("returns nothing when both are unchecked", () => {
		const items = [shopAppt("a"), personalAppt("b")];
		expect(filterByCalendars(items, { shop: false, personal: false })).toEqual([]);
	});

	it("treats a missing isPersonal field as a shop appointment", () => {
		// Every current query selects isPersonal (see AppointmentService.js), but this guards the
		// same "field didn't exist yet" case the server-side query building already accounts for
		// (see appointmentFilterToQuery's own comment on treating a missing field as not-personal).
		const items = [{ id: "legacy" }];
		expect(filterByCalendars(items, { shop: true, personal: false })).toEqual(items);
		expect(filterByCalendars(items, { shop: false, personal: true })).toEqual([]);
	});

	it("returns an empty array unchanged rather than throwing", () => {
		expect(filterByCalendars([], { shop: true, personal: true })).toEqual([]);
	});

	it("returns null/undefined input as an empty array rather than throwing", () => {
		expect(filterByCalendars(null, { shop: true, personal: true })).toEqual([]);
		expect(filterByCalendars(undefined, { shop: true, personal: true })).toEqual([]);
	});

	it("does not mutate the input array", () => {
		const items = [shopAppt("a"), personalAppt("b")];
		const copy = [...items];
		filterByCalendars(items, { shop: true, personal: false });
		expect(items).toEqual(copy);
	});
});
