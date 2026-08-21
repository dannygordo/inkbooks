// React imported explicitly - see the note in AppointmentTypeChip.jsx/DaySchedule.jsx and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import moment from "moment";
import DaySchedule from "./DaySchedule";
import { AppointmentService } from "../../services/AppointmentService";

// DaySchedule fetches its OWN data - it calls AppointmentService.getAppointmentsByArtistForCalendar
// (a thin useQuery wrapper, see AppointmentService.js) directly rather than receiving appointments
// as a prop. So these tests go through MockedProvider against the query DaySchedule actually runs,
// GET_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR, built from AppointmentService's own exported document
// (AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR) rather than a hand-copied one -
// same convention as UpdateEventDialog.test.jsx's consultMock() - so the mock can't drift away from
// what the component sends.
//
// The half-open [startOfDay, nextDay) range is reproduced here with the same moment(...).format /
// startOf("day") calls DaySchedule.jsx itself uses (see its `range` useMemo), rather than hardcoded
// ISO strings, so the expected variables can't drift from the source's own date math regardless of
// the host machine's timezone.
function dayRange(date) {
	const dayKey = moment(date).format("YYYY-MM-DD");
	const start = moment(dayKey, "YYYY-MM-DD").startOf("day");
	return { from: start.toISOString(), to: start.clone().add(1, "day").toISOString() };
}

function scheduleMock({ userId, date, items, error }) {
	const request = {
		query: AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR,
		variables: { userId, filter: dayRange(date), page: { limit: 200 } },
	};
	if (error) {
		return { request, error };
	}
	return {
		request,
		result: {
			data: {
				getAppointmentsByArtist: {
					__typename: "AppointmentConnection",
					items,
					pageInfo: {
						__typename: "PageInfo",
						totalCount: items.length,
						hasMore: false,
						limit: 200,
						offset: 0,
					},
				},
			},
		},
	};
}

function appt(overrides = {}) {
	return {
		__typename: "Appointment",
		id: "appt-1",
		projectId: null,
		userId: "artist-1",
		bookingRequestId: null,
		project: null,
		bookingRequest: null,
		shopId: null,
		isPersonal: false,
		user: { __typename: "User", id: "artist-1", tagColor: null, lastName: "B", firstName: "A", avatar: null },
		title: "Sleeve session",
		description: null,
		appointmentType: "session",
		appointmentDate: "2026-08-10T14:00:00.000Z",
		durationMinutes: 60,
		appointmentEnd: "2026-08-10T15:00:00.000Z",
		appointmentStatus: "scheduled",
		shopCutStatus: "none",
		shopCutCents: 0,
		shopCutPaymentMethod: null,
		shopCutSquareInvoiceId: null,
		depositCollectedCents: null,
		...overrides,
	};
}

const DATE = "2026-08-10T12:00:00.000Z";
const ARTIST_ID = "artist-1";

function renderSchedule({ mocks = [], ...props }) {
	return render(
		<MockedProvider mocks={mocks}>
			<DaySchedule artistUserId={ARTIST_ID} date={DATE} {...props} />
		</MockedProvider>,
	);
}

describe("DaySchedule", () => {
	// No query is run at all here: `range` is only computed once `date` parses (see the component's
	// `dayKey` derivation), so an unparseable/missing date hits `skip: !userId || !range` and the
	// component bails out on its `!dayKey` check before ever waiting on `loading`. Passing no mocks
	// at all (rather than a mock for a query never fired) is itself part of what's being asserted.
	it("renders nothing when the date is missing or invalid", () => {
		const { container } = renderSchedule({ date: null, mocks: [] });
		expect(container).toBeEmptyDOMElement();
	});

	// Same silent-by-design behaviour while the query is in flight as while it's genuinely empty -
	// see the component's own header comment ("silence is the correct output for the common case").
	// There is no separate loading UI to assert on, so this locks in that the in-flight render is
	// still `null`, not a flash of stale/undefined markup.
	it("renders nothing while the appointments query is loading", () => {
		const mock = scheduleMock({ userId: ARTIST_ID, date: DATE, items: [appt()] });
		const { container } = renderSchedule({ mocks: [mock] });
		expect(container).toBeEmptyDOMElement();
	});

	// DaySchedule destructures only `{ data, loading }` off the hook - it never reads `error` - so a
	// failed request degrades exactly like an empty day rather than surfacing anything. Documented
	// here as a real, deliberate assertion of current behaviour (not merely "it doesn't crash"),
	// since it's easy to mistake for an oversight when reading the component alone.
	it("renders nothing (not an error message) when the query errors", async () => {
		const mock = scheduleMock({ userId: ARTIST_ID, date: DATE, items: [], error: new Error("boom") });
		const { container } = renderSchedule({ mocks: [mock] });
		await waitFor(() => expect(container).toBeEmptyDOMElement());
	});

	it("renders nothing when the artist has no appointments that day", async () => {
		const mock = scheduleMock({ userId: ARTIST_ID, date: DATE, items: [] });
		const { container } = renderSchedule({ mocks: [mock] });
		await waitFor(() => expect(container).toBeEmptyDOMElement());
	});

	it("renders the day's appointments, each with its own type chip, time range and title", async () => {
		const items = [
			appt({
				id: "appt-consult",
				appointmentType: "consult",
				title: "Consult - Arya Stark",
				appointmentDate: "2026-08-10T18:00:00.000Z",
				appointmentEnd: "2026-08-10T18:30:00.000Z",
			}),
			appt({
				id: "appt-session",
				appointmentType: "session",
				title: null,
				project: { __typename: "Project", id: "project-1", title: "Half sleeve - koi", client: null },
				appointmentDate: "2026-08-10T14:00:00.000Z",
				appointmentEnd: "2026-08-10T15:00:00.000Z",
			}),
		];
		const mock = scheduleMock({ userId: ARTIST_ID, date: DATE, items });
		renderSchedule({ mocks: [mock] });

		expect(await screen.findByText(/2 already booked/)).toBeInTheDocument();

		// Sorted by appointmentDate ascending, so the 2pm session lists before the 6pm consult even
		// though it was declared second above (see the component's `.sort` in its `appointments`
		// useMemo) - titles are checked in that order to lock the ordering in, not just presence.
		const items_ = screen.getAllByRole("listitem");
		expect(items_).toHaveLength(2);
		expect(items_[0]).toHaveTextContent("Half sleeve - koi");
		expect(items_[0]).toHaveTextContent("Session");
		expect(items_[0]).toHaveTextContent("2:00 PM");
		expect(items_[1]).toHaveTextContent("Consult - Arya Stark");
		expect(items_[1]).toHaveTextContent("Consult");
		expect(items_[1]).toHaveTextContent("6:00 PM");
	});

	// A project-linked session has no `title` of its own - it falls back to `project.title`, and an
	// appointment with neither falls back to the literal placeholder rather than an empty label.
	it("falls back to the project's title, then to '(untitled)', when the appointment has none", async () => {
		const items = [
			appt({ id: "appt-untitled", title: null, project: null }),
		];
		const mock = scheduleMock({ userId: ARTIST_ID, date: DATE, items });
		renderSchedule({ mocks: [mock] });

		expect(await screen.findByText("(untitled)")).toBeInTheDocument();
	});

	// The appointment being edited is on this day too, and would otherwise "clash" against itself -
	// see the component's own comment on `excludeAppointmentId`. Confirms it's filtered out of both
	// the list and the "N already booked" count, not merely hidden visually.
	it("excludes the appointment identified by excludeAppointmentId", async () => {
		const items = [
			appt({ id: "appt-being-edited", title: "Being edited right now" }),
			appt({ id: "appt-other", title: "Someone else's booking", appointmentDate: "2026-08-10T20:00:00.000Z", appointmentEnd: "2026-08-10T21:00:00.000Z" }),
		];
		const mock = scheduleMock({ userId: ARTIST_ID, date: DATE, items });
		renderSchedule({ mocks: [mock], excludeAppointmentId: "appt-being-edited" });

		expect(await screen.findByText(/1 already booked/)).toBeInTheDocument();
		expect(screen.queryByText("Being edited right now")).not.toBeInTheDocument();
		expect(screen.getByText("Someone else's booking")).toBeInTheDocument();
	});

	// `durationMinutes` is what turns "something else is booked that day" into a real, computable
	// overlap against the slot being booked right now (see the component's header comment on why it
	// couldn't claim this before Appointment carried a duration) - checked here against a booking
	// that overlaps and one on the same day that clearly doesn't.
	it("flags only the existing appointment that overlaps the slot being booked", async () => {
		const items = [
			// 2:00-3:00 PM - overlaps a new 2:30-3:30 PM booking.
			appt({ id: "appt-clash", title: "Overlapping booking", appointmentDate: "2026-08-10T14:00:00.000Z", appointmentEnd: "2026-08-10T15:00:00.000Z" }),
			// 6:00-6:30 PM - well clear of it.
			appt({ id: "appt-clear", title: "Unrelated booking", appointmentDate: "2026-08-10T18:00:00.000Z", appointmentEnd: "2026-08-10T18:30:00.000Z" }),
		];
		const mock = scheduleMock({ userId: ARTIST_ID, date: DATE, items });
		// The new booking being scheduled: 2:30 PM start, 60 minutes long -> ends 3:30 PM.
		renderSchedule({ mocks: [mock], date: "2026-08-10T14:30:00.000Z", durationMinutes: 60 });

		expect(await screen.findByText(/1 conflict/)).toBeInTheDocument();
		const clashItem = screen.getByText("Overlapping booking").closest("li");
		const clearItem = screen.getByText("Unrelated booking").closest("li");
		expect(clashItem).toHaveClass("dayScheduleItemClash");
		expect(within(clearItem).queryByText("overlaps")).not.toBeInTheDocument();
		expect(within(clashItem).getByText("overlaps")).toBeInTheDocument();
	});
});
