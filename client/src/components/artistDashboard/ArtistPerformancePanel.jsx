import React from "react";
import { useNavigate } from "react-router-dom";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import { AppointmentService } from "../../services/AppointmentService";
import ProjectService from "../../services/ProjectService";
import ShopCutPayoutList from "./ShopCutPayoutList";
import { ROUTE_CONSTANTS } from "../../constants";
import { formatCents } from "../../utils/money";
import "./artistPerformancePanel.css";

// Appointment.shopCutStatus values that represent money the artist still owes the shop - see
// models/Appointment.js's own comment on the full lifecycle. 'none'/'paid'/'received' are
// deliberately excluded (nothing currently owed).
const SHOP_CUT_OWED_STATUSES = ["unpaid", "invoice_sent", "pending_confirmation"];


const isSameMonth = (date, reference) =>
	date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear();

const isSameYear = (date, reference) => date.getFullYear() === reference.getFullYear();

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
		.slice(0, 5);

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
						{upcoming.map((appt) => {
							// A session appointment carries a projectId - convertBookingRequest
							// (mutations/bookingRequests.js) auto-creates a Project for a session_booked
							// outcome. A consult never gets a Project of its own (deliberately - see that
							// resolver's own comment), but does carry a bookingRequestId, which is enough
							// to open ConsultDetail.jsx (its intake details + a "Convert to Session"
							// action). An "other" appointment, or a consult created before
							// bookingRequestId existed, has neither and just isn't clickable.
							const linkTo = appt.projectId
								? `${ROUTE_CONSTANTS.PROJECT}${appt.projectId}`
								: appt.appointmentType === "consult" && appt.bookingRequestId
								? `${ROUTE_CONSTANTS.CONSULT}${appt.id}`
								: null;
							return (
							<li
								key={appt.id}
								className={
									linkTo ? "artistUpcomingItem artistUpcomingItemClickable" : "artistUpcomingItem"
								}
								onClick={linkTo ? () => navigate(linkTo) : undefined}
							>
								<span className="artistUpcomingDate">
									{/* Was toLocaleDateString (date only) - the time matters just as much as
									    the date for an upcoming appointment, and wasn't shown here at all. */}
									{new Date(appt.appointmentDate).toLocaleString(undefined, {
										month: "short",
										day: "numeric",
										year: "numeric",
										hour: "numeric",
										minute: "2-digit",
									})}
								</span>
								<span className="artistUpcomingTitle">
									{/* convertBookingRequest now sets a real title at creation for both
									    consult (the client's name) and session (the Project's title) -
									    see that resolver's own comment. project?.title is still checked
									    first for a session as a defensive fallback (e.g. a record from
									    before that fix), and "(untitled appointment)" only for the
									    genuinely stale case where neither exists. */}
									{appt.project?.title || appt.title || "(untitled appointment)"}
								</span>
								<span className="artistUpcomingType">{appt.appointmentType}</span>
							</li>
							);
						})}
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
