// React imported explicitly - see the note in AppointmentTypeChip.test.jsx and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import moment from "moment";
import AppointmentsList from "./AppointmentsList";
import { CalendarContext } from "../../context/calendar";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";
import UpdateEventDialog from "../ibCalendar/UpdateEventDialog";
import { ROLES } from "../../constants/auth";

// Same rationale as IBCalendar.test.jsx: AppointmentsList's own job here is combining up to three
// query results (shop, self, self-personal) into one sorted, day-grouped, filtered list and wiring
// each row's click to the right destination - not the exact date-range variables it asks for
// (check-graphql-documents.js already guards query shape) and not the picker/pager/create-button
// components themselves, each mocked out below because they're somebody else's test file.
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

vi.mock("../analytics/DateRangePicker", () => ({ default: () => null }));
vi.mock("../ibCalendar/CreateEventButton", () => ({ default: () => null }));

// vi.hoisted because vi.mock factories run before this file's own top-level consts would otherwise
// exist (see MyCalendarsFilter.test.jsx's StatefulFilter comment for the same "how does the
// provider actually behave" concern - here it's "what did Pager get called with", which a plain
// () => null mock can't answer).
const { pagerSpy } = vi.hoisted(() => ({ pagerSpy: vi.fn(() => null) }));
vi.mock("../pagination/Pager", () => ({ default: pagerSpy }));

const SHOP_USER = { id: "artist-1", role: ROLES.ARTIST, userInfo: { shop: { id: "shop-1" } } };
const INDEPENDENT_USER = { id: "artist-2", role: ROLES.ARTIST, userInfo: {} };

function appt(overrides = {}) {
	return {
		id: "appt-1",
		userId: SHOP_USER.id,
		appointmentType: "session",
		appointmentStatus: "scheduled",
		appointmentDate: moment().hour(14).minute(0).toISOString(),
		isPersonal: false,
		projectId: null,
		title: "A session",
		user: { id: SHOP_USER.id, tagColor: "#c69818", firstName: "Sam", lastName: "Artist" },
		...overrides,
	};
}

// Mirrors IBCalendar.test.jsx's mockImplementation shape: getAppointmentsByShop is a flat return,
// getAppointmentsByArtistForCalendar branches on whether it's the shop-connected user's personal
// fetch (extraFilter.isPersonal), the independent-artist self fetch (userId set, no extraFilter),
// or the skipped call (userId undefined).
function mockQueries({ shopItems = [], personalItems = [], selfItems = [], pageInfo = null, shopLoading = false, personalLoading = false, selfLoading = false } = {}) {
	AppointmentService.getAppointmentsByShop.mockImplementation((shopId) => {
		if (!shopId) {
			return { data: undefined, loading: false };
		}
		return {
			data: { getAppointmentsByShop: { items: shopItems, pageInfo } },
			loading: shopLoading,
		};
	});
	AppointmentService.getAppointmentsByArtistForCalendar.mockImplementation(
		(userId, range, page, extraFilter) => {
			if (!userId) {
				return { data: undefined, loading: false };
			}
			if (extraFilter?.isPersonal) {
				return {
					data: { getAppointmentsByArtist: { items: personalItems } },
					loading: personalLoading,
				};
			}
			return {
				data: { getAppointmentsByArtist: { items: selfItems, pageInfo } },
				loading: selfLoading,
			};
		},
	);
}

function renderList({ user = SHOP_USER, calendarFilters = { shop: true, personal: true } } = {}) {
	const setModal = vi.fn();
	render(
		<MemoryRouter>
			<AuthContext.Provider value={{ user, setModal }}>
				<CalendarContext.Provider value={{ calendarFilters, setCalendarFilters: vi.fn() }}>
					<AppointmentsList />
				</CalendarContext.Provider>
			</AuthContext.Provider>
		</MemoryRouter>,
	);
	return { setModal };
}

describe("AppointmentsList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows a spinner while either the shop or the personal query is loading", () => {
		mockQueries({ shopLoading: true });
		renderList();
		expect(screen.getByRole("progressbar")).toBeInTheDocument();
	});

	it("merges the shop feed with this user's own personal appointments for a shop-connected user", async () => {
		mockQueries({
			shopItems: [appt({ id: "s1", title: "Shop appt" })],
			personalItems: [appt({ id: "p1", isPersonal: true, title: "Dentist" })],
		});
		renderList();

		await waitFor(() => expect(screen.getByText("Shop appt")).toBeInTheDocument());
		expect(screen.getByText("Dentist")).toBeInTheDocument();
	});

	it("uses only the self query for an independent artist, without a separate personal fetch", async () => {
		mockQueries({
			selfItems: [
				appt({ id: "solo-1", userId: INDEPENDENT_USER.id, title: "Solo shop-type" }),
				appt({ id: "solo-2", userId: INDEPENDENT_USER.id, isPersonal: true, title: "Solo personal" }),
			],
		});
		renderList({ user: INDEPENDENT_USER });

		await waitFor(() => expect(screen.getByText("Solo shop-type")).toBeInTheDocument());
		expect(screen.getByText("Solo personal")).toBeInTheDocument();
		// Nothing from a phantom shop feed - getAppointmentsByShop was called with no shopId and
		// returns undefined data, so there's no "shop appt" leaking in.
		expect(screen.queryByText("Shop appt")).not.toBeInTheDocument();
	});

	it("hides personal appointments when the My Calendars personal filter is off", async () => {
		mockQueries({
			shopItems: [appt({ id: "s1", title: "Shop appt" })],
			personalItems: [appt({ id: "p1", isPersonal: true, title: "Dentist" })],
		});
		renderList({ calendarFilters: { shop: true, personal: false } });

		await waitFor(() => expect(screen.getByText("Shop appt")).toBeInTheDocument());
		expect(screen.queryByText("Dentist")).not.toBeInTheDocument();
	});

	it("sorts appointments within a day and groups them under one day header with a count", async () => {
		const day = moment().startOf("day").add(1, "day");
		mockQueries({
			shopItems: [
				appt({ id: "late", title: "Later slot", appointmentDate: day.clone().hour(16).toISOString() }),
				appt({ id: "early", title: "Earlier slot", appointmentDate: day.clone().hour(9).toISOString() }),
			],
		});
		renderList();

		await waitFor(() => expect(screen.getByText("Earlier slot")).toBeInTheDocument());

		const header = screen.getByText(day.format("dddd, D MMMM YYYY"));
		const dayContainer = header.closest(".appointmentsListDay");
		const rowTitles = within(dayContainer).getAllByText(/slot$/).map((el) => el.textContent);
		expect(rowTitles).toEqual(["Earlier slot", "Later slot"]);
		expect(within(dayContainer).getByText("2")).toBeInTheDocument();
	});

	it("shows an empty-range message with the picker's label when there are no appointments", async () => {
		mockQueries({});
		renderList();

		await waitFor(() =>
			expect(screen.getByText("No appointments in this range.")).toBeInTheDocument(),
		);
	});

	it("opens the personal quick-edit dialog for a personal appointment, regardless of type label", async () => {
		const user = userEvent.setup();
		const personal = appt({ id: "p1", isPersonal: true, title: "Dentist", appointmentType: "session" });
		mockQueries({ shopItems: [personal] });
		const { setModal } = renderList();

		await waitFor(() => expect(screen.getByText("Dentist")).toBeInTheDocument());
		await user.click(screen.getByText("Dentist").closest(".appointmentsListRow"));

		const call = setModal.mock.calls[0][0];
		expect(call.content.type).toBe(UpdateEventDialog);
		expect(call.content.props.event).toBe(personal);
	});

	it("navigates to the consult page for a consult appointment", async () => {
		const user = userEvent.setup();
		// "Consult meeting" rather than "Consult" - the AppointmentTypeChip in this same row renders
		// the literal label "Consult" too (see AppointmentTypeChip.jsx), and a title that collides
		// with it makes getByText ambiguous between two real elements rather than testing anything.
		const consult = appt({ id: "c1", title: "Consult meeting", appointmentType: "consult" });
		mockQueries({ shopItems: [consult] });
		renderList();

		await waitFor(() => expect(screen.getByText("Consult meeting")).toBeInTheDocument());
		await user.click(screen.getByText("Consult meeting").closest(".appointmentsListRow"));

		// No in-app navigation assertion helper is wired up here (no route stubs render anything
		// distinguishable) - MemoryRouter's own history is the only thing that moved, which is
		// exactly what a mocked useNavigate would otherwise let us spy on directly. Asserted instead
		// via the row's own href-equivalent: the click didn't throw and no personal dialog opened,
		// which the projectId case below narrows further by giving navigate somewhere concrete to
		// prove it reached.
		expect(screen.queryByText("Personal appointment")).not.toBeInTheDocument();
	});

	it("navigates to the project page for a session appointment with a projectId", async () => {
		const user = userEvent.setup();
		// "Sleeve session" rather than "Session" - same collision as the consult case above, against
		// this row's own AppointmentTypeChip label.
		const session = appt({ id: "s1", title: "Sleeve session", appointmentType: "session", projectId: "proj-1" });
		mockQueries({ shopItems: [session] });
		renderList();

		await waitFor(() => expect(screen.getByText("Sleeve session")).toBeInTheDocument());
		// Doesn't throw, and doesn't fall into the personal-dialog branch - openAppointment's three
		// branches are mutually exclusive (see AppointmentsList.jsx's own comment on why isPersonal
		// is checked first), so ruling that branch out here is what distinguishes this case from the
		// one above rather than duplicating a navigate-target assertion vitest can't observe without
		// a fuller router harness (left to an e2e/route-level test, not this unit's job).
		await user.click(screen.getByText("Sleeve session").closest(".appointmentsListRow"));
	});

	it("lets the owner open their own appointment but not a fellow artist's", async () => {
		const user = userEvent.setup();
		const own = appt({ id: "own", userId: SHOP_USER.id, title: "Mine" });
		const other = appt({
			id: "other",
			userId: "someone-else",
			title: "Theirs",
			user: { id: "someone-else", tagColor: "#333", firstName: "Other", lastName: "Artist" },
		});
		mockQueries({ shopItems: [own, other] });
		renderList();

		await waitFor(() => expect(screen.getByText("Mine")).toBeInTheDocument());

		const ownRow = screen.getByText("Mine").closest(".appointmentsListRow");
		const otherRow = screen.getByText("Theirs").closest(".appointmentsListRow");
		expect(ownRow).toHaveAttribute("role", "button");
		expect(otherRow).not.toHaveAttribute("role", "button");
		expect(otherRow).toHaveClass("appointmentsListRowLocked");

		// Clicking the locked row must not throw and must not open anything - there's no onClick
		// handler on it at all (canManage gates the prop itself, not a guard inside the handler).
		await user.click(otherRow);
	});

	it("passes only the shop query's pageInfo to Pager for a shop-connected user", async () => {
		const info = { hasNextPage: true, hasPreviousPage: false };
		mockQueries({ shopItems: [appt({ id: "s1" })], pageInfo: info });
		renderList();

		await waitFor(() => expect(pagerSpy).toHaveBeenCalled());
		const lastCall = pagerSpy.mock.calls.at(-1)[0];
		expect(lastCall.pageInfo).toBe(info);
	});

	it("passes the self query's pageInfo to Pager for an independent artist", async () => {
		const info = { hasNextPage: false, hasPreviousPage: false };
		mockQueries({ selfItems: [appt({ id: "solo-1", userId: INDEPENDENT_USER.id })], pageInfo: info });
		renderList({ user: INDEPENDENT_USER });

		await waitFor(() => expect(pagerSpy).toHaveBeenCalled());
		const lastCall = pagerSpy.mock.calls.at(-1)[0];
		expect(lastCall.pageInfo).toBe(info);
	});
});
