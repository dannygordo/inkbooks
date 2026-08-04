import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import { AppointmentService } from "../../services/AppointmentService";
import ProjectService from "../../services/ProjectService";
import ShopCutPayoutList from "./ShopCutPayoutList";
import { ROUTE_CONSTANTS } from "../../constants";
import { formatCents } from "../../utils/money";
import { tagColorRowStyle } from "../../utils/tagColor";
import "./artistPerformancePanel.css";

// Appointment.shopCutStatus values that represent money the artist still owes the shop - see
// models/Appointment.js's own comment on the full lifecycle. 'none'/'paid'/'received' are
// deliberately excluded (nothing currently owed).
const SHOP_CUT_OWED_STATUSES = ["unpaid", "invoice_sent", "pending_confirmation"];


const isSameMonth = (date, reference) =>
	date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear();

const isSameYear = (date, reference) => date.getFullYear() === reference.getFullYear();

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
	const { data: apptData, loading: apptLoading, refetch: refetchAppointments } =
		AppointmentService.getAppointmentsByArtist(artistUserId);
	const { data: projData, loading: projLoading } =
		ProjectService.fetchProjectsByArtist(artistUserId);

	if (apptLoading || projLoading) {
		return <IBPageLoader />;
	}

	const now = new Date();
	const appointments = (apptData && apptData.getAppointmentsByArtist) || [];
	const activeProjectsCount = ((projData && projData.getProjectsByArtist) || []).length;

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

	const inMonth = appointments.filter((a) => isSameMonth(new Date(a.appointmentDate), now));
	const inYear = appointments.filter((a) => isSameYear(new Date(a.appointmentDate), now));

	// Was `total + tip`, which only worked because the old `total` happened to exclude the tip.
	// totalCents is now what the client actually paid - subtotal + tax + fee + tip - so adding
	// tipCents on top would double-count every tip.
	const revenueMTD = inMonth.reduce((sum, a) => sum + (a.totalCents || 0), 0);
	const revenueYTD = inYear.reduce((sum, a) => sum + (a.totalCents || 0), 0);

	// Tips, tracked on their own. They're the artist's alone - never part of the shop cut - and
	// they're the figure most artists actually want to watch, which is exactly why folding them
	// into a single revenue number made them impossible to see.
	//
	// The average is over appointments that ACTUALLY RECEIVED a tip, not over all of them.
	// Dividing by every appointment would drag the average toward zero with consults, cancelled
	// sessions and anything else that was never going to be tipped, and answer a question nobody
	// asked. This answers "when I get tipped, how much?".
	const tipsMTD = inMonth.reduce((sum, a) => sum + (a.tipCents || 0), 0);
	const tipsYTD = inYear.reduce((sum, a) => sum + (a.tipCents || 0), 0);
	const tippedYTD = inYear.filter((a) => (a.tipCents || 0) > 0);
	const averageTipYTD = tippedYTD.length
		? Math.round(tipsYTD / tippedYTD.length)
		: 0;

	const shopCutOwedMTD = appointments
		.filter(
			(a) =>
				isSameMonth(new Date(a.appointmentDate), now) &&
				SHOP_CUT_OWED_STATUSES.includes(a.shopCutStatus),
		)
		.reduce((sum, a) => sum + (a.shopCutCents || 0), 0);
	const shopCutOwedYTD = appointments
		.filter(
			(a) =>
				isSameYear(new Date(a.appointmentDate), now) &&
				SHOP_CUT_OWED_STATUSES.includes(a.shopCutStatus),
		)
		.reduce((sum, a) => sum + (a.shopCutCents || 0), 0);

	// Only 'completed' sessions - see PRODUCTION_ROADMAP.md's Phase 7 section: a shop cut isn't
	// actually payable until the session itself is done, matching SessionDetail's own close-session
	// gate (appointmentStatus: 'completed'). 'unpaid' only (not invoice_sent/pending_confirmation -
	// those already have an action in flight, nothing new to do here until they resolve).
	const payoutCandidates = appointments.filter(
		(a) =>
			a.appointmentStatus === "completed" &&
			a.shopCutStatus === "unpaid" &&
			a.shopId,
	);

	return (
		<div className="artistPerformancePanel">
			<div className="artistPerformanceStats">
				<div className="artistStatCard">
					<div className="artistStatLabel">Revenue (MTD)</div>
					<div className="artistStatValue">{formatCents(revenueMTD)}</div>
				</div>
				<div className="artistStatCard">
					<div className="artistStatLabel">Revenue (YTD)</div>
					<div className="artistStatValue">{formatCents(revenueYTD)}</div>
				</div>
				{/* Tips get their own cards rather than being folded into revenue: they're the
				    artist's alone (never part of the shop cut), and they're the number most
				    artists actually track. */}
				<div className="artistStatCard">
					<div className="artistStatLabel">Tips (MTD)</div>
					<div className="artistStatValue">{formatCents(tipsMTD)}</div>
				</div>
				<div className="artistStatCard">
					<div className="artistStatLabel">Tips (YTD)</div>
					<div className="artistStatValue">{formatCents(tipsYTD)}</div>
				</div>
				<div className="artistStatCard">
					<div className="artistStatLabel">Avg Tip (YTD)</div>
					<div className="artistStatValue">{formatCents(averageTipYTD)}</div>
					{/* Stated explicitly - an average that silently included un-tipped
					    appointments would read much lower and mean something else entirely. */}
					<div className="artistStatSubLabel">
						across {tippedYTD.length} tipped appointment
						{tippedYTD.length === 1 ? "" : "s"}
					</div>
				</div>
				<div className="artistStatCard">
					<div className="artistStatLabel">Shop Cut Owed (MTD)</div>
					<div className="artistStatValue">{formatCents(shopCutOwedMTD)}</div>
				</div>
				<div className="artistStatCard">
					<div className="artistStatLabel">Shop Cut Owed (YTD)</div>
					<div className="artistStatValue">{formatCents(shopCutOwedYTD)}</div>
				</div>
				<div className="artistStatCard">
					<div className="artistStatLabel">Active Projects</div>
					<div className="artistStatValue">{activeProjectsCount}</div>
				</div>
			</div>
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
