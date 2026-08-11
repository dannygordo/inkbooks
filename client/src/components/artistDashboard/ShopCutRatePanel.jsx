// Explicit React import - see scripts/check-react-in-tested-components.mjs.
import React, { useState } from "react";
import moment from "moment";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import { useShopCutRates, useSetShopCutRate } from "../../services/ShopCutRateService";
import "./shopCutRatePanel.css";

/**
 * What this artist owes the shop, and from when.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE HISTORY IS THE UI, not a single editable number
 *
 * A rate change applies forward only and never reprices work already performed (DECISIONS.md M7).
 * A lone input showing "40%" invites the reading that changing it changes what the artist owes -
 * including on last month's sessions - which is exactly the thing that must not happen. Showing the
 * list makes the model visible: each row is a period, adding one starts a new period, and nothing
 * above it moves.
 *
 * It is also the record an artist and a shop argue from. "You've been taking 40" is settled by a
 * dated list, and not by anything else.
 *
 * WHY THIS LIVES ON THE ARTIST'S PAGE and not in Settings
 *
 * Settings is a person's own configuration. This is a term between two parties, set by one of them
 * about the other - so it belongs where a shop admin is already looking at that artist. An artist
 * reading their own page sees the same panel without the form.
 * ---------------------------------------------------------------------------------------------
 */
const ShopCutRatePanel = ({ artistUserId, shopId, canEdit }) => {
	const { data, loading } = useShopCutRates(artistUserId, shopId);
	const [setShopCutRate, { loading: saving }] = useSetShopCutRate();

	const [percent, setPercent] = useState("");
	const [effectiveFrom, setEffectiveFrom] = useState(moment().format("YYYY-MM-DD"));
	const [note, setNote] = useState("");
	const [error, setError] = useState(null);

	// An artist with no shop owes nobody anything, so there is nothing here to show. Rendering an
	// empty "Shop cut" card at an independent artist would be a question with no answer.
	if (!shopId) {
		return null;
	}

	const rates = data?.getShopCutRates || [];
	// Server-sorted newest first, so the row in force right now is the first one whose effectiveFrom
	// has passed. Not simply rates[0]: a back-dated future rate is a legal thing to record.
	const current = rates.find((rate) => moment(rate.effectiveFrom).isSameOrBefore(moment()));

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError(null);
		const parsed = Number(percent);
		if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
			setError("Enter a percentage between 0 and 100.");
			return;
		}
		try {
			await setShopCutRate({
				variables: {
					artistId: artistUserId,
					shopId,
					percent: Math.round(parsed),
					// Start of the chosen DAY, in the reader's own timezone. A rate that begins "on
					// the 1st" should cover work at 9am on the 1st, which a bare date string parsed
					// as midnight UTC would miss for anyone west of London.
					effectiveFrom: moment(effectiveFrom, "YYYY-MM-DD").startOf("day").toISOString(),
					note,
				},
			});
			setPercent("");
			setNote("");
		} catch (err) {
			const fieldErrors = err.graphQLErrors?.[0]?.extensions?.errors;
			setError(
				fieldErrors ? Object.values(fieldErrors).join(" ") : err.message
			);
		}
	};

	return (
		<IBCardWrapper>
			<h1>Shop cut</h1>
			<p className="settingsPanelHelp">
				The shop's percentage of this artist's session work. Applied to the session subtotal
				only — never to tips, tax or card fees. A change applies from its own date forward
				and never alters work already performed.
			</p>

			{loading && rates.length === 0 ? (
				<p className="shopCutRateEmpty">Loading…</p>
			) : (
				<>
					<p className="shopCutRateCurrent">
						{current ? (
							<>
								<strong>{current.percent}%</strong> since{" "}
								{moment(current.effectiveFrom).format("MMM D, YYYY")}
							</>
						) : (
							// No dated rate yet means the resolution falls back to the connection's
							// or the shop's value - which is a real state, not an error, and saying
							// so is better than showing a confident 0%.
							<>No dated rate recorded — the shop's default applies.</>
						)}
					</p>

					{rates.length > 0 && (
						<ul className="shopCutRateHistory">
							{rates.map((rate) => (
								<li key={rate.id}>
									<span className="shopCutRatePercent">{rate.percent}%</span>
									<span className="shopCutRateFrom">
										from {moment(rate.effectiveFrom).format("MMM D, YYYY")}
									</span>
									{rate.note && <span className="shopCutRateNote">{rate.note}</span>}
								</li>
							))}
						</ul>
					)}
				</>
			)}

			{canEdit && (
				<form className="shopCutRateForm" onSubmit={handleSubmit}>
					<label htmlFor="shopCutPercent">New rate</label>
					<div className="shopCutRateInputs">
						<input
							id="shopCutPercent"
							type="number"
							min="0"
							max="100"
							step="1"
							value={percent}
							onChange={(e) => setPercent(e.target.value)}
							placeholder="40"
						/>
						<span className="shopCutRateSuffix">%</span>
						<input
							id="shopCutEffectiveFrom"
							type="date"
							aria-label="Effective from"
							value={effectiveFrom}
							onChange={(e) => setEffectiveFrom(e.target.value)}
						/>
						<input
							id="shopCutNote"
							type="text"
							aria-label="Note"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							placeholder="Why (optional)"
						/>
					</div>
					{error && <div className="settingsError">{error}</div>}
					<div className="settingsActions">
						<button type="submit" className="ibButton" disabled={saving || !percent}>
							{saving ? "Saving…" : "Record rate"}
						</button>
					</div>
				</form>
			)}
		</IBCardWrapper>
	);
};

export default ShopCutRatePanel;
