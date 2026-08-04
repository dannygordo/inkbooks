import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import DateRangePicker from "./DateRangePicker";
import StatCard from "./StatCard";
import AnalyticsService from "../../services/AnalyticsService";
import { getDefaultRange } from "../../utils/dateRanges";
import { formatCents } from "../../utils/money";
import { tagColorRowStyle } from "../../utils/tagColor";
import { ROUTE_CONSTANTS } from "../../constants";
import "./analyticsPanel.css";

/**
 * Shop-wide dashboard. Mounted on Home.jsx for Staff and above - the roadmap deferred this
 * explicitly, and those roles have been looking at a bare greeting ever since.
 *
 * Every figure comes from one server-side aggregation (see server/utils/analytics.js) rather than
 * being summed in the browser. Two reasons, and the second is the one that matters: shop-wide is
 * every artist's full financial history, which would be a lot to ship to a browser - and shipping
 * it at all would make the Staff money blackout impossible to enforce, since the raw rows would
 * already be in the client's hands regardless of which cards got rendered.
 *
 * WHAT STAFF SEE: everything except money. The server returns null for every currency-denominated
 * field below Shop Admin, and StatCard renders null as an em dash rather than $0.00. The
 * per-artist table drops its money columns entirely rather than showing a row of dashes, which
 * would be noise.
 */
const ShopAnalyticsPanel = ({ shopId, canSeeMoney }) => {
	const navigate = useNavigate();
	const [range, setRange] = useState(getDefaultRange);
	const { data, loading, error } = AnalyticsService.getShopAnalytics(shopId, range);

	if (!shopId) {
		return (
			<IBCardWrapper>
				<div className="analyticsEmpty">
					You aren't connected to a shop yet, so there are no shop-wide figures to show.
				</div>
			</IBCardWrapper>
		);
	}

	const analytics = data?.getShopAnalytics;

	return (
		<div className="analyticsPanel">
			<DateRangePicker value={range} onChange={setRange} />

			{/* Gated on "loading AND nothing cached" so switching ranges doesn't blank the page -
			    the previous range's figures stay put until the new ones land, which reads as an
			    update rather than a reload. */}
			{loading && !analytics ? (
				<IBPageLoader />
			) : error ? (
				<IBCardWrapper>
					<div className="analyticsEmpty">
						Couldn't load shop analytics: {error.message}
					</div>
				</IBCardWrapper>
			) : !analytics ? null : (
				<>
					{canSeeMoney && (
						<>
							<h2 className="analyticsSectionTitle">Money</h2>
							<div className="analyticsStatGrid">
								<StatCard
									label="Revenue"
									value={formatCents(analytics.revenueCents)}
									// Said out loud because it's the definition most likely to be
									// queried when the number looks low: booked-but-unworked
									// sessions are deliberately not in here.
									subLabel="completed appointments only"
								/>
								<StatCard
									label="Tips"
									value={formatCents(analytics.tipsCents)}
									subLabel="the artists keep all of this"
								/>
								<StatCard
									label="Average tip"
									value={formatCents(analytics.averageTipCents)}
									subLabel={`across ${analytics.tippedCount} tipped appointment${
										analytics.tippedCount === 1 ? "" : "s"
									}`}
								/>
								<StatCard
									label="Shop cut collected"
									value={formatCents(analytics.shopCutEarnedCents)}
								/>
								<StatCard
									label="Shop cut outstanding"
									value={formatCents(analytics.shopCutOutstandingCents)}
									subLabel="owed but not yet paid"
								/>
								{/* Split out rather than folded into "outstanding" because this is
								    the only one of the three with something for the shop to
								    actually do: an artist says they paid and nobody has agreed. */}
								<StatCard
									label="Awaiting your confirmation"
									value={formatCents(analytics.shopCutAwaitingConfirmationCents)}
									subLabel={
										analytics.shopCutAwaitingConfirmationCents > 0
											? "needs review"
											: undefined
									}
								/>
							</div>

							<h2 className="analyticsSectionTitle">Deposits</h2>
							<div className="analyticsStatGrid">
								<StatCard
									label="Deposits collected"
									value={formatCents(analytics.depositsCollectedCents)}
									// Stated because it's the question this card invites: no, this
									// is not extra money on top of revenue. recordDeposit writes
									// the deposit into the collecting appointment's total, so it's
									// already counted above - this breaks out how much of revenue
									// it was.
									subLabel="already included in revenue"
								/>
								<StatCard
									label="Deposits applied"
									value={formatCents(analytics.depositsAppliedCents)}
									subLabel="credited against sessions"
								/>
								{/* The one figure here that is NOT earnings. Money taken for work
								    that hasn't happened - the shop owes the client that work, and
								    treating it as profit is how a shop spends money it still has
								    to earn. */}
								<StatCard
									label="Deposits outstanding"
									value={formatCents(analytics.depositsOutstandingCents)}
									subLabel="held against work not yet done"
								/>
							</div>
						</>
					)}

					<h2 className="analyticsSectionTitle">Activity</h2>
					<div className="analyticsStatGrid">
						<StatCard label="Sessions completed" value={analytics.completedSessionCount} />
						<StatCard label="Consults booked" value={analytics.consultCount} />
						<StatCard label="Appointments" value={analytics.appointmentCount} />
						{/* Both of these describe right now, not the selected range - see
						    utils/analytics.js. Labelled so the difference isn't a surprise when
						    they don't move as the range changes. */}
						<StatCard
							label="Upcoming"
							value={analytics.upcomingCount}
							subLabel="as of today, any range"
						/>
						<StatCard
							label="Active projects"
							value={analytics.activeProjectCount}
							subLabel="as of today, any range"
						/>
						<StatCard label="Artists" value={analytics.artistCount} />
					</div>

					<h2 className="analyticsSectionTitle">Clients</h2>
					<div className="analyticsStatGrid">
						<StatCard label="New clients" value={analytics.newClientCount} />
						<StatCard label="Total clients" value={analytics.totalClientCount} />
						<StatCard label="New projects" value={analytics.newProjectCount} />
					</div>

					<IBCardWrapper>
						<h2 className="analyticsSectionTitle">By artist</h2>
						{analytics.artists.length === 0 ? (
							<div className="analyticsEmpty">
								No artist activity in this range.
							</div>
						) : (
							<div className="analyticsArtistTable">
								<div className="analyticsArtistHeader">
									<span className="analyticsArtistName">Artist</span>
									<span className="analyticsArtistNum">Sessions</span>
									{canSeeMoney && <span className="analyticsArtistNum">Revenue</span>}
									{canSeeMoney && <span className="analyticsArtistNum">Tips</span>}
									{canSeeMoney && <span className="analyticsArtistNum">Cut owed</span>}
								</div>
								{analytics.artists.map((row) => (
									// Tinted by the artist's own colour, same as every other list
									// showing artist data - see utils/tagColor.js. This is the
									// table where that genuinely differentiates rows.
									<div
										key={row.userId}
										className={
											row.artistId
												? "analyticsArtistRow analyticsArtistRowClickable"
												: "analyticsArtistRow"
										}
										style={tagColorRowStyle(row.user?.tagColor)}
										// artistId is the Artist DOCUMENT's id, resolved server-side.
										// /artist/:artistId routes on that, not on the User id these
										// rows are keyed by - see utils/analytics.js. Not clickable
										// at all if it's missing, rather than linking somewhere that
										// 404s.
										onClick={
											row.artistId
												? () => navigate(`${ROUTE_CONSTANTS.ARTIST}${row.artistId}`)
												: undefined
										}
									>
										<span className="analyticsArtistName">
											{row.user
												? `${row.user.firstName} ${row.user.lastName}`
												: "Unknown artist"}
										</span>
										<span className="analyticsArtistNum">
											{row.completedSessionCount}
										</span>
										{canSeeMoney && (
											<span className="analyticsArtistNum">
												{formatCents(row.revenueCents)}
											</span>
										)}
										{canSeeMoney && (
											<span className="analyticsArtistNum">
												{formatCents(row.tipsCents)}
											</span>
										)}
										{canSeeMoney && (
											<span className="analyticsArtistNum">
												{formatCents(row.shopCutOutstandingCents)}
											</span>
										)}
									</div>
								))}
							</div>
						)}
					</IBCardWrapper>
				</>
			)}
		</div>
	);
};

export default ShopAnalyticsPanel;
