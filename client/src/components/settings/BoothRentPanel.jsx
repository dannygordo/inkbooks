import React, { useState } from "react";
import moment from "moment";
import { Chip } from "@mui/material";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import BoothRentService from "../../services/BoothRentService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";

/**
 * Settings > Rates > "Your booth rent" - the artist's own read-only view of the flat-fee terms a
 * shop admin set for them (components/artistDashboard/ShopCutRatePanel.jsx is where those terms
 * are actually set - see that file's own header comment on why), plus the one action that
 * genuinely IS the artist's own to take: claiming a given month's rent as paid.
 *
 * RENDERS NOTHING AT ALL when there's no booth-rent plan history for this artist at their shop -
 * not a hidden section, not a "you're not on booth rent" message. An artist on the ordinary
 * percentage cut has never had a reason to think about booth rent, and a settings page that shows
 * an empty card for every feature it doesn't apply to is a worse settings page.
 */
const STATUS_LABEL = {
	due: "Due",
	marked_paid: "Awaiting confirmation",
	confirmed: "Confirmed paid",
};
const STATUS_COLOR = {
	due: "warning",
	marked_paid: "info",
	confirmed: "success",
};

const BoothRentPanel = () => {
	const { user, setAlert } = useAuth();
	const shopId = user.userInfo?.shop?.id;
	const [markingId, setMarkingId] = useState(null);

	const { data: planData } = BoothRentService.getBoothRentPlans(user.id, shopId);
	const { data: chargeData, refetch } = BoothRentService.getBoothRentCharges(
		{ artistId: user.id, page: { limit: 12 } },
		{ skip: !user.id },
	);
	const [markBoothRentPaidManually] = BoothRentService.useMarkBoothRentPaidManually();

	const plans = planData?.getBoothRentPlans || [];
	const currentPlan = plans.find((plan) => moment(plan.effectiveFrom).isSameOrBefore(moment()));
	const charges = chargeData?.getBoothRentCharges?.items || [];

	// Nothing to show - see the header comment above.
	if (plans.length === 0) {
		return null;
	}

	const showAlert = (severity, message) =>
		setAlert({
			isAlert: true,
			severity,
			message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});

	const handleMarkPaid = (chargeId) => {
		setMarkingId(chargeId);
		markBoothRentPaidManually({ variables: { boothRentChargeId: chargeId } })
			.then(() => {
				showAlert(ALERT_CONSTANTS.SEVERITY.SUCCESS, "Marked paid - awaiting the shop's confirmation.");
				return refetch();
			})
			.catch((err) => showAlert(ALERT_CONSTANTS.SEVERITY.ERROR, err.message))
			.finally(() => setMarkingId(null));
	};

	return (
		<IBCardWrapper>
			<h1>Your booth rent</h1>
			<p className="settingsPanelHelp">
				Set by your shop, not by you - this is a read-only view of the terms. Mark a month
				paid once you've settled it; your shop confirms independently before it counts as
				settled.
			</p>

			{currentPlan && (
				<p className="shopCutRateCurrent">
					<strong>${(currentPlan.amountCents / 100).toFixed(2)}</strong>/month, due on the{" "}
					{currentPlan.dueDayOfMonth}
					{currentPlan.dueDayOfMonth === 1
						? "st"
						: currentPlan.dueDayOfMonth === 2
						? "nd"
						: currentPlan.dueDayOfMonth === 3
						? "rd"
						: "th"}{" "}
					of each month
				</p>
			)}

			{charges.length > 0 && (
				<ul className="shopCutRateHistory">
					{charges.map((charge) => (
						<li key={charge.id}>
							<span className="shopCutRatePercent">
								${(charge.amountCents / 100).toFixed(2)}
							</span>
							<span className="shopCutRateFrom">
								{moment(charge.periodMonth).utc().format("MMMM YYYY")} — due{" "}
								{moment(charge.dueDate).utc().format("MMM D")}
							</span>
							<Chip
								size="small"
								color={STATUS_COLOR[charge.status] || "default"}
								label={STATUS_LABEL[charge.status] || charge.status}
							/>
							{charge.status === "due" && (
								<button
									type="button"
									className="ibButton"
									disabled={markingId === charge.id}
									onClick={() => handleMarkPaid(charge.id)}
								>
									{markingId === charge.id ? "Marking…" : "Mark paid"}
								</button>
							)}
						</li>
					))}
				</ul>
			)}
		</IBCardWrapper>
	);
};

export default BoothRentPanel;
