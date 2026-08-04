import React from "react";
import "./analyticsPanel.css";

/**
 * One figure on a dashboard.
 *
 * Exists mainly to make one rule impossible to forget: a null value renders as an em dash, never
 * as $0.00 or 0. Money fields come back null for a Staff-role caller (see
 * server/graphql/resolvers/analytics.js), and "$0.00" is a confident, specific, wrong answer to
 * "how much did the shop make". An em dash says nothing, which is the truth in that case.
 *
 * @param {string} label
 * @param {string|number|null} value - already formatted; null means "not available to you"
 * @param {string} [subLabel] - the basis of the figure when it isn't obvious from the label, e.g.
 *   an average taken over a subset
 */
const StatCard = ({ label, value, subLabel }) => (
	<div className="analyticsStatCard">
		<div className="analyticsStatLabel">{label}</div>
		<div className={value == null ? "analyticsStatValue analyticsStatValueEmpty" : "analyticsStatValue"}>
			{value == null ? "—" : value}
		</div>
		{subLabel && <div className="analyticsStatSubLabel">{subLabel}</div>}
	</div>
);

export default StatCard;
