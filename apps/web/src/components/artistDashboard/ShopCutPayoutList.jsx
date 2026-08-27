import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { Button, Checkbox } from "@mui/material";
import { AppointmentService } from "../../services/AppointmentService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { formatCents } from "../../utils/money";
import { tagColorRowStyle } from "../../utils/tagColor";
import "./shopCutPayoutList.css";

// Matches server/models/Appointment.js's shopCutStatus lifecycle. In practice every row this
// component ever renders is 'unpaid' - both getShopCutPayoutCandidates and its shop-wide
// counterpart filter to shopCutStatus: 'unpaid' server-side, since invoice_sent/
// pending_confirmation already have an action in flight elsewhere (see this list's own top
// comment). Shown anyway for the same reason AppointmentsList.jsx/ArtistPerformancePanel.jsx show
// their own status columns: explicit beats implied, and a row's state shouldn't require knowing
// the query's filter to know what it means.
const SHOP_CUT_STATUS_LABELS = {
	none: "None",
	unpaid: "Unpaid",
	invoice_sent: "Invoice sent",
	pending_confirmation: "Pending confirmation",
	paid: "Paid",
	received: "Received",
};

/**
 * Replaces the old per-appointment shop-cut panel that used to live inside
 * Create/UpdateEventDialog (see PRODUCTION_ROADMAP.md's Phase 7 section) - this is the one place
 * an artist manages what they owe the shop, across every completed session at once, instead of
 * hunting down and reopening each appointment individually.
 *
 * Rendered for `isSelf` (see ArtistPerformancePanel.jsx), in one of two shapes:
 *   - a plain artist's own payouts: every row is theirs, every action button works.
 *   - a shop admin's shopWide dashboard: every artist's payouts in one list (showArtist=true).
 *     The mutations this calls (createShopCutInvoice/createBatchShopCutInvoice/
 *     markShopCutPaidManually) are all self-service, server-checked against
 *     `String(user.id) === String(appointment.userId)` - so a shop admin's OWN rows in that list
 *     still work, but another artist's rows would just 403 if the buttons were shown. Rather than
 *     let the admin discover that by clicking, rows that aren't `viewerId`'s own hide the
 *     checkbox and action buttons and show a plain "owed by <artist>" state instead.
 *
 * Props:
 * - appointments: everything owed, straight from getShopCutPayoutCandidates (one artist) or
 *   getShopCutPayoutCandidatesByShop (the whole shop). Deliberately unpaginated - the task is
 *   settling a debt, and "invoice all" over a paged list is ambiguous about what it covers. The
 *   completed/unpaid/has-a-shop filtering used to happen in ArtistPerformancePanel; it's in the
 *   resolver now, where it can't drift from the shop-cut ledger's own definition of what's payable.
 * - onChanged(): called after any successful action, so the parent can refetch and this list
 *   naturally drops rows that are no longer unpaid
 * - showArtist: shopWide mode - show which artist each row belongs to, and gate the self-service
 *   actions to the viewer's own rows only.
 * - viewerId: who's looking, needed only to decide which rows are "own" in shopWide mode.
 */
const ShopCutPayoutList = ({ appointments, onChanged, showArtist = false, viewerId }) => {
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
			{appointments.map((appointment) => {
				// Only meaningful in shopWide mode - a plain artist's own list is entirely their
				// own rows by construction (getShopCutPayoutCandidates is already scoped to them),
				// so this is always true there regardless of the id comparison.
				const isOwn = !showArtist || String(appointment.userId) === String(viewerId);
				const clientName = appointment.project?.client?.user
					? `${appointment.project.client.user.firstName} ${appointment.project.client.user.lastName}`
					: "";
				return (
					// No hover tint here: these rows aren't clickable - the actions are individual
					// buttons - so a hover response would advertise an affordance that doesn't exist.
					<div
						key={appointment.id}
						className="shopCutPayoutRow"
						style={tagColorRowStyle(appointment.user?.tagColor)}
					>
						{isOwn ? (
							<Checkbox
								checked={selectedIds.includes(appointment.id)}
								onChange={() => toggleSelected(appointment.id)}
							/>
						) : (
							// Reserves the same width the checkbox would take, so the info column
							// still lines up between rows that are and aren't the viewer's own.
							<div className="shopCutPayoutCheckboxSpacer" />
						)}
						<div className="shopCutPayoutRowInfo">
							<span className="shopCutPayoutRowDate">
								{new Date(appointment.appointmentDate).toLocaleDateString()}
							</span>
							{/* project title/status/client name - previously this row showed only
							    the date and the amount owed, with no way to tell which project (or
							    which client's session) a given cut belonged to. Fixed-width columns,
							    matching AppointmentsList.jsx/ArtistPerformancePanel.jsx's row layout -
							    see this component's own CSS note on why. */}
							<span className="shopCutPayoutRowProject">
								{appointment.project?.title || appointment.title || "(untitled)"}
								{appointment.project?.status ? ` · ${appointment.project.status}` : ""}
							</span>
							<span className="shopCutPayoutRowClient">{clientName}</span>
							<span className="shopCutPayoutRowStatus">
								{SHOP_CUT_STATUS_LABELS[appointment.shopCutStatus] ||
									appointment.shopCutStatus}
							</span>
							{showArtist && (
								<span className="shopCutPayoutRowArtist">
									{appointment.user
										? `${appointment.user.firstName} ${appointment.user.lastName}`
										: ""}
								</span>
							)}
							<span className="shopCutPayoutRowAmount">
								{formatCents(appointment.shopCutCents)}
							</span>
						</div>
						{isOwn ? (
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
						) : (
							// Not this viewer's session to settle - the mutations are self-service
							// and would just 403 (see this component's own top comment), so no
							// buttons are offered rather than offering ones that fail.
							<div className="shopCutPayoutRowActions shopCutPayoutRowActionsReadOnly">
								Owed by {appointment.user?.firstName || "this artist"}
							</div>
						)}
					</div>
				);
			})}
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
