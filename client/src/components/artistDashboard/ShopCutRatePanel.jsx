// Explicit React import - see scripts/check-react-in-tested-components.mjs.
import React, { useState } from "react";
import moment from "moment";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import { useShopCutRates, useSetShopCutRate } from "../../services/ShopCutRateService";
import BoothRentService from "../../services/BoothRentService";
import "./shopCutRatePanel.css";

/**
 * What this artist owes the shop, and from when - now two compensation models, not one.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE HISTORY IS THE UI, not a single editable number
 *
 * A rate change applies forward only and never reprices work already performed (DECISIONS.md M7).
 * A lone input showing "40%" invites the reading that changing it changes what the artist owes -
 * including on last month's sessions - which is exactly the thing that must not happen. Showing the
 * list makes the model visible: each row is a period, adding one starts a new period, and nothing
 * above it moves. Booth rent's own plan history (below) follows the identical shape and the
 * identical reasoning - see models/BoothRentPlan.js.
 *
 * WHY THIS LIVES ON THE ARTIST'S PAGE and not in Settings
 *
 * Settings is a person's own configuration. This is a term between two parties, set by one of them
 * about the other - so it belongs where a shop admin is already looking at that artist. An artist
 * reading their own page sees the same panel without the form. Booth rent's OWN "mark this month
 * paid" action is the one piece that genuinely IS the artist's own configuration-adjacent action,
 * which is why that one lives in Settings instead (see components/settings/BoothRentPanel.jsx) -
 * everything else about booth rent (the terms, and confirming a payment) stays here, matching this
 * panel's "shop admin looking at this artist" framing exactly.
 *
 * WHY COMPENSATION MODEL LIVES HERE, ON THE SAME ROW AS THE PERCENTAGE
 *
 * ShopCutRate carries both - percent AND compensationModel - on the very same dated row (see
 * models/ShopCutRate.js). Switching models is not a separate fact from setting a rate; it IS a
 * rate change (a booth-rent artist's percent is 0 by construction), so the same "new dated row,
 * nothing above it moves" form that already exists here is the right form for it too, rather than
 * a second control living somewhere else that could disagree about which model applies as of a
 * given date.
 * ---------------------------------------------------------------------------------------------
 */
const ShopCutRatePanel = ({ artistUserId, shopId, canEdit }) => {
	const { data, loading } = useShopCutRates(artistUserId, shopId);
	const [setShopCutRate, { loading: saving }] = useSetShopCutRate();

	const [percent, setPercent] = useState("");
	const [model, setModel] = useState("PERCENTAGE");
	const [rentAmount, setRentAmount] = useState("");
	const [rentDueDay, setRentDueDay] = useState("1");
	const [effectiveFrom, setEffectiveFrom] = useState(moment().format("YYYY-MM-DD"));
	const [note, setNote] = useState("");
	const [error, setError] = useState(null);

	const { data: planData, loading: plansLoading, refetch: refetchPlans } =
		BoothRentService.getBoothRentPlans(artistUserId, shopId);
	const { data: chargeData, refetch: refetchCharges } = BoothRentService.getBoothRentCharges(
		{ artistId: artistUserId, shopId, status: "marked_paid" },
		{ skip: !shopId },
	);
	const [setBoothRentPlan, { loading: savingPlan }] = BoothRentService.useSetBoothRentPlan();
	const [confirmBoothRentPaid, { loading: confirming }] = BoothRentService.useConfirmBoothRentPaid();

	// An artist with no shop owes nobody anything, so there is nothing here to show. Rendering an
	// empty "Shop cut" card at an independent artist would be a question with no answer.
	if (!shopId) {
		return null;
	}

	const rates = data?.getShopCutRates || [];
	// Server-sorted newest first, so the row in force right now is the first one whose effectiveFrom
	// has passed. Not simply rates[0]: a back-dated future rate is a legal thing to record.
	const current = rates.find((rate) => moment(rate.effectiveFrom).isSameOrBefore(moment()));
	const currentModel = current?.compensationModel || "PERCENTAGE";

	const plans = planData?.getBoothRentPlans || [];
	const currentPlan = plans.find((plan) => moment(plan.effectiveFrom).isSameOrBefore(moment()));
	const pendingCharges = chargeData?.getBoothRentCharges?.items || [];

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError(null);

		if (model === "BOOTH_RENT") {
			const dollars = Number(rentAmount);
			const dueDay = Number(rentDueDay);
			if (!Number.isFinite(dollars) || dollars < 0) {
				setError("Enter a monthly amount of $0 or more.");
				return;
			}
			if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
				setError("Enter a due day between 1 and 31.");
				return;
			}
			try {
				const isoEffectiveFrom = moment(effectiveFrom, "YYYY-MM-DD").startOf("day").toISOString();
				await setShopCutRate({
					variables: {
						artistId: artistUserId,
						shopId,
						percent: 0,
						compensationModel: "BOOTH_RENT",
						effectiveFrom: isoEffectiveFrom,
						note,
					},
				});
				await setBoothRentPlan({
					variables: {
						artistId: artistUserId,
						shopId,
						amountCents: Math.round(dollars * 100),
						dueDayOfMonth: dueDay,
						effectiveFrom: isoEffectiveFrom,
					},
				});
				setRentAmount("");
				setNote("");
				await refetchPlans();
			} catch (err) {
				const fieldErrors = err.graphQLErrors?.[0]?.extensions?.errors;
				setError(fieldErrors ? Object.values(fieldErrors).join(" ") : err.message);
			}
			return;
		}

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
					compensationModel: "PERCENTAGE",
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

	const handleConfirmCharge = async (chargeId) => {
		try {
			await confirmBoothRentPaid({ variables: { boothRentChargeId: chargeId } });
			await refetchCharges();
		} catch (err) {
			setError(err.message);
		}
	};

	return (
		<IBCardWrapper>
			<h1>Shop cut</h1>
			<p className="settingsPanelHelp">
				What this artist owes the shop for their work here - either a percentage of each
				session, or a flat booth rent charged monthly. A change applies from its own date
				forward and never alters work already performed.
			</p>

			{loading && rates.length === 0 ? (
				<p className="shopCutRateEmpty">Loading…</p>
			) : (
				<>
					<p className="shopCutRateCurrent">
						{current ? (
							currentModel === "BOOTH_RENT" ? (
								<>
									<strong>Booth rent</strong> since{" "}
									{moment(current.effectiveFrom).format("MMM D, YYYY")}
									{currentPlan && (
										<>
											{" "}— ${(currentPlan.amountCents / 100).toFixed(2)}/month, due on
											the {currentPlan.dueDayOfMonth}
											{currentPlan.dueDayOfMonth === 1
												? "st"
												: currentPlan.dueDayOfMonth === 2
												? "nd"
												: currentPlan.dueDayOfMonth === 3
												? "rd"
												: "th"}
										</>
									)}
								</>
							) : (
								<>
									<strong>{current.percent}%</strong> since{" "}
									{moment(current.effectiveFrom).format("MMM D, YYYY")}
								</>
							)
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
									<span className="shopCutRatePercent">
										{rate.compensationModel === "BOOTH_RENT" ? "Rent" : `${rate.percent}%`}
									</span>
									<span className="shopCutRateFrom">
										from {moment(rate.effectiveFrom).format("MMM D, YYYY")}
									</span>
									{rate.note && <span className="shopCutRateNote">{rate.note}</span>}
								</li>
							))}
						</ul>
					)}

					{!plansLoading && plans.length > 0 && (
						<>
							<p className="shopCutRateCurrent" style={{ fontSize: 14 }}>
								Booth rent plan history
							</p>
							<ul className="shopCutRateHistory">
								{plans.map((plan) => (
									<li key={plan.id}>
										<span className="shopCutRatePercent">
											${(plan.amountCents / 100).toFixed(2)}
										</span>
										<span className="shopCutRateFrom">
											due day {plan.dueDayOfMonth}, from{" "}
											{moment(plan.effectiveFrom).format("MMM D, YYYY")}
										</span>
									</li>
								))}
							</ul>
						</>
					)}

					{canEdit && pendingCharges.length > 0 && (
						<div className="boothRentPendingCharges">
							<p className="shopCutRateCurrent" style={{ fontSize: 14 }}>
								Awaiting your confirmation
							</p>
							{pendingCharges.map((charge) => (
								<div className="boothRentChargeRow" key={charge.id}>
									<span>
										${(charge.amountCents / 100).toFixed(2)} for{" "}
										{moment(charge.periodMonth).utc().format("MMMM YYYY")} — the artist
										marked this paid on {moment(charge.markedPaidAt).format("MMM D, YYYY")}
									</span>
									<button
										type="button"
										className="ibButton"
										disabled={confirming}
										onClick={() => handleConfirmCharge(charge.id)}
									>
										{confirming ? "Confirming…" : "Confirm paid"}
									</button>
								</div>
							))}
						</div>
					)}
				</>
			)}

			{canEdit && (
				<form className="shopCutRateForm" onSubmit={handleSubmit}>
					<label htmlFor="shopCutModel">New rate</label>
					<div className="settingsRadioGroup" style={{ marginBottom: 12 }}>
						<label>
							<input
								type="radio"
								name="compensationModel"
								checked={model === "PERCENTAGE"}
								onChange={() => setModel("PERCENTAGE")}
							/>{" "}
							Percentage of session work
						</label>
						<label>
							<input
								type="radio"
								name="compensationModel"
								checked={model === "BOOTH_RENT"}
								onChange={() => setModel("BOOTH_RENT")}
							/>{" "}
							Flat booth rent
						</label>
					</div>

					{model === "BOOTH_RENT" ? (
						<div className="shopCutRateInputs">
							<span className="shopCutRateSuffix">$</span>
							<input
								id="boothRentAmount"
								type="number"
								min="0"
								step="0.01"
								value={rentAmount}
								onChange={(e) => setRentAmount(e.target.value)}
								placeholder="500.00"
							/>
							<span>/month, due day</span>
							<input
								id="boothRentDueDay"
								type="number"
								min="1"
								max="31"
								step="1"
								value={rentDueDay}
								onChange={(e) => setRentDueDay(e.target.value)}
								style={{ width: 60 }}
							/>
							<input
								id="boothRentEffectiveFrom"
								type="date"
								aria-label="Effective from"
								value={effectiveFrom}
								onChange={(e) => setEffectiveFrom(e.target.value)}
							/>
							<input
								id="boothRentNote"
								type="text"
								aria-label="Note"
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="Why (optional)"
							/>
						</div>
					) : (
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
					)}
					{error && <div className="settingsError">{error}</div>}
					<div className="settingsActions">
						<button
							type="submit"
							className="ibButton"
							disabled={
								saving ||
								savingPlan ||
								(model === "PERCENTAGE" ? !percent : !rentAmount)
							}
						>
							{saving || savingPlan ? "Saving…" : "Record rate"}
						</button>
					</div>
				</form>
			)}
		</IBCardWrapper>
	);
};

export default ShopCutRatePanel;
