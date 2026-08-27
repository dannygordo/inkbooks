// React imported explicitly - see the note in AppointmentTypeChip.test.jsx and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import IBCalendar from "./IBCalendar";
import { CalendarContext } from "../../context/calendar";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";

// IBCalendar's own job is combining up to three query results (shop, self, self-personal) into
// one savedEvents array - the actual GRID (Month/Day, 35 cells of Tooltips) is Day.test.jsx's
// concern, not this file's, and rendering it here would only slow this suite down without adding
// coverage. CalendarHeader is mocked out for the same reason - it's Create Event/month navigation,
// unrelated to the merge logic under test.
vi.mock("./Month", () => ({ default: () => null }));
vi.mock("./CalendarHeader", () => ({ default: () => null }));

// The two calendar queries are real Apollo hooks in the actual service (AppointmentService.js) -
// mocked wholesale here rather than driven through MockedProvider, because the exact date range
// IBCalendar asks for depends on UtilsService.getMonth()'s use of the REAL current month/year at
// test-run time (see that function's own default args), which would make an exact-match Apollo
// mock brittle against whatever day this suite happens to run on. What's actually under test is
// "does IBCalendar combine what these two hooks return correctly", not "does the query variable
// shape match" - check-graphql-documents.js already guards the latter for every query in the app.
vi.mock("../../services/AppointmentService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		AppointmentService: {
			...actual.AppointmentService,
			getAppointmentsByShop: vi.fn(),
			getAppointmentsByArtistForCalendar: vi.fn(),
		},
	};
});

const SHOP_USER = { id: "artist-1", userInfo: { shop: { id: "shop-1" } } };
const INDEPENDENT_USER = { id: "artist-2", userInfo: {} };

function shopItem(id) {
	return { id, isPersonal: false, appointmentDate: "2026-08-10T14:00:00.000Z" };
}
function personalItem(id) {
	return { id, isPersonal: true, appointmentDate: "2026-08-10T15:00:00.000Z" };
}

function renderCalendar({ user, calendarFilters = { shop: true, personal: true } } = {}) {
	const setSavedEvents = vi.fn();
	render(
		<AuthContext.Provider value={{ user }}>
			<CalendarContext.Provider
				value={{
					monthIndex: 7,
					setMonthIndex: vi.fn(),
					daySelected: null,
					setDaySelected: vi.fn(),
					savedEvents: [],
					setSavedEvents,
					calendarFilters,
					setCalendarFilters: vi.fn(),
				}}
			>
				<IBCalendar />
			</CalendarContext.Provider>
		</AuthContext.Provider>,
	);
	return { setSavedEvents };
}

describe("IBCalendar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("merges the shop feed with this user's own personal appointments for a shop-connected user", async () => {
		AppointmentService.getAppointmentsByShop.mockReturnValue({
			data: { getAppointmentsByShop: { items: [shopItem("s1"), shopItem("s2")] } },
		});
		AppointmentService.getAppointmentsByArtistForCalendar.mockImplementation(
			(userId, range, page, extraFilter) => {
				// The self/independent-artist call is skipped (userId undefined) for a shop-connected
				// user - see IBCalendar.jsx's own comment.
				if (!userId) {
					return { data: undefined };
				}
				// Only the personal-fetch call passes extraFilter.
				if (extraFilter?.isPersonal) {
					return { data: { getAppointmentsByArtist: { items: [personalItem("p1")] } } };
				}
				return { data: undefined };
			},
		);

		const { setSavedEvents } = renderCalendar({ user: SHOP_USER });

		await waitFor(() => expect(setSavedEvents).toHaveBeenCalled());
		const merged = setSavedEvents.mock.calls.at(-1)[0];
		expect(merged.map((e) => e.id).sort()).toEqual(["p1", "s1", "s2"]);
	});

	it("uses only the self query for an independent artist, without a separate personal fetch", async () => {
		AppointmentService.getAppointmentsByShop.mockReturnValue({ data: undefined });
		AppointmentService.getAppointmentsByArtistForCalendar.mockImplementation(
			(userId, range, page, extraFilter) => {
				// The shop-scoped personal fetch is skipped (userId undefined) once there's no shop.
				if (!userId) {
					return { data: undefined };
				}
				// The self query already returns everything this artist owns, personal or not.
				return {
					data: {
						getAppointmentsByArtist: { items: [shopItem("solo-1"), personalItem("solo-2")] },
					},
				};
			},
		);

		const { setSavedEvents } = renderCalendar({ user: INDEPENDENT_USER });

		await waitFor(() => expect(setSavedEvents).toHaveBeenCalled());
		const merged = setSavedEvents.mock.calls.at(-1)[0];
		expect(merged.map((e) => e.id).sort()).toEqual(["solo-1", "solo-2"]);
	});

	it("applies the My Calendars filter to the merged result before setSavedEvents", async () => {
		AppointmentService.getAppointmentsByShop.mockReturnValue({
			data: { getAppointmentsByShop: { items: [shopItem("s1")] } },
		});
		AppointmentService.getAppointmentsByArtistForCalendar.mockImplementation(
			(userId, range, page, extraFilter) => {
				if (extraFilter?.isPersonal) {
					return { data: { getAppointmentsByArtist: { items: [personalItem("p1")] } } };
				}
				return { data: undefined };
			},
		);

		// Personal unchecked - the personal item must not reach setSavedEvents even though the
		// query fetched it (filtering is a display preference over an already-fetched, already-safe
		// result - see utils/calendarFilters.js).
		const { setSavedEvents } = renderCalendar({
			user: SHOP_USER,
			calendarFilters: { shop: true, personal: false },
		});

		await waitFor(() => expect(setSavedEvents).toHaveBeenCalled());
		const merged = setSavedEvents.mock.calls.at(-1)[0];
		expect(merged.map((e) => e.id)).toEqual(["s1"]);
	});

	it("does not crash when the shop has zero appointments", async () => {
		AppointmentService.getAppointmentsByShop.mockReturnValue({
			data: { getAppointmentsByShop: { items: [] } },
		});
		AppointmentService.getAppointmentsByArtistForCalendar.mockReturnValue({ data: undefined });

		const { setSavedEvents } = renderCalendar({ user: SHOP_USER });

		await waitFor(() => expect(setSavedEvents).toHaveBeenCalled());
		expect(setSavedEvents.mock.calls.at(-1)[0]).toEqual([]);
	});
});
