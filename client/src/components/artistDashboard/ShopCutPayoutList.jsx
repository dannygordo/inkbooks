import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { Button, Checkbox } from "@mui/material";
import { AppointmentService } from "../../services/AppointmentService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { formatCents } from "../../utils/money";
import { tagColorRowStyle } from "../../utils/tagColor";
import "./shopCutPayoutList.css";

/**
 * Replaces the old per-appointment shop-cut panel that used to live inside
 * Create/UpdateEventDialog (see PRODUCTION_ROADMAP.md's Phase 7 section) - this is the one place
 * an artist manages what they owe the shop, across every completed session at once, instead of
 * hunting down and reopening each appointment individually.
 *
 * Only ever rendered for `isSelf` (see ArtistPerformancePanel.jsx) - the mutations this calls
 * (createShopCutInvoice/createBatchShopCutInvoice/markShopCutPaidManually) are all self-service,
 * server-checked against `String(user.id) === String(appointment.userId)`, so a shop admin
 * viewing someone else's numbers couldn't use these buttons even if they were shown.
 *
 * Props:
 * - appointments: completed, shopCutStatus === 'unpaid' sessions with a shopId (already filtered
 *   by the caller - see ArtistPerformancePanel.jsx)
 * - onChanged(): called after any successful action, so the parent can refetch and this list
 *   naturally drops rows that are no longer unpaid
 */
const ShopCutPayoutList = ({ appointments, onChanged }) => {
	const { setAlert } = useAuth();
	const [selectedIds, setSelectedIds] = useState([]);
	const [createShopCutInvoice, { loading: invoicing }] = useMutation(
		AppointmentService.CREATE_SHOP_CUT_INVOICE
	);
	const [createBatchShopCutInvoice, { loading: batchInvoicing }] = useMutation(
		AppointmentService.CREATE_BATCH_SHOP_CUT_INVOICE
	);
	const [markShopCutPaidManually, { loading: markingPaid }] = useMutation(
		AppointmentService.MARK_SHOP_CUT_PAID_MANUALLY
	);

	const showError = (err) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.ERROR,
			message: err.message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};
	const showSuccess = (message) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};

	const toggleSelected = (id) => {
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]
		);
	};

	const handleMarkPaidCash = (appointmentId) => (e) => {
		e.preventDefault();
		markShopCutPaidManually({ variables: { appointmentId } })
			.then(() => {
				showSuccess("Marked as paid - the shop has been notified to confirm.");
				if (onChanged) onChanged();
			})
			.catch(showError);
	};

	const handleSendSingleInvoice = (appointmentId) => (e) => {
		e.preventDefault();
		createShopCutInvoice({ variables: { appointmentId, paymentMethod: "card" } })
			.then((res) => {
				showSuccess(
					`Invoice sent: ${res.data.createShopCutInvoice.invoiceUrl}`
				);
				if (onChanged) onChanged();
			})
			.catch(showError);
	};

	const handleSendBatchInvoice = (e) => {
		e.preventDefault();
		createBatchShopCutInvoice({
			variables: { appointmentIds: selectedIds, paymentMethod: "card" },
		})
			.then((res) => {
				showSuccess(
					`Combined invoice sent: ${res.data.createBatchShopCutInvoice.invoiceUrl}`
				);
				setSelectedIds([]);
				if (onChanged) onChanged();
			})
			.catch(showError);
	};

	if (!appointments || appointments.length === 0) {
		return (
			<div className="shopCutPayoutEmpty">
				No outstanding shop cuts on completed sessions.
			</div>
		);
	}

	const selectedTotal = appointments
		.filter((a) => selectedIds.includes(a.id))
		.reduce((sum, a) => sum + (a.shopCutCents || 0), 0);

	return (
		<div className="shopCutPayoutList">
			{appointments.map((appointment) => (
				// No hover tint here: these rows aren't clickable - the actions are individual
				// buttons - so a hover response would advertise an affordance that doesn't exist.
				<div
					key={appointment.id}
					className="shopCutPayoutRow"
					style={tagColorRowStyle(appointment.user?.tagColor)}
				>
					<Checkbox
						checked={selectedIds.includes(appointment.id)}
						onChange={() => toggleSelected(appointment.id)}
					/>
					<div className="shopCutPayoutRowInfo">
						<span className="shopCutPayoutRowDate">
							{new Date(appointment.appointmentDate).toLocaleDateString()}
						</span>
						<span className="shopCutPayoutRowAmount">
							{formatCents(appointment.shopCutCents)} owed
						</span>
					</div>
					<div className="shopCutPayoutRowActions">
						<Button
							size="small"
							variant="outlined"
							disabled={markingPaid}
							onClick={handleMarkPaidCash(appointment.id)}
						>
							Paid (Cash)
						</Button>
						<Button
							size="small"
							variant="outlined"
							disabled={invoicing}
							onClick={handleSendSingleInvoice(appointment.id)}
						>
							Charge (Card)
						</Button>
					</div>
				</div>
			))}
			<div className="shopCutPayoutBatchBar">
				<span>
					{selectedIds.length > 0
						? `${selectedIds.length} selected - ${formatCents(selectedTotal)} total`
						: "Select multiple sessions to send one combined invoice"}
				</span>
				<Button
					variant="contained"
					sx={{ backgroundColor: "#333" }}
					disabled={selectedIds.length < 2 || batchInvoicing}
					onClick={handleSendBatchInvoice}
				>
					{batchInvoicing ? "Sending..." : "Send Combined Invoice"}
				</Button>
			</div>
		</div>
	);
};

export default ShopCutPayoutList;
