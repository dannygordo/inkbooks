import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import DateRangePicker from "../analytics/DateRangePicker";
import StatCard from "../analytics/StatCard";
import AnalyticsService from "../../services/AnalyticsService";
import { getDefaultRange } from "../../utils/dateRanges";
import { AppointmentService } from "../../services/AppointmentService";
import EntityListPager from "../entityList/EntityListPager";
import ShopCutPayoutList from "./ShopCutPayoutList";
import AppointmentTypeChip from "../appointments/AppointmentTypeChip";
import { useAuth } from "../../context/auth";
import { ROUTE_CONSTANTS } from "../../constants";
import { ROLES } from "../../constants/auth";
import { formatCents } from "../../utils/money";
import { tagColorRowStyle } from "../../utils/tagColor";
import "./artistPerformancePanel.css";

// Matches server/utils/validation.js's appointmentStatus enum. Same map as
// components/appointments/AppointmentsList.jsx - kept as a second copy rather than shared for now,
// since unifying it would also mean unifying ClientDashboard's raw-value rendering, which nothing
// here asked for.
const APPOINTMENT_STATUS_LABELS = {
	scheduled: "Scheduled",
	completed: "Completed",
	rescheduled: "Rescheduled",
	cancelled: "Cancelled",
	no_show: "No-show",
};

/**
 * The client name for one appointment row - the project's client for a session, the booking
 * request's for a consult (a consult has no Project of its own - see models/Appointment.js). Same
 * fallback chain as AppointmentsList.jsx's row.
 */
const appointmentClientName = (appt) => {
	if (appt.project?.client?.user) {
		return `${appt.project.client.user.firstName} ${appt.project.client.user.lastName}`;
	}
	if (appt.bookingRequest?.client) {
		return `${appt.bookingRequest.client.firstName} ${appt.bookingRequest.client.lastName}`;
	}
	return "";
};

/**
 * What one artist actually takes home in the selected range - revenue minus their FULL assessed
 * shop cut, not just the portion of it that's been settled.
 *
 * "By their percentage" means the cut applied at the moment the session was priced, which is
 * owed the instant the session is marked completed - not owed only once someone gets around to
 * paying or confirming it. So this has to subtract all three shopCutStatus buckets
 * (earned/paid, outstanding/unpaid, awaiting confirmation), not just earned - subtracting only
 * earned would overstate an artist's take by however much of their cut is still sitting unpaid or
 * unconfirmed, which is exactly backwards for a figure meant to answer "what does this person
 * actually keep".
 */
const artistTakeHomeCents = (row) =>
	(row.revenueCents || 0) -
	(row.shopCutEarnedCents || 0) -
	(row.shopCutOutstandingCents || 0) -
	(row.shopCutAwaitingConfirmationCents || 0);

// SHOP_CUT_OWED_STATUSES, isSameMonth and isSameYear all lived here and are gone: the figures
// they fed are now computed server-side over a selectable range (see server/utils/analytics.js),
// which is also what removed the last reason this component fetched the artist's project list -
// activeProjectCount comes back with the rest of the aggregate now.

// How many rows each appointment list shows BY DEFAULT. Shared by the upcoming and completed
// lists so "the same rules" is enforced by there being one rule, not two that happen to match
// today. Still just the initial page size, not a hard cap - see the pagers below.
const APPOINTMENT_LIST_LIMIT = 5;

// Smaller than EntityListPager's own default [10, 25, 50] - these are dashboard summaries, not a
// directory, so the smallest option matches APPOINTMENT_LIST_LIMIT rather than starting at double
// it.
const APPOINTMENT_PAGE_SIZE_OPTIONS = [5, 10, 25];

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
 * @param {boolean} showArtist - only true in shopWide mode (see the panel below): a shop admin's
 *   own dashboard showing every artist's appointments needs the artist named and colour-coded to
 *   tell the rows apart. A single artist's own list would just repeat their own name and colour
 *   on every row, so this stays off there.
 */
const AppointmentRow = ({ appt, onNavigate, showEarnings = false, showArtist = false }) => {
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
			<span className="artistUpcomingClient">{appointmentClientName(appt)}</span>
			<span className="artistUpcomingStatus">
				{APPOINTMENT_STATUS_LABELS[appt.appointmentStatus] || appt.appointmentStatus}
			</span>
			{/* Rendered whenever showArtist is on, even if appt.user is somehow missing - a
			    dropped column on one row would shift the fixed-width columns after it out of line
			    with every other row (see the CSS's own note on this). showArtist is one flag for
			    the whole list, not per-row, so this column's presence is already uniform; only the
			    empty-string fallback needs to be, too. */}
			{showArtist && (
				<span className="artistUpcomingArtist">
					{appt.user ? `${appt.user.firstName} ${appt.user.lastName}` : ""}
				</span>
			)}
			{showEarnings && (
				<span className="artistUpcomingEarnings">
					{formatCents(appt.totalCents)}
					{appt.tipCents ? ` (${formatCents(appt.tipCents)} tip)` : ""}
				</span>
			)}
			{/* Was the raw enum value in plain text - "consult" lowercase, visually identical to
			    "session" at a glance, so telling the two lists apart meant reading every row. */}
			<span className="artistUpcomingType">
				<AppointmentTypeChip type={appt.appointmentType} size="small" />
			</span>
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
 * The figures come from server-side aggregation (server/utils/analytics.js), and each of the three
 * lists comes from its own narrow query. That "worth revisiting if the history grows large" note
 * that used to sit here was too generous: it wasn't a scaling concern, it was every dashboard
 * visit downloading every appointment the artist had ever had in order to show five of them.
 */
const ArtistPerformancePanel = ({ artistUserId, isSelf = false }) => {
	const navigate = useNavigate();
	const { user: viewer } = useAuth();
	const [range, setRange] = useState(getDefaultRange);

	// Independent paging per list - "page 2 of upcoming" and "page 2 of completed" have nothing to
	// do with each other. Reset to 0 whenever the range changes (see the effect below): an offset
	// that made sense against last month's rows is meaningless against this month's, and stranding
	// someone on "page 3" of a now-empty list would read as a bug.
	const [upcomingOffset, setUpcomingOffset] = useState(0);
	const [upcomingPageSize, setUpcomingPageSize] = useState(APPOINTMENT_LIST_LIMIT);
	const [completedOffset, setCompletedOffset] = useState(0);
	const [completedPageSize, setCompletedPageSize] = useState(APPOINTMENT_LIST_LIMIT);

	// A shop admin's OWN dashboard (isSelf, since Home.jsx always mounts this with isSelf=true for
	// every "artist" userType - "a shop owner tattoos until they say otherwise", see DECISIONS.md
	// S0) becomes the shop-wide dashboard once they actually have a shop connected. isSelf=false
	// (Artist.jsx, a shop admin looking at one OTHER specific artist) never goes shop-wide here -
	// that page's whole point is one artist's numbers, and widening it there would silently answer
	// a different question than the one the page title asks.
	//
	// role <= SHOP_ADMIN rather than userType, because userType isn't on the JWT/auth context the
	// same way role is (see server/utils/with-auth.js's own comment on this) - matching the
	// convention Home.jsx already uses for canSeeMoney and AppointmentsList.jsx uses for shopId.
	const shopId = viewer.userInfo?.shop?.id;
	const shopWide = isSelf && Boolean(shopId) && viewer.role <= ROLES.SHOP_ADMIN;

	// Changing the range or switching between "my own" and shop-wide rows out from under a
	// mid-list offset - back to page 1 of whatever the new question's answer turns out to be.
	useEffect(() => {
		setUpcomingOffset(0);
		setCompletedOffset(0);
	}, [range, shopWide]);

	// Two queries doing two different jobs, deliberately not merged.
	//
	// The FIGURES now come from the same server-side aggregation the shop dashboard uses
	// (server/utils/analytics.js), so an artist's own numbers and the shop's view of that artist
	// agree by construction rather than by two client-side implementations happening to match.
	// They also respond to the range picker, which client-side MTD/YTD constants could not.
	//
	// The LISTS still come from the appointment query, because "the next five appointments" needs
	// actual rows, not aggregates - and they ARE range-scoped now.
	//
	// They used not to be, on the reasoning that range-scoping would empty them for a historical
	// range and read as data loss. That was wrong, and the bug it produced is the argument against
	// it: clicking "Last month" in August moved every figure on the panel and left both lists
	// showing August's appointments. A control that visibly changes half a screen and silently
	// ignores the other half is worse than no control - the figures and the rows disagreed, with
	// nothing on screen saying which one answered the question.
	//
	// An empty list IS the answer when there is nothing in the window. "No completed sessions in
	// July" is information. The empty states name the range so it reads as a fact about July rather
	// than as a failure to load.
	//
	// shopWide reads getShopAnalytics instead of getArtistAnalytics - same dual-hook, each-skips-
	// itself pattern as the appointment queries below. This was the second half of "closed a
	// session as Mika, shop admin's dashboard doesn't reflect it": getArtistAnalytics(artistUserId)
	// is the OWNER'S OWN figures, and since the owner now carries a 0% shop-cut rate (see
	// registerAccount/the seed scripts), her personal shopCutOutstandingCents/
	// shopCutAwaitingConfirmationCents are permanently $0 - confirming another artist's shop cut
	// can never move a number that was never about that artist to begin with. getShopAnalytics
	// (server/utils/analytics.js's computeAnalytics with a shopId) aggregates every artist at the
	// shop, which is the actual question a shop-wide dashboard's stat cards are supposed to answer.
	const { data: analyticsArtistData, loading: analyticsArtistLoading } =
		AnalyticsService.getArtistAnalytics(shopWide ? undefined : artistUserId, range);
	const { data: analyticsShopData, loading: analyticsShopLoading } =
		AnalyticsService.getShopAnalytics(shopWide ? shopId : undefined, range);
	const analyticsData = shopWide ? analyticsShopData : analyticsArtistData;
	const analyticsLoading = shopWide ? analyticsShopLoading : analyticsArtistLoading;

	// Three narrow queries, not one fat fetch plus four client-side passes. This used to load the
	// artist's ENTIRE appointment history to render two lists of five and a payout list - see
	// services/AppointmentService.js. Each of these now asks the question the section below it is
	// actually asking, which is also why the sorting is right: the server orders upcoming
	// soonest-first and completed newest-first, rather than the browser re-sorting everything.
	//
	// SIX hooks where four would do, in shopWide mode - both the per-artist and shop-wide version
	// of each query are always called, and each one skips itself when its own id argument is
	// undefined. Hooks can't be called conditionally, so "ask the shop-wide question instead" has
	// to be expressed this way rather than by branching before the useQuery call - the same pattern
	// AppointmentsList.jsx and IBCalendar already use for "shop calendar or independent artist's
	// own calendar".
	const { data: upcomingArtistData, loading: upcomingArtistLoading } =
		AppointmentService.getUpcomingAppointments(
			shopWide ? undefined : artistUserId,
			upcomingPageSize,
			range,
			upcomingOffset
		);
	const { data: upcomingShopData, loading: upcomingShopLoading } =
		AppointmentService.getUpcomingAppointmentsForShop(
			shopWide ? shopId : undefined,
			upcomingPageSize,
			range,
			upcomingOffset
		);
	const { data: completedArtistData, loading: completedArtistLoading } =
		AppointmentService.getCompletedAppointments(
			shopWide ? undefined : artistUserId,
			completedPageSize,
			range,
			completedOffset
		);
	const { data: completedShopData, loading: completedShopLoading } =
		AppointmentService.getCompletedAppointmentsForShop(
			shopWide ? shopId : undefined,
			completedPageSize,
			range,
			completedOffset
		);
	const { data: payoutArtistData, refetch: refetchArtistPayouts } =
		AppointmentService.getShopCutPayoutCandidates(shopWide ? undefined : artistUserId, range);
	const { data: payoutShopData, refetch: refetchShopPayouts } =
		AppointmentService.getShopCutPayoutCandidatesByShop(shopWide ? shopId : undefined, range);

	const upcomingLoading = shopWide ? upcomingShopLoading : upcomingArtistLoading;
	const upcomingData = shopWide ? upcomingShopData : upcomingArtistData;
	const completedLoading = shopWide ? completedShopLoading : completedArtistLoading;
	const completedData = shopWide ? completedShopData : completedArtistData;
	const refetchAppointments = shopWide ? refetchShopPayouts : refetchArtistPayouts;

	if ((upcomingLoading && !upcomingData) || (completedLoading && !completedData)) {
		return <IBPageLoader />;
	}

	const analytics = shopWide
		? analyticsData?.getShopAnalytics
		: analyticsData?.getArtistAnalytics;
	const upcoming = shopWide
		? upcomingData?.getAppointmentsByShop?.items || []
		: upcomingData?.getAppointmentsByArtist?.items || [];
	const upcomingPageInfo = shopWide
		? upcomingData?.getAppointmentsByShop?.pageInfo
		: upcomingData?.getAppointmentsByArtist?.pageInfo;

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
	const completed = shopWide
		? completedData?.getAppointmentsByShop?.items || []
		: completedData?.getAppointmentsByArtist?.items || [];
	const completedPageInfo = shopWide
		? completedData?.getAppointmentsByShop?.pageInfo
		: completedData?.getAppointmentsByArtist?.pageInfo;

	// Only 'completed' sessions - see PRODUCTION_ROADMAP.md's Phase 7 section: a shop cut isn't
	// actually payable until the session itself is done, matching SessionDetail's own close-session
	// gate (appointmentStatus: 'completed'). 'unpaid' only (not invoice_sent/pending_confirmation -
	// those already have an action in flight, nothing new to do here until they resolve).
	//
	// IS range-scoped, same as every other section on this panel - it used not to be, on the
	// reasoning that a debt doesn't expire just because it's outside the window you happen to be
	// looking at. That reasoning was sound but the result wasn't: the date picker sits above this
	// section along with everything else, "This Month" moved every other list and figure on the
	// page and left this one showing the artist's/shop's entire history regardless, which reads as
	// the control being broken rather than as a deliberate choice. Still unpaged within whatever
	// range is selected - the task is settling a debt, not browsing it, and a batch "invoice all"
	// over a paged list is ambiguous about what it covers. The completed/unpaid/has-a-shop
	// filtering (and now the date bounds) live in the resolver, where they can't drift from the
	// shop-cut ledger's own definition of what's payable.
	const payoutCandidates = shopWide
		? payoutShopData?.getShopCutPayoutCandidatesByShop || []
		: payoutArtistData?.getShopCutPayoutCandidates || [];

	// shopWide checked first: a shop admin's own dashboard once it's shop-wide is no longer "your"
	// anything - it's every artist's, which is the whole reason the artist name and tint just got
	// switched on above.
	let upcomingSectionTitle = "Upcoming Appointments";
	if (shopWide) {
		upcomingSectionTitle = "Shop Upcoming Appointments";
	} else if (isSelf) {
		upcomingSectionTitle = "Your Upcoming Appointments";
	}
	let completedSectionTitle = "Completed Sessions";
	if (shopWide) {
		completedSectionTitle = "Shop Completed Sessions";
	} else if (isSelf) {
		completedSectionTitle = "Your Completed Sessions";
	}

	return (
		<div className="artistPerformancePanel">
			<DateRangePicker value={range} onChange={setRange} />

			{/* The figures are aggregates over the selected range and come from the server, and the
			    lists below now honour the same range - everything under this picker answers for one
			    window. The shop-cut payout list is the single exception and says so. Rendered from
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
						{shopWide ? (
							<>
								{/* shopWide's card set is deliberately different from an artist's own -
								    see the comments on each card below for why each one is in or out. */}
								<StatCard
									label="Total Revenue"
									value={formatCents(analytics.revenueCents)}
									// "all artists", not just the admin's own chair - shopWide sources
									// this from getShopAnalytics, which aggregates every artist at the
									// shop (see the hook above).
									subLabel="completed sessions, all artists"
								/>
								{/* The shop's own take, and ONLY the settled portion of it -
								    shopCutEarnedCents is exactly 'paid'/'received' (see
								    utils/analytics.js's CUT_EARNED). Unpaid and awaiting-confirmation
								    cuts are real money the shop is owed but doesn't have yet, which is
								    exactly what "Shop cut owed" and "Shop cut awaiting confirmation"
								    below are for - folding them in here would call money the shop
								    doesn't actually hold "the shop's total". */}
								<StatCard
									label="Shop Total"
									value={formatCents(analytics.shopCutEarnedCents)}
									subLabel="shop cut actually collected"
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
									label="Deposits taken"
									value={formatCents(analytics.depositsCollectedCents)}
									subLabel="already included in revenue"
								/>
								<StatCard
									label="Deposits unspent"
									value={formatCents(analytics.depositsOutstandingCents)}
									subLabel="held against work not yet done"
								/>
								{/* The shop's actual financial picture - see the user's own framing:
								    "total tattoo related income, total expenses, and total other
								    income giving a grand total of what the shop is actually doing
								    financially across the board". Sourced from Expense/Income
								    (server/models/Expense.js, Income.js) scoped to this shop - see
								    server/utils/analytics.js's own header on expensesCents/
								    otherIncomeCents/netCents. "Total Revenue" above is tattoo income
								    only (completed sessions); these three turn that into the shop's
								    whole P&L rather than just its tattoo side. */}
								<StatCard
									label="Expenses"
									value={formatCents(analytics.expensesCents)}
									subLabel="rent, supplies, everything logged as an expense"
								/>
								<StatCard
									label="Other income"
									value={formatCents(analytics.otherIncomeCents)}
									subLabel="non-tattoo income - retail, booth rent, etc."
								/>
								<StatCard
									label="Grand total"
									value={formatCents(analytics.netCents)}
									subLabel="tattoo revenue + other income − expenses"
								/>
								{/* Deliberately NOT here: Tips/Average tip (an artist's own money,
								    never the shop's - kept on the artist's own dashboard only, see
								    the else branch below) and Sessions completed/Active projects
								    (activity figures, not the money-and-reconciliation view this
								    dashboard is now scoped to). */}
							</>
						) : (
							<>
								<StatCard
									label="Revenue"
									value={formatCents(analytics.revenueCents)}
									// Worth stating: this changed. It used to count every appointment
									// in the window regardless of status, so an artist's "revenue"
									// included sessions that were merely booked. It's now completed
									// work only.
									subLabel="completed appointments only"
								/>
								{/* Tips get their own card rather than being folded into revenue:
								    they're the artist's alone (never part of the shop cut), and
								    they're the number most artists actually track. Shop-wide mode
								    drops these two - a shop admin reconciling the books doesn't need
								    a sum of everyone's tips, since none of it is the shop's money or
								    the shop's business to total up. */}
								<StatCard label="Tips" value={formatCents(analytics.tipsCents)} />
								<StatCard
									label="Average tip"
									value={formatCents(analytics.averageTipCents)}
									// Stated explicitly - an average that silently included
									// un-tipped appointments would read much lower and mean
									// something else entirely.
									subLabel={`across ${analytics.tippedCount} tipped appointment${
										analytics.tippedCount === 1 ? "" : "s"
									}`}
								/>
								<StatCard
									label="Deposits taken"
									value={formatCents(analytics.depositsCollectedCents)}
									subLabel="already included in revenue"
								/>
								{/* Not earnings - money held against work still to do. Kept on the
								    artist's own dashboard because they're the one who owes that
								    work. */}
								<StatCard
									label="Deposits unspent"
									value={formatCents(analytics.depositsOutstandingCents)}
									subLabel="held against work not yet done"
								/>
								<StatCard
									label="Shop cut owed"
									value={formatCents(analytics.shopCutOutstandingCents)}
								/>
								{/* Your own financial picture, same three figures as the shop-wide
								    view above (see that branch's comment) but scoped to YOUR own
								    books - server/utils/analytics.js's computeAnalytics reads
								    Expense/Income rows by artistUserId here, not shopId. Shown for
								    every artist, not just an independent one with no shop - a
								    shop-connected artist simply never has any (Settings' Expenses &
								    Income category is shop-admin/independent-artist only), so these
								    render as the honest $0.00 rather than being hidden. */}
								<StatCard
									label="Expenses"
									value={formatCents(analytics.expensesCents)}
								/>
								<StatCard
									label="Other income"
									value={formatCents(analytics.otherIncomeCents)}
									subLabel="non-tattoo income"
								/>
								<StatCard
									label="Grand total"
									value={formatCents(analytics.netCents)}
									subLabel="revenue + other income − expenses"
								/>
								{/* Shop cut awaiting confirmation is deliberately NOT shown here -
								    it's the shop-wide reconciliation view's card (see the shopWide
								    branch above). On an artist's own dashboard this figure only
								    moves in the narrow window between the artist marking a cut paid
								    and the shop confirming it, which in practice reads as "stuck at
								    $0" - not because it's broken, but because it isn't the kind of
								    thing a single artist's own view has any use for tracking. */}
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
							</>
						)}
					</div>
				)
			)}
			{shopWide && analytics && analytics.artists.length > 0 && (
				<IBCardWrapper>
					<h2 className="artistPerformanceSectionTitle">Artist Totals</h2>
					{/* What each artist actually takes home in the selected range - see
					    artistTakeHomeCents's own comment on why it's revenue minus the FULL
					    assessed cut (earned + outstanding + awaiting confirmation), not just the
					    settled portion. Pre-sorted highest-revenue-first by the server (see
					    utils/analytics.js) - a ranked table is the shape a shop owner reads this
					    in, same reasoning ShopAnalyticsPanel's own "By artist" table uses. */}
					<div className="artistTotalsTable">
						<div className="artistTotalsHeader">
							<span className="artistTotalsName">Artist</span>
							<span className="artistTotalsAmount">Revenue</span>
							<span className="artistTotalsAmount">Shop cut</span>
							<span className="artistTotalsAmount">Take-home</span>
						</div>
						{analytics.artists.map((row) => (
							<div
								key={row.userId}
								className="artistTotalsRow"
								style={tagColorRowStyle(row.user?.tagColor)}
							>
								<span className="artistTotalsName">
									{row.user
										? `${row.user.firstName} ${row.user.lastName}`
										: "Unknown artist"}
								</span>
								<span className="artistTotalsAmount">
									{formatCents(row.revenueCents)}
								</span>
								<span className="artistTotalsAmount">
									{formatCents(
										(row.shopCutEarnedCents || 0) +
											(row.shopCutOutstandingCents || 0) +
											(row.shopCutAwaitingConfirmationCents || 0)
									)}
								</span>
								<span className="artistTotalsAmount artistTotalsTakeHome">
									{formatCents(artistTakeHomeCents(row))}
								</span>
							</div>
						))}
					</div>
				</IBCardWrapper>
			)}
			<IBCardWrapper>
				<h2 className="artistPerformanceSectionTitle">{upcomingSectionTitle}</h2>
				{upcoming.length === 0 ? (
					<div className="artistPerformanceEmpty">No upcoming appointments in {range?.label ?? "this range"}.</div>
				) : (
					<>
						<ul className="artistUpcomingList">
							{upcoming.map((appt) => (
								<AppointmentRow
									key={appt.id}
									appt={appt}
									onNavigate={navigate}
									showArtist={shopWide}
								/>
							))}
						</ul>
						<EntityListPager
							pageInfo={upcomingPageInfo}
							onChange={setUpcomingOffset}
							onPageSizeChange={(size) => {
								setUpcomingPageSize(size);
								setUpcomingOffset(0);
							}}
							pageSizeOptions={APPOINTMENT_PAGE_SIZE_OPTIONS}
							noun="appointment"
						/>
					</>
				)}
			</IBCardWrapper>
			<IBCardWrapper>
				<h2 className="artistPerformanceSectionTitle">{completedSectionTitle}</h2>
				{completed.length === 0 ? (
					<div className="artistPerformanceEmpty">No completed sessions in {range?.label ?? "this range"}.</div>
				) : (
					<>
						<ul className="artistUpcomingList">
							{completed.map((appt) => (
								<AppointmentRow
									key={appt.id}
									appt={appt}
									onNavigate={navigate}
									showEarnings
									showArtist={shopWide}
								/>
							))}
						</ul>
						<EntityListPager
							pageInfo={completedPageInfo}
							onChange={setCompletedOffset}
							onPageSizeChange={(size) => {
								setCompletedPageSize(size);
								setCompletedOffset(0);
							}}
							pageSizeOptions={APPOINTMENT_PAGE_SIZE_OPTIONS}
							noun="session"
						/>
					</>
				)}
			</IBCardWrapper>
			{isSelf && (
				<IBCardWrapper>
					<h2 className="artistPerformanceSectionTitle">Shop Cut Payouts</h2>
					<ShopCutPayoutList
						appointments={payoutCandidates}
						onChanged={() => refetchAppointments()}
						showArtist={shopWide}
						viewerId={viewer.id}
					/>
				</IBCardWrapper>
			)}
		</div>
	);
};

export default ArtistPerformancePanel;
