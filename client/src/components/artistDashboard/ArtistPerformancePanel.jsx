import React from "react";
import { useNavigate } from "react-router-dom";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import { AppointmentService } from "../../services/AppointmentService";
import ProjectService from "../../services/ProjectService";
import ShopCutPayoutList from "./ShopCutPayoutList";
import { ROUTE_CONSTANTS } from "../../constants";
import "./artistPerformancePanel.css";

// Appointment.shopCutStatus values that represent money the artist still owes the shop - see
// models/Appointment.js's own comment on the full lifecycle. 'none'/'paid'/'received' are
// deliberately excluded (nothing currently owed).
const SHOP_CUT_OWED_STATUSES = ["unpaid", "invoice_sent", "pending_confirmation"];

const formatCurrency = (amount) =>
	`$${Math.round(amount || 0).toLocaleString()}`;

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

	const revenueMTD = appointments
		.filter((a) => isSameMonth(new Date(a.appointmentDate), now))
		.reduce((sum, a) => sum + (a.total || 0) + (a.tip || 0), 0);
	const revenueYTD = appointments
		.filter((a) => isSameYear(new Date(a.appointmentDate), now))
		.reduce((sum, a) => sum + (a.total || 0) + (a.tip || 0), 0);

	const shopCutOwedMTD = appointments
		.filter(
			(a) =>
				isSameMonth(new Date(a.appointmentDate), now) &&
				SHOP_CUT_OWED_STATUSES.includes(a.shopCutStatus),
		)
		.reduce((sum, a) => sum + (a.shopCutAmount || 0), 0);
	const shopCutOwedYTD = appointments
		.filter(
			(a) =>
				isSameYear(new Date(a.appointmentDate), now) &&
				SHOP_CUT_OWED_STATUSES.includes(a.shopCutStatus),
		)
		.reduce((sum, a) => sum + (a.shopCutAmount || 0), 0);

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
					<div className="artistStatValue">{formatCurrency(revenueMTD)}</div>
				</div>
				<div className="artistStatCard">
					<div className="artistStatLabel">Revenue (YTD)</div>
					<div className="artistStatValue">{formatCurrency(revenueYTD)}</div>
				</div>
				<div className="artistStatCard">
					<div className="artistStatLabel">Shop Cut Owed (MTD)</div>
					<div className="artistStatValue">{formatCurrency(shopCutOwedMTD)}</div>
				</div>
				<div className="artistStatCard">
					<div className="artistStatLabel">Shop Cut Owed (YTD)</div>
					<div className="artistStatValue">{formatCurrency(shopCutOwedYTD)}</div>
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
							<li
								key={appt.id}
								className={
									appt.projectId
										? "artistUpcomingItem artistUpcomingItemClickable"
										: "artistUpcomingItem"
								}
								// Only session appointments carry a projectId today - convertBookingRequest
								// (mutations/bookingRequests.js) auto-creates a Project for a session_booked
								// outcome, but deliberately does not for consult_booked (see that resolver's
								// own comment). A pure consult or "other" appointment has no projectId, so
								// those rows just aren't clickable.
								onClick={
									appt.projectId
										? () => navigate(`${ROUTE_CONSTANTS.PROJECT}${appt.projectId}`)
										: undefined
								}
							>
								<span className="artistUpcomingDate">
									{new Date(appt.appointmentDate).toLocaleDateString(undefined, {
										month: "short",
										day: "numeric",
										year: "numeric",
									})}
								</span>
								<span className="artistUpcomingTitle">
									{/* Was appt.title alone - a session/consult Appointment never
									    actually has its own title (the wizard never sets one for
									    those types - see AppointmentWizard.jsx), the title lives on
									    its Project instead. Falling back to appt.title first still
									    covers "other" appointments, which do have a real title. */}
									{appt.title || appt.project?.title || "(untitled appointment)"}
								</span>
								<span className="artistUpcomingType">{appt.appointmentType}</span>
							</li>
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
