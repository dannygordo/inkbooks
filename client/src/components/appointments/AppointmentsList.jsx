import { useMemo, useState } from "react";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import { useAuth } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";
import DateRangePicker from "../analytics/DateRangePicker";
import AppointmentTypeChip from "./AppointmentTypeChip";
import { getDefaultRange } from "../../utils/dateRanges";
import { ROUTE_CONSTANTS } from "../../constants";
import "./appointmentsList.css";

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
	const [range, setRange] = useState(getDefaultRange);

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

	const shopId = user.userInfo?.shop?.id;
	const { data: shopData, loading: shopLoading } = AppointmentService.getAppointmentsByShop(
		shopId,
		filter
	);
	const { data: artistData, loading: artistLoading } =
		AppointmentService.getAppointmentsByArtistForCalendar(shopId ? undefined : user.id, filter);

	const loading = shopId ? shopLoading : artistLoading;

	// Both queries fetch a single page of 200 - a limit chosen for the calendar, which only ever
	// asks for one month. A list can be pointed at twelve, and a busy shop will exceed it.
	//
	// Surfaced rather than paged, for now, because a truncated list that says nothing is the worst
	// of the three options: it looks complete and is not, and the person reconciling against it has
	// no way to know. Paging is the better answer and is a bigger change than this one.
	const pageInfo = shopId
		? shopData?.getAppointmentsByShop?.pageInfo
		: artistData?.getAppointmentsByArtist?.pageInfo;
	const truncated = Boolean(pageInfo?.hasMore);

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
				<DateRangePicker value={range} onChange={setRange} />
			</div>

			{loading && (
				<div className="appointmentsListLoading">
					<CircularProgress size="24px" />
				</div>
			)}

			{!loading && truncated && (
				<div className="appointmentsListTruncated">
					Showing the first {appointments.length} of {pageInfo.totalCount}. Narrow the
					date range to see the rest.
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
							<div
								className="appointmentsListRow"
								key={appt.id}
								onClick={() => openAppointment(appt)}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										openAppointment(appt);
									}
								}}
							>
								<span className="appointmentsListTime">
									{moment(appt.appointmentDate).format("h:mm A")}
								</span>
								<AppointmentTypeChip type={appt.appointmentType} size="small" />
								<span className="appointmentsListTitle">
									{appt.project?.title || appt.title || "(untitled appointment)"}
								</span>
								{/* Only meaningful on a shop calendar, where rows belong to
								    different artists. An independent artist's list would repeat
								    their own name on every line. */}
								{shopId && appt.user && (
									<span className="appointmentsListArtist">
										{appt.user.firstName} {appt.user.lastName}
									</span>
								)}
							</div>
						))}
					</div>
				))}
		</div>
	);
};

export default AppointmentsList;
