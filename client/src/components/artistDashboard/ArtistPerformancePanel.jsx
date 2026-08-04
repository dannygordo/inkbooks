import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import DateRangePicker from "../analytics/DateRangePicker";
import StatCard from "../analytics/StatCard";
import AnalyticsService from "../../services/AnalyticsService";
import { getDefaultRange } from "../../utils/dateRanges";
import { AppointmentService } from "../../services/AppointmentService";
import ShopCutPayoutList from "./ShopCutPayoutList";
import { ROUTE_CONSTANTS } from "../../constants";
import { formatCents } from "../../utils/money";
import { tagColorRowStyle } from "../../utils/tagColor";
import "./artistPerformancePanel.css";

// SHOP_CUT_OWED_STATUSES, isSameMonth and isSameYear all lived here and are gone: the figures
// they fed are now computed server-side over a selectable range (see server/utils/analytics.js),
// which is also what removed the last reason this component fetched the artist's project list -
// activeProjectCount comes back with the rest of the aggregate now.

// How many rows each appointment list shows. Shared by the upcoming and completed lists so
// "the same rules" is enforced by there being one rule, not two that happen to match today.
const APPOINTMENT_LIST_LIMIT = 5;

/**
 * Where an appointment row navigates to when clicked, or null if it isn't clickable.
 *
 * A session carries a projectId - convertBookingRequest (mutations/bookingRequests.js)
 * auto-creates a Project for a session_booked outcome. A consult never gets a Project of its own
 * (deliberately - see that resolver's comment), but does carry a bookingRequestId, which is enough
 * to open ConsultDetail.jsx. An "other" appointment, or a consult created before bookingRequestId
 * existed, has neither and isn't clickable.
 */
const appointmentLinkTo = (appt) => {
	if (appt.projectId) {
		return `${ROUTE_CONSTANTS.PROJECT}${appt.projectId}`;
	}
	if (appt.appointmentType === "consult" && appt.bookingRequestId) {
		return `${ROUTE_CONSTANTS.CONSULT}${appt.id}`;
	}
	return null;
};

/**
 * One appointment row. Extracted so the upcoming and completed lists share it outright rather than
 * being two near-identical blocks that drift the first time one of them is touched - the linking
 * rules, the date format and the title fallback chain are all decisions that should only exist in
 * one place.
 *
 * @param {boolean} showEarnings - completed sessions show what they brought in; an upcoming one
 *   has no money attached yet, so displaying a total there would be a prediction dressed up as a
 *   fact.
 */
const AppointmentRow = ({ appt, onNavigate, showEarnings = false }) => {
	const linkTo = appointmentLinkTo(appt);
	// Hover is tracked in state rather than left to a :hover rule because the tint is an inline
	// style built from per-artist data - CSS can't express "24% of whatever hex this row's artist
	// happens to have". The static parts of hovering (cursor, shadow, transition) stay in the
	// stylesheet; only the colour is driven from here.
	const [hovered, setHovered] = useState(false);
	return (
		<li
			className={
				linkTo ? "artistUpcomingItem artistUpcomingItemClickable" : "artistUpcomingItem"
			}
			style={tagColorRowStyle(appt.user?.tagColor, hovered && Boolean(linkTo))}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			onClick={linkTo ? () => onNavigate(linkTo) : undefined}
		>
			<span className="artistUpcomingDate">
				{/* Was toLocaleDateString (date only) - the time matters just as much as the date
				    for an appointment, and wasn't shown here at all. */}
				{new Date(appt.appointmentDate).toLocaleString(undefined, {
					month: "short",
					day: "numeric",
					year: "numeric",
					hour: "numeric",
					minute: "2-digit",
				})}
			</span>
			<span className="artistUpcomingTitle">
				{/* convertBookingRequest now sets a real title at creation for both consult (the
				    client's name) and session (the Project's title) - see that resolver's own
				    comment. project?.title is still checked first for a session as a defensive
				    fallback (e.g. a record from before that fix), and "(untitled appointment)"
				    only for the genuinely stale case where neither exists. */}
				{appt.project?.title || appt.title || "(untitled appointment)"}
			</span>
			{showEarnings && (
				<span className="artistUpcomingEarnings">
					{formatCents(appt.totalCents)}
					{appt.tipCents ? ` (${formatCents(appt.tipCents)} tip)` : ""}
				</span>
			)}
			<span className="artistUpcomingType">{appt.appointmentType}</span>
		</li>
	);
};

/**
 * Reusable artist performance summary - upcoming appointments, MTD/YTD revenue, MTD/YTD shop-cut
 * owed, and active project count. Mounted with different framing in two places (see
 * PRODUCTION_ROADMAP.md's dashboard/artist-page writeup for why these are the same data, scoped
 * differently rather than two separate implementations):
 *   - pages/home/Home.jsx: an artist's own view of their own numbers (isSelf=true).
 *   - pages/artists/Artist.jsx: a shop admin/staff's view into one specific artist (isSelf=false).
 *
 * All MTD/YTD math is computed client-side from getAppointmentsByArtist's full result set - fine
 * at today's data volume, but worth revisiting as a dedicated server-side aggregation resolver if
 * an artist's appointment history grows large enough that fetching every row becomes expensive.
 */
const ArtistPerformancePanel = ({ artistUserId, isSelf = false }) => {
	const navigate = useNavigate();
	const [range, setRange] = useState(getDefaultRange);

	// Two queries doing two different jobs, deliberately not merged.
	//
	// The FIGURES now come from the same server-side aggregation the shop dashboard uses
	// (server/utils/analytics.js), so an artist's own numbers and the shop's view of that artist
	// agree by construction rather than by two client-side implementations happening to match.
	// They also respond to the range picker, which client-side MTD/YTD constants could not.
	//
	// The LISTS still come from the appointment query, because "the next five appointments" needs
	// actual rows, not aggregates - and those two lists are not range-scoped: upcoming means
	// what's ahead of now, and recently-completed means the most recent regardless of which
	// window is selected. Range-scoping them would empty both for any historical range, which
	// reads as data loss rather than as a definition.
	const { data: analyticsData, loading: analyticsLoading } =
		AnalyticsService.getArtistAnalytics(artistUserId, range);
	const { data: apptData, loading: apptLoading, refetch: refetchAppointments } =
		AppointmentService.getAppointmentsByArtist(artistUserId);

	if (apptLoading && !apptData) {
		return <IBPageLoader />;
	}

	const now = new Date();
	const appointments = (apptData && apptData.getAppointmentsByArtist) || [];
	const analytics = analyticsData?.getArtistAnalytics;

	const upcoming = appointments
		.filter((a) => new Date(a.appointmentDate) >= now)
		.sort((a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate))
		.slice(0, APPOINTMENT_LIST_LIMIT);

	// The mirror of `upcoming`, and deliberately built the same way: same row component, same
	// clickability rules, same limit - just sorted newest-first, because the useful end of a
	// finished list is the recent end while the useful end of a pending one is the near end.
	//
	// Filtered on appointmentStatus rather than appointmentType === 'session'. The only thing in
	// the app that marks anything 'completed' is SessionDetail's "Close Session" (and the same
	// field on updateAppointment), which only exists for sessions - so in practice this IS the
	// completed-sessions list. Keying on status rather than type means a completed appointment
	// that isn't strictly typed as a session still shows up instead of silently vanishing, which
	// is the safer failure direction for a list an artist checks against their own memory.
	const completed = appointments
		.filter((a) => a.appointmentStatus === "completed")
		.sort((a, b) => new Date(b.appointmentDate) - new Date(a.appointmentDate))
		.slice(0, APPOINTMENT_LIST_LIMIT);

	// Only 'completed' sessions - see PRODUCTION_ROADMAP.md's Phase 7 section: a shop cut isn't
	// actually payable until the session itself is done, matching SessionDetail's own close-session
	// gate (appointmentStatus: 'completed'). 'unpaid' only (not invoice_sent/pending_confirmation -
	// those already have an action in flight, nothing new to do here until they resolve).
	// Not range-scoped either: what an artist owes is what they owe, not what they owed in March.
	const payoutCandidates = appointments.filter(
		(a) =>
			a.appointmentStatus === "completed" &&
			a.shopCutStatus === "unpaid" &&
			a.shopId,
	);

	return (
		<div className="artistPerformancePanel">
			<DateRangePicker value={range} onChange={setRange} />

			{/* The figures are aggregates over the selected range and come from the server; the
			    lists below are not range-scoped (see the note where they're built). Rendered from
			    `analytics` rather than from summed rows, so an artist's numbers and the shop's
			    view of the same artist are the same computation, not two that agree by luck.

			    Each card is one figure over one window instead of the old MTD/YTD pair - with a
			    picker, "Revenue (MTD)" next to a range control set to "last quarter" would be a
			    contradiction printed on the page. */}
			{analyticsLoading && !analytics ? (
				<IBPageLoader />
			) : (
				analytics && (
					<div className="artistPerformanceStats">
						<StatCard
							label="Revenue"
							value={formatCents(analytics.revenueCents)}
							// Worth stating: this changed. It used to count every appointment in
							// the window regardless of status, so an artist's "revenue" included
							// sessions that were merely booked. It's now completed work only.
							subLabel="completed appointments only"
						/>
						{/* Tips get their own card rather than being folded into revenue: they're
						    the artist's alone (never part of the shop cut), and they're the number
						    most artists actually track. */}
						<StatCard label="Tips" value={formatCents(analytics.tipsCents)} />
						<StatCard
							label="Average tip"
							value={formatCents(analytics.averageTipCents)}
							// Stated explicitly - an average that silently included un-tipped
							// appointments would read much lower and mean something else entirely.
							subLabel={`across ${analytics.tippedCount} tipped appointment${
								analytics.tippedCount === 1 ? "" : "s"
							}`}
						/>
						<StatCard
							label="Shop cut owed"
							value={formatCents(analytics.shopCutOutstandingCents)}
						/>
						<StatCard
							label="Shop cut awaiting confirmation"
							value={formatCents(analytics.shopCutAwaitingConfirmationCents)}
						/>
						<StatCard
							label="Sessions completed"
							value={analytics.completedSessionCount}
						/>
						{/* Not range-scoped - it means "right now". Labelled so it isn't
						    mysterious when it doesn't move as the range changes. */}
						<StatCard
							label="Active projects"
							value={analytics.activeProjectCount}
							subLabel="as of today, any range"
						/>
					</div>
				)
			)}
			<IBCardWrapper>
				<h2 className="artistPerformanceSectionTitle">
					{isSelf ? "Your Upcoming Appointments" : "Upcoming Appointments"}
				</h2>
				{upcoming.length === 0 ? (
					<div className="artistPerformanceEmpty">No upcoming appointments.</div>
				) : (
					<ul className="artistUpcomingList">
						{upcoming.map((appt) => (
							<AppointmentRow key={appt.id} appt={appt} onNavigate={navigate} />
						))}
					</ul>
				)}
			</IBCardWrapper>
			<IBCardWrapper>
				<h2 className="artistPerformanceSectionTitle">
					{isSelf ? "Your Completed Sessions" : "Completed Sessions"}
				</h2>
				{completed.length === 0 ? (
					<div className="artistPerformanceEmpty">No completed sessions yet.</div>
				) : (
					<ul className="artistUpcomingList">
						{completed.map((appt) => (
							<AppointmentRow
								key={appt.id}
								appt={appt}
								onNavigate={navigate}
								showEarnings
							/>
						))}
					</ul>
				)}
			</IBCardWrapper>
			{isSelf && (
				<IBCardWrapper>
					<h2 className="artistPerformanceSectionTitle">Shop Cut Payouts</h2>
					<ShopCutPayoutList
						appointments={payoutCandidates}
						onChanged={() => refetchAppointments()}
					/>
				</IBCardWrapper>
			)}
		</div>
	);
};

export default ArtistPerformancePanel;
