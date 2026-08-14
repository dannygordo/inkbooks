// React imported explicitly: under Vitest, @vitejs/plugin-react compiles JSX with the CLASSIC
// runtime, so a component rendered by a test needs React in scope or it throws "React is not
// defined" - in that test's file, not this one. See vite.config.js and
// scripts/check-react-in-tested-components.mjs.
import React, { useMemo, useState } from "react";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import { useAuth } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";
import DateRangePicker from "../analytics/DateRangePicker";
import AppointmentTypeChip from "./AppointmentTypeChip";
import Pager from "../pagination/Pager";
import CreateEventButton from "../ibCalendar/CreateEventButton";
import { buildScheduleRanges, getDefaultScheduleRange } from "../../utils/dateRanges";
import { tagColorRowStyle } from "../../utils/tagColor";
import { canManageAppointment } from "../../utils/permissions";
import { ROUTE_CONSTANTS } from "../../constants";
import "./appointmentsList.css";

// Matches server/utils/validation.js's appointmentStatus enum exactly (scheduled, completed,
// rescheduled, cancelled, no_show) - just humanized for display. Kept local rather than shared:
// ClientDashboard.jsx renders the raw value today, and unifying that is a separate change this
// task didn't ask for.
const APPOINTMENT_STATUS_LABELS = {
	scheduled: "Scheduled",
	completed: "Completed",
	rescheduled: "Rescheduled",
	cancelled: "Cancelled",
	no_show: "No-show",
};

/**
 * One row, with its own hover state.
 *
 * Extracted purely because the tint has a hover variant and hover has to be per-row state - the
 * same shape ArtistPerformancePanel's row uses, for the same reason. Keeping it in the parent would
 * mean one hovered id threaded through the map, which is the same thing written worse.
 */
const AppointmentRow = ({ appointment, tinted, showArtist, onOpen, canManage }) => {
	const [hovered, setHovered] = useState(false);
	return (
		<div
			className={
				canManage ? "appointmentsListRow" : "appointmentsListRow appointmentsListRowLocked"
			}
			style={tinted ? tagColorRowStyle(appointment.user?.tagColor, hovered && canManage) : undefined}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			// Viewable on a shared shop calendar regardless of whose appointment it is - that's the
			// whole point of a shop calendar. Only OPENING it (which leads to the session/consult
			// management view) is restricted - see utils/permissions.js's own comment on why this is
			// presentation for a server rule that already exists, not a new one invented here.
			onClick={canManage ? () => onOpen(appointment) : undefined}
			role={canManage ? "button" : undefined}
			tabIndex={canManage ? 0 : undefined}
			title={canManage ? undefined : "You can only open your own appointments"}
			onKeyDown={
				canManage
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onOpen(appointment);
							}
					  }
					: undefined
			}
		>
			<span className="appointmentsListTime">
				{moment(appointment.appointmentDate).format("h:mm A")}
			</span>
			{/* Fixed-width wrapper, not the chip alone - "Consult" and "Session" render at
			    different natural widths, which pushed every column after this one out of
			    alignment from row to row. Every column below has the same fixed-width treatment
			    for the same reason. */}
			<span className="appointmentsListType">
				<AppointmentTypeChip type={appointment.appointmentType} size="small" />
			</span>
			<span className="appointmentsListTitle">
				{appointment.project?.title || appointment.title || "(untitled appointment)"}
			</span>
			{/* Client name - the project's client for a session, the booking request's for a
			    consult (a consult has no Project of its own yet - see models/Appointment.js). */}
			<span className="appointmentsListClient">
				{appointment.project?.client?.user
					? `${appointment.project.client.user.firstName} ${appointment.project.client.user.lastName}`
					: appointment.bookingRequest?.client
					? `${appointment.bookingRequest.client.firstName} ${appointment.bookingRequest.client.lastName}`
					: ""}
			</span>
			<span className="appointmentsListStatus">
				{APPOINTMENT_STATUS_LABELS[appointment.appointmentStatus] ||
					appointment.appointmentStatus}
			</span>
			{/* Only meaningful on a shop calendar, where rows belong to different artists. An
			    independent artist's list would repeat their own name on every line. Always
			    rendered (with an empty fallback) rather than only when appointment.user exists, so
			    a row missing that data doesn't lose the column and throw off every row under it. */}
			{showArtist && (
				<span className="appointmentsListArtist">
					{appointment.user ? `${appointment.user.firstName} ${appointment.user.lastName}` : ""}
				</span>
			)}
		</div>
	);
};

/**
 * The appointments page as a list, over a date range.
 *
 * The calendar answers "what does my month look like". This answers questions a month grid is bad
 * at: everything in a window, in order, scannable, without clicking into day cells - "what did I
 * do last quarter", "what's coming in the next fortnight".
 *
 * The RANGE is the reason this needs its own filter rather than reusing the calendar's month. A
 * calendar is inherently scoped to the grid on screen; a list is only useful if you can ask it for
 * an arbitrary window. It reuses the same DateRangePicker as both dashboards so that "this month"
 * means one thing everywhere - two components rounding boundaries differently would produce a list
 * and a dashboard figure that don't reconcile, with nothing on screen explaining why.
 *
 * Which query fires mirrors IBCalendar exactly: a shop-connected artist reads the shop's
 * appointments, an independent artist reads their own. Both hooks are always called (hooks cannot
 * be conditional) and each skips itself when its own id is missing, so only one runs. Copying that
 * rule rather than inventing a second one - an independent artist's calendar was once permanently
 * empty precisely because a query had no fallback.
 */
const AppointmentsList = () => {
	const { user } = useAuth();
	const navigate = useNavigate();
	// Opens on THIS WEEK, not this month. A schedule is read forward and at working-week
	// resolution; a month of appointments is a scroll, not an answer.
	const [range, setRange] = useState(getDefaultScheduleRange);

	// The picker's range carries display metadata; the server filter wants only the bounds. The end
	// is already exclusive (see utils/dateRanges.js), which matches the server's half-open
	// [from, to) convention - so this is a rename, not a conversion.
	const filter = useMemo(
		() =>
			range?.start && range?.end
				? { from: moment(range.start).toISOString(), to: moment(range.end).toISOString() }
				: null,
		[range]
	);

	// 50 a page. Enough that most ranges are one page, few enough that the browser isn't rendering
	// a thousand rows nobody scrolled to.
	const [page, setPage] = useState({ limit: 50, offset: 0 });

	// Back to the first page whenever the RANGE changes. Without this, moving from a year to a week
	// while on page 4 asks for rows 150-200 of a set that now has eleven, and the screen goes blank
	// with no explanation - the classic paging bug, and the one people report as "it lost my data".
	const setRangeAndReset = (next) => {
		setRange(next);
		setPage((prev) => ({ ...prev, offset: 0 }));
	};

	const shopId = user.userInfo?.shop?.id;
	const { data: shopData, loading: shopLoading } = AppointmentService.getAppointmentsByShop(
		shopId,
		filter,
		page
	);
	const { data: artistData, loading: artistLoading } =
		AppointmentService.getAppointmentsByArtistForCalendar(
			shopId ? undefined : user.id,
			filter,
			page
		);

	const loading = shopId ? shopLoading : artistLoading;

	const pageInfo = shopId
		? shopData?.getAppointmentsByShop?.pageInfo
		: artistData?.getAppointmentsByArtist?.pageInfo;

	const appointments = useMemo(() => {
		const items = shopId
			? shopData?.getAppointmentsByShop?.items
			: artistData?.getAppointmentsByArtist?.items;
		// Sorted here rather than trusting arrival order: the two queries are paged and their
		// server-side ordering serves the calendar, which doesn't care. A list read top to bottom
		// does.
		return [...(items || [])].sort(
			(a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate)
		);
	}, [shopId, shopData, artistData]);

	// Grouped by day so the date is a heading rather than a column repeated down every row. Three
	// appointments on one Tuesday should say Tuesday once.
	const days = useMemo(() => {
		const grouped = new Map();
		for (const appt of appointments) {
			const key = moment(appt.appointmentDate).format("YYYY-MM-DD");
			if (!grouped.has(key)) {
				grouped.set(key, []);
			}
			grouped.get(key).push(appt);
		}
		return [...grouped.entries()];
	}, [appointments]);

	const openAppointment = (appt) => {
		// A consult has its own detail page; a session belongs to a project. Mirrors what the
		// calendar's day cells already do rather than introducing a third destination.
		if (appt.appointmentType === "consult") {
			navigate(`${ROUTE_CONSTANTS.CONSULT}${appt.id}`);
		} else if (appt.projectId) {
			navigate(`${ROUTE_CONSTANTS.PROJECT}${appt.projectId}`);
		}
	};

	return (
		<div className="appointmentsList">
			<div className="appointmentsListControls">
				<DateRangePicker
					value={range}
					onChange={setRangeAndReset}
					presets={buildScheduleRanges()}
				/>
				{/* Booking has to be reachable from whichever view you happen to be in. Sending
				    someone back to the calendar to make an appointment turns a view preference into
				    a workflow detour. Defaults to TODAY rather than to the calendar's last-clicked
				    day - see CreateEventButton. */}
				<CreateEventButton day={moment()} />
			</div>

			{loading && (
				<div className="appointmentsListLoading">
					<CircularProgress size="24px" />
				</div>
			)}

			{!loading && days.length === 0 && (
				<div className="appointmentsListEmpty">
					No appointments in this range.
					{/* Says which range, because an empty list is otherwise ambiguous between "you
					    have nothing booked" and "you are looking at the wrong window". */}
					<div className="appointmentsListEmptyHint">{range?.label}</div>
				</div>
			)}

			{!loading &&
				days.map(([dayKey, dayAppointments]) => (
					<div className="appointmentsListDay" key={dayKey}>
						<div className="appointmentsListDayHeader">
							{moment(dayKey, "YYYY-MM-DD").format("dddd, D MMMM YYYY")}
							<span className="appointmentsListDayCount">
								{dayAppointments.length}
							</span>
						</div>
						{dayAppointments.map((appt) => (
							<AppointmentRow
								key={appt.id}
								appointment={appt}
								tinted={Boolean(shopId)}
								showArtist={Boolean(shopId)}
								onOpen={openAppointment}
								// Own appointment always manageable; on an independent artist's list
								// (no shopId) every row is already their own regardless. See
								// utils/permissions.js - this is what turns "viewing is allowed, opening
								// isn't" from the user's report into an actual disabled click.
								canManage={canManageAppointment(user, appt)}
							/>
						))}
					</div>
				))}

			{/* Renders nothing when it all fits on one page, so a short range stays clean. */}
			{!loading && <Pager pageInfo={pageInfo} onChange={setPage} />}
		</div>
	);
};

export default AppointmentsList;
