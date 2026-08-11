import React, { useEffect, useRef, useState } from "react";
import { useMutation } from "@apollo/client";
import moment from "moment";
import { Button, Chip } from "@mui/material";
import { PlayArrow, Stop, RestartAlt, Save, Delete } from "@mui/icons-material";
import { AppointmentService } from "../../services/AppointmentService";
import IBInput from "../inputs/IBInput";
import IBMultilineInput from "../inputs/IBMultilineInput";
import IBDateTimePicker from "../inputs/IBDateTimePicker";
import IBSquarePaymentForm from "../IBSquarePayments/IBSquarePaymentForm";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { formatCents, centsToDollars, dollarsToCents } from "../../utils/money";
import DepositService from "../../services/DepositService";
import {
	getEffectiveRate,
	computeSessionSubtotalCents,
	getLiveElapsedSeconds,
	formatElapsed,
} from "../../utils/sessionRate";
import "./projectSessions.css";

/**
 * Opened inside the global IBModal (see pages/projects/Project.jsx's setModal usage) when an
 * artist clicks a session in ProjectSessionsList. Shows start/stop/reset timer controls, a live
 * elapsed-time readout, an auto-computed-but-editable dollar total, a notes textarea, a "Charge
 * via Square" button (reuses the existing sandbox payment flow - see IBSquarePaymentForm's own
 * comment on why this isn't real-money infrastructure yet), and a "Close Session" action that
 * sets appointmentStatus to 'completed' - the same gate the shop-cut payout dashboard (still to
 * be built, see PRODUCTION_ROADMAP.md's Phase 7 "still to build" list) will filter on.
 *
 * Props:
 * - appointment: the session Appointment as returned by getAppointmentsByProject
 * - project: the parent Project (data.getProject from ProjectService) - carries artist/shop rate
 *   fields used to compute the suggested total
 * - connections: this artist's ArtistShopConnection records (for rateSource) - may be empty for
 *   an independent artist
 * - onClosed(): called after a successful "Close Session" save, so the parent can refresh its list
 *   and close the modal
 * - onDeleted(): called after a successful "Delete Session", so the parent can refresh its list
 *   and close the modal - separate from onClosed since "closed" (completed) and "deleted" (gone
 *   entirely) are very different outcomes for the parent to react to
 */
const SessionDetail = ({ appointment: initialAppointment, project, connections, onClosed, onDeleted }) => {
	const { setModal, modal, setAlert } = useAuth();
	const [appointment, setAppointment] = useState(initialAppointment);
	const [notes, setNotes] = useState(initialAppointment.sessionNotes || "");
	// The date/time was previously not editable anywhere in this view - buildSavePayload just
	// echoed back the original value on every save. The time matters just as much as the date for
	// a booked session, so both are now editable via the same IBDateTimePicker used elsewhere.
	const [sessionDate, setSessionDate] = useState(moment(initialAppointment.appointmentDate));
	const [deleting, setDeleting] = useState(false);
	// One ref per money component. They're captured separately because they aren't derivable from
	// each other and the shop cut depends on telling them apart - the subtotal is the artist's
	// earnings and the only thing the cut applies to; the tip is theirs entirely; tax and fees
	// belong to neither party. See models/Appointment.js.
	const subtotalRef = useRef();
	const taxRef = useRef();
	const feeRef = useRef();
	const tipRef = useRef();
	// Forces a re-render every second while the timer is running so the live elapsed readout
	// actually ticks - the underlying value is always computed fresh from
	// accumulatedSeconds/timerStartedAt (see getLiveElapsedSeconds), never stored client-side.
	const [, forceTick] = useState(0);

	useEffect(() => {
		if (appointment.timerStatus !== "running") {
			return;
		}
		const interval = setInterval(() => forceTick((n) => n + 1), 1000);
		return () => clearInterval(interval);
	}, [appointment.timerStatus]);

	const [startTimer] = useMutation(AppointmentService.START_SESSION_TIMER);
	const [stopTimer] = useMutation(AppointmentService.STOP_SESSION_TIMER);
	const [resetTimer] = useMutation(AppointmentService.RESET_SESSION_TIMER);
	const [updateSessionDetails, { loading: saving }] = useMutation(
		AppointmentService.UPDATE_SESSION_DETAILS
	);
	const [deleteAppointment] = useMutation(AppointmentService.DELETE_APPOINTMENT);
	const [applyDeposit, { loading: applyingDeposit }] = useMutation(DepositService.APPLY_DEPOSIT);
	const [fetchChargeQuote, { loading: quoting }] = AppointmentService.useChargeQuote();

	// The Square_Fee_Offset is OFFERED, never applied silently (DECISIONS.md M5) - so this starts
	// false and only the artist's own tick turns it on. The amount it adds is the server's to
	// compute; this is only the choice.
	const [applyFeeOffset, setApplyFeeOffset] = useState(false);

	// Deposits this client has already paid and not yet spent. Skipped once this session already
	// carries a credit - there's nothing to offer, and the server refuses a second one anyway.
	const { data: depositData } = DepositService.getAvailableDeposits(appointment.id, {
		skip: Boolean(appointment.depositCreditCents),
	});
	const availableDeposits = depositData?.getAvailableDeposits || [];

	const handleApplyDeposit = (depositAppointmentId) => async () => {
		try {
			const { data } = await applyDeposit({
				variables: { depositAppointmentId, targetAppointmentId: appointment.id },
			});
			setAppointment((prev) => ({ ...prev, ...data.applyDeposit }));
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: "Deposit applied.",
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MODAL,
			});
		} catch (err) {
			// The realistic failure is "already applied" - two tabs, or a double click that beat
			// the button's disabled state. The server settles it atomically; this just reports
			// what it said rather than pretending the click worked.
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.graphQLErrors?.[0]?.message || err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MODAL,
			});
		}
	};

	const effectiveRate = getEffectiveRate(project?.artist, project?.artist?.shop, connections);
	const elapsedSeconds = getLiveElapsedSeconds(appointment);
	const suggestedSubtotalCents = computeSessionSubtotalCents(elapsedSeconds, effectiveRate);
	const isClosed = appointment.appointmentStatus === "completed";

	const handleStart = async () => {
		const { data } = await startTimer({ variables: { appointmentId: appointment.id } });
		setAppointment((prev) => ({ ...prev, ...data.startSessionTimer }));
	};
	const handleStop = async () => {
		const { data } = await stopTimer({ variables: { appointmentId: appointment.id } });
		setAppointment((prev) => ({ ...prev, ...data.stopSessionTimer }));
	};
	const handleReset = async () => {
		const { data } = await resetTimer({ variables: { appointmentId: appointment.id } });
		setAppointment((prev) => ({ ...prev, ...data.resetSessionTimer }));
	};

	const handleUseSuggested = () => {
		if (subtotalRef.current) {
			subtotalRef.current.value = centsToDollars(suggestedSubtotalCents);
		}
	};

	// Reads a dollar-denominated input and returns cents, falling back to the stored value when
	// the field is empty. Note the `=== ""` check rather than a falsy one: "0" is a legitimate
	// entry (a comped session, an untipped one) and a falsy test would silently discard it in
	// favour of whatever was stored before.
	const readCents = (ref, storedCents) => {
		const raw = ref.current?.value;
		if (raw === undefined || raw === null || raw === "") {
			return storedCents || 0;
		}
		return dollarsToCents(raw);
	};

	const buildSavePayload = () => {
		const subtotalCents = readCents(subtotalRef, appointment.subtotalCents);
		const taxCents = readCents(taxRef, appointment.taxCents);
		const feeCents = readCents(feeRef, appointment.feeCents);
		const tipCents = readCents(tipRef, appointment.tipCents);
		return {
			id: appointment.id,
			appointmentDate: moment(sessionDate).toISOString(),
			subtotalCents,
			taxCents,
			feeCents,
			tipCents,
			// Derived here rather than entered - the grand total is definitionally the sum of its
			// parts at save time, MINUS any deposit already credited to this session. Clamped at
			// zero: a deposit larger than the final sitting is a real case, and a negative total
			// would be the shop owing the client money, which this flow can't hand back.
			// (The Square charge path overwrites this with what Square actually charged; see
			// routes/squarePayments.js on why the charge wins there.)
			totalCents: Math.max(
				0,
				subtotalCents + taxCents + feeCents + tipCents - (appointment.depositCreditCents || 0)
			),
			sessionNotes: notes,
		};
	};

	const handleSaveDetails = async (e) => {
		e.preventDefault();
		const { data } = await updateSessionDetails({
			variables: { appointmentInput: buildSavePayload() },
		});
		setAppointment((prev) => ({ ...prev, ...data.updateAppointment }));
		setSessionDate(moment(data.updateAppointment.appointmentDate));
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message: "Session saved.",
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MODAL,
		});
	};

	const handleDeleteSession = async () => {
		// Matches this app's existing confirm-before-destructive-action pattern (see
		// ArtistBookingRequests.jsx's handleDecline) rather than introducing a new dialog
		// component just for this one action.
		if (!window.confirm("Delete this session? This cannot be undone.")) {
			return;
		}
		setDeleting(true);
		try {
			await deleteAppointment({ variables: { appointmentId: appointment.id } });
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: "Session deleted.",
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
			if (onDeleted) {
				onDeleted();
			}
		} catch (err) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.graphQLErrors?.[0]?.message || err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MODAL,
			});
		} finally {
			setDeleting(false);
		}
	};

	const handleCloseSession = async (e) => {
		e.preventDefault();
		const { data } = await updateSessionDetails({
			variables: {
				appointmentInput: { ...buildSavePayload(), appointmentStatus: "completed" },
			},
		});
		setAppointment((prev) => ({ ...prev, ...data.updateAppointment }));
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message: "Session closed.",
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
		if (onClosed) {
			onClosed();
		}
	};

	// SAVE FIRST, THEN CHARGE. This used to open the payment form straight from the unsaved form
	// fields, so the figures being charged existed only in the browser until the charge wrote them.
	// The server now reads the session's price from the SAVED appointment (see
	// server/utils/charge-quote.js) - which is what makes "what was billed" and "what was recorded"
	// the same number rather than two numbers that happened to travel together.
	//
	// It also means an artist who edits the price and charges without saving no longer silently
	// charges the edit and records something else.
	const handleChargeViaSquare = async (e) => {
		e.preventDefault();
		const { data } = await updateSessionDetails({
			variables: { appointmentInput: buildSavePayload() },
		});
		setAppointment((prev) => ({ ...prev, ...data.updateAppointment }));

		// The amount is now the server's to state. Fetched rather than added up here, by the same
		// function the charge route uses, so the total on screen is the total charged.
		const { data: quoteData } = await fetchChargeQuote({
			variables: {
				appointmentId: appointment.id,
				applyFeeOffset,
				tipCents: data.updateAppointment.tipCents || 0,
			},
		});
		const quote = quoteData?.getChargeQuote;
		if (!quote) {
			return;
		}
		if (!quote.canCharge) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message:
					quote.source === "shop"
						? "This shop has not connected a Square account yet."
						: "Connect Square in Settings before taking a card payment.",
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MODAL,
			});
			return;
		}

		setModal({
			isOpen: true,
			title: `Charge ${formatCents(quote.amountDueCents)} for ${project?.title || "session"}`,
			content: (
				<IBSquarePaymentForm
					// Display only - the server charges what it computed, not what is passed here.
					amountCents={quote.amountDueCents}
					appointmentId={appointment.id}
					applyFeeOffset={applyFeeOffset}
					tipCents={data.updateAppointment.tipCents || 0}
					note={`Session for project ${project?.title || ""}`}
					onSuccess={() => {
						setModal({ ...modal, isOpen: false });
						setAlert({
							isAlert: true,
							severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
							message: "Charged successfully.",
							timeout: ALERT_CONSTANTS.TIMEOUT,
							location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
						});
						// The server just wrote the breakdown and recomputed the shop cut against
						// the new subtotal. Without this the view keeps showing pre-charge values.
						if (onClosed) {
							onClosed();
						}
					}}
					onError={(message) => {
						setAlert({
							isAlert: true,
							severity: ALERT_CONSTANTS.SEVERITY.ERROR,
							message: `Charge failed: ${message}`,
							timeout: ALERT_CONSTANTS.TIMEOUT,
							location: ALERT_CONSTANTS.DISPLAY_MODAL,
						});
					}}
				/>
			),
		});
	};

	return (
		<div className="sessionDetail">
			<div className="sessionDetailStatusRow">
				<Chip
					label={isClosed ? "Completed" : "In progress"}
					color={isClosed ? "success" : "default"}
				/>
				<Chip
					label={`Rate: ${effectiveRate.source === "shop" ? "Shop" : "Artist"} - ${
						effectiveRate.billingType === "flat_rate"
							? `$${effectiveRate.flatRate} flat`
							: `$${effectiveRate.hourlyRate}/hr`
					}`}
				/>
			</div>

			<IBDateTimePicker
				label="Session date & time"
				val={sessionDate}
				setVal={setSessionDate}
				disabled={isClosed}
			/>

			<div className="sessionDetailTimer">
				<div className="sessionDetailElapsed">{formatElapsed(elapsedSeconds)}</div>
				<div className="sessionDetailTimerButtons">
					<Button
						variant="outlined"
						startIcon={<PlayArrow />}
						disabled={appointment.timerStatus === "running" || isClosed}
						onClick={handleStart}
					>
						Start
					</Button>
					<Button
						variant="outlined"
						startIcon={<Stop />}
						disabled={appointment.timerStatus !== "running"}
						onClick={handleStop}
					>
						Stop
					</Button>
					<Button
						variant="outlined"
						startIcon={<RestartAlt />}
						disabled={isClosed}
						onClick={handleReset}
					>
						Reset
					</Button>
				</div>
			</div>

			{/* One field per money component, not a single "Session Total". They can't be
			    derived from each other, and the shop cut depends on telling them apart: only the
			    subtotal is the artist's earnings and only the subtotal is what the shop takes a
			    percentage of. A tip folded into a grand total is a tip the shop can end up
			    charging against. */}
			<div className="sessionDetailMoney">
				<div className="sessionDetailMoneyRow">
					<IBInput
						id="sessionSubtotal"
						label="Tattoo work $"
						helperText={`Suggested from elapsed time: ${formatCents(
							suggestedSubtotalCents
						)}`}
						type="number"
						inputRef={subtotalRef}
						defaultValue={centsToDollars(
							appointment.subtotalCents ?? suggestedSubtotalCents
						)}
						disabled={isClosed}
					/>
					<Button variant="text" onClick={handleUseSuggested} disabled={isClosed}>
						Use Suggested
					</Button>
				</div>
				<div className="sessionDetailMoneyRow">
					<IBInput
						id="sessionTip"
						label="Tip $"
						helperText="The artist keeps 100% of this - never part of the shop cut"
						type="number"
						inputRef={tipRef}
						defaultValue={centsToDollars(appointment.tipCents)}
						disabled={isClosed}
					/>
					<IBInput
						id="sessionTax"
						label="Tax $"
						helperText="Not income - excluded from the shop cut"
						type="number"
						inputRef={taxRef}
						defaultValue={centsToDollars(appointment.taxCents)}
						disabled={isClosed}
					/>
					<IBInput
						id="sessionFee"
						label="Fees $"
						helperText="Processing fees - excluded from the shop cut"
						type="number"
						inputRef={feeRef}
						defaultValue={centsToDollars(appointment.feeCents)}
						disabled={isClosed}
					/>
				</div>
				{/* Deposits. Two mutually exclusive states: one is already applied to this
				    session, or there are unspent ones available to apply. Never both - the server
				    refuses a second credit, and the query is skipped once a credit exists. */}
				{appointment.depositCreditCents > 0 ? (
					<div className="sessionDetailDepositApplied">
						{formatCents(appointment.depositCreditCents)} deposit applied - already paid,
						deducted from this session's total.
					</div>
				) : (
					availableDeposits.length > 0 &&
					!isClosed && (
						<div className="sessionDetailDeposits">
							<span className="sessionDetailDepositsLabel">
								Deposit available to apply
							</span>
							{availableDeposits.map((deposit) => (
								<div key={deposit.id} className="sessionDetailDepositRow">
									<span>
										{formatCents(deposit.depositCents)} taken{" "}
										{deposit.depositCollectedAt
											? moment(deposit.depositCollectedAt).format("MMM D, YYYY")
											: ""}
										{deposit.appointmentType === "consult" ? " at consult" : ""}
									</span>
									<Button
										size="small"
										variant="outlined"
										disabled={applyingDeposit}
										onClick={handleApplyDeposit(deposit.id)}
									>
										Apply to this session
									</Button>
								</div>
							))}
							{/* Said plainly because it's the rule that surprises people: applying
							    is one-way. The deposit is spent the moment this is clicked. */}
							<span className="sessionDetailDepositsHint">
								A deposit can only be applied once, and can't be moved afterwards.
							</span>
						</div>
					)
				)}

				{appointment.shopCutCents > 0 && (
					<div className="sessionDetailShopCutNote">
						Shop cut on this session:{" "}
						{formatCents(appointment.shopCutCents)}
						{appointment.shopCutPercentApplied
							? ` (${appointment.shopCutPercentApplied}% of the tattoo work)`
							: ""}
					</div>
				)}
			</div>

			<IBMultilineInput
				id="sessionNotes"
				label="Session Notes"
				helperText=" "
				defaultValue={notes}
				disabled={isClosed}
				onChange={(e) => setNotes(e.target.value)}
			/>

			{/* The offset is a CHOICE, presented before the card is charged and never applied
			    silently (DECISIONS.md M5). Unticked by default; the amount it adds is computed
			    server-side and appears in the charge dialog's title, not here - this component no
			    longer works out what anything costs. */}
			{!isClosed && (
				<label className="sessionDetailOffset">
					<input
						type="checkbox"
						checked={applyFeeOffset}
						onChange={(e) => setApplyFeeOffset(e.target.checked)}
					/>{" "}
					Add the card processing offset to this charge
				</label>
			)}

			<div className="sessionDetailActions">
				<Button
					variant="outlined"
					startIcon={<Save />}
					disabled={isClosed || saving}
					onClick={handleSaveDetails}
				>
					Save
				</Button>
				{/* Gated on the session having a PRICE, not on a computed grand total - the total
				    is the server's answer now and asking for it is what this button does. A
				    session with no subtotal is unfinished, and charge-quote.js refuses it. */}
				<Button
					variant="outlined"
					onClick={handleChargeViaSquare}
					disabled={isClosed || saving || quoting || readCents(subtotalRef, appointment.subtotalCents) <= 0}
				>
					{quoting ? "Checking..." : "Charge via Square"}
				</Button>
				<Button
					variant="contained"
					sx={{ backgroundColor: "#333" }}
					disabled={isClosed || saving}
					onClick={handleCloseSession}
				>
					Close Session
				</Button>
				<Button
					variant="text"
					color="error"
					startIcon={<Delete />}
					disabled={deleting}
					onClick={handleDeleteSession}
					sx={{ marginLeft: "auto" }}
				>
					Delete Session
				</Button>
			</div>
		</div>
	);
};

export default SessionDetail;
