import React from "react";
import { useMutation } from "@apollo/client";
import ShopService from "../../services/ShopService";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBInput from "../inputs/IBInput";
import { formatCents } from "../../utils/money";

/**
 * Sales tax and the card processing offset - the two numbers every charge is computed from.
 *
 * THESE HAD NO SCREEN AT ALL until now. Both fields have existed on Shop and Artist since the tax
 * rules were written, seeded to zero, with nothing anywhere able to change them. Harmless while
 * nothing charged a card; not harmless once something did, because the charge path reads exactly
 * these and every charge was collecting $0.00 of tax with no way to correct it from the app.
 *
 * UNITS ARE CONVERTED HERE AND ONLY HERE. The server stores and receives basis points and cents,
 * because a tax rate held as a float is where 9.4 stops being exactly representable. A person types
 * "9.4" and "6.00"; nothing but this component ever sees those.
 *
 * Read-only for a shop artist who is not an admin. They are shown the figures because these apply
 * to every charge they take, but tax is destination-based and belongs to the shop's location - two
 * artists in the same room must not bill different rates.
 */

// 940 -> "9.4". Trailing zeros trimmed so a whole rate reads as "9" rather than "9.00".
function basisPointsToPercent(bp) {
	return String((bp || 0) / 100);
}

// "9.4" -> 940. Rounded rather than truncated, so 9.999 becomes 1000 and not 999.
function percentToBasisPoints(value) {
	const parsed = typeof value === "string" ? parseFloat(value) : value;
	if (parsed === null || parsed === undefined || Number.isNaN(parsed)) {
		return 0;
	}
	return Math.round(parsed * 100);
}

function dollarsToCents(value) {
	const parsed = typeof value === "string" ? parseFloat(value) : value;
	if (parsed === null || parsed === undefined || Number.isNaN(parsed)) {
		return 0;
	}
	return Math.round(parsed * 100);
}

const SquarePricingPanel = () => {
	const { loading, data, refetch } = ShopService.fetchMySquarePricing();
	const [updatePricing, { loading: saving }] = useMutation(ShopService.UPDATE_SQUARE_PRICING);
	const [error, setError] = React.useState(null);
	const [saved, setSaved] = React.useState(false);
	// Uncontrolled inputs with local edits, matching Settings.jsx's own pattern: IBInput takes
	// defaultValue, so a value written by an effect after the query resolves would update state and
	// never reach the field.
	const [editedPercent, setEditedPercent] = React.useState(undefined);
	const [editedOffset, setEditedOffset] = React.useState(undefined);

	if (loading || !data) {
		return null;
	}

	const settings = data.getMySquarePricingSettings;
	const { source, ownerName, taxRateBasisPoints, squareFeeOffsetCents, canEdit } = settings;

	const percentValue =
		editedPercent !== undefined ? editedPercent : basisPointsToPercent(taxRateBasisPoints);
	const offsetValue =
		editedOffset !== undefined ? editedOffset : String((squareFeeOffsetCents || 0) / 100);

	const handleSave = async (e) => {
		e.preventDefault();
		setError(null);
		setSaved(false);
		try {
			await updatePricing({
				variables: {
					taxRateBasisPoints: percentToBasisPoints(percentValue),
					squareFeeOffsetCents: dollarsToCents(offsetValue),
				},
			});
			await refetch();
			setEditedPercent(undefined);
			setEditedOffset(undefined);
			setSaved(true);
		} catch (err) {
			setError(err.graphQLErrors?.[0]?.message || err.message);
		}
	};

	return (
		<IBCardWrapper>
			<div>
				<h1>Tax &amp; processing</h1>
				<p className="settingsPanelHelp">
					{source === "shop"
						? `Set by ${
								ownerName || "your shop"
						  } and applied to every session and deposit charged here. Sales tax is charged where the work happens, so it is the same for everyone at the shop.`
						: "Applied to every session and deposit you charge. Sales tax is charged where the work happens - use the rate for your location."}
				</p>
			</div>

			{/* A zero rate is a real configuration and a plausible mistake, and the difference
			    matters on every ticket. Said plainly rather than left for someone to notice from a
			    receipt. */}
			{taxRateBasisPoints === 0 && (
				<p className="settingsPricingWarning">
					No sales tax is being collected on any charge.
				</p>
			)}

			<form onSubmit={handleSave}>
				<IBInput
					id="taxRatePercent"
					label="Sales tax (%)"
					type="number"
					inputProps={{ step: "0.01", min: 0, max: 100 }}
					defaultValue={percentValue}
					disabled={!canEdit}
					onChange={(e) => setEditedPercent(e.target.value)}
					helperText="For example 9.4 for 9.4%."
				/>
				<IBInput
					id="squareFeeOffset"
					label="Card processing offset ($ per hour)"
					type="number"
					inputProps={{ step: "0.01", min: 0 }}
					defaultValue={offsetValue}
					disabled={!canEdit}
					onChange={(e) => setEditedOffset(e.target.value)}
					helperText="Offered as a choice at checkout, never added automatically. Leave at 0 to not pass card fees on."
				/>

				{/* The offset is per HOUR and scales with the session, which is not obvious from a
				    single dollar figure. One worked example beats a paragraph. */}
				{squareFeeOffsetCents > 0 && (
					<p className="settingsPanelHelp">
						A three-hour session would be offered{" "}
						{formatCents(squareFeeOffsetCents * 3)} of offset.
					</p>
				)}

				{canEdit && (
					<div className="settingsActions">
						<button type="submit" className="ibButton" disabled={saving}>
							{saving ? "Saving..." : "Save"}
						</button>
						{saved && <span className="settingsPricingSaved">Saved</span>}
					</div>
				)}
			</form>

			{!canEdit && (
				<p className="settingsPanelHelp">
					Only a shop admin can change these.
				</p>
			)}
			{error && <div className="settingsError">{error}</div>}
		</IBCardWrapper>
	);
};

export default SquarePricingPanel;
