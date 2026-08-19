import React, { useEffect, useState } from "react";
import { useMutation, useApolloClient } from "@apollo/client";
import moment from "moment";
import { Button, Chip } from "@mui/material";
import { PlayArrow, Stop, RestartAlt, Save, Delete } from "@mui/icons-material";
import { AppointmentService } from "../../services/AppointmentService";
import IBInput from "../inputs/IBInput";
import IBMultilineInput from "../inputs/IBMultilineInput";
import IBDateTimePicker from "../inputs/IBDateTimePicker";
import IBSquarePaymentForm from "../IBSquarePayments/IBSquarePaymentForm";
import FormField from "../formField/FormField";
import SendAutoResponseButton from "../autoResponses/SendAutoResponseButton";
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
	//
	// This is what the artist is offering as the session's date/time WHILE IT'S OPEN. Once the
	// session is actually closed the server overrides appointmentDate to the moment of closing
	// (see mutations/appointments.js's updateAppointment and routes/squarePayments.js) - reports
	// run off when the money actually moved, not off a schedule that may have shifted. See
	// DECISIONS.md.
	const [sessionDate, setSessionDate] = useState(moment(initialAppointment.appointmentDate));
	const [deleting, setDeleting] = useState(false);
	// Tattoo work and tip are the only two money figures an artist ever types in - see the render
	// below. Controlled (not refs) because tax/fees/the total now recompute live as these change,
	// which needs React to see every keystroke rather than only the value at save time.
	//
	// Lazy initializer (runs once, at mount) rather than a plain expression - it needs
	// computeSessionSubtotalCents/getEffectiveRate purely to default an EMPTY subtotal to the
	// suggested figure, the same fallback the old uncontrolled defaultValue had
	// (`appointment.subtotalCents ?? suggestedSubtotalCents`). The LIVE versions of those two
	// functions, used for the render and the "Use Suggested" button, are declared further down and
	// track appointment (state), not this one-time initial value.
	const [subtotalDollars, setSubtotalDollars] = useState(() => {
		const initialSuggestedCents = computeSessionSubtotalCents(
			getLiveElapsedSeconds(initialAppointment),
			getEffectiveRate(project?.artist, project?.artist?.shop, connections)
		);
		return String(centsToDollars(initialAppointment.subtotalCents ?? initialSuggestedCents));
	});
	const [tipDollars, setTipDollars] = useState(String(centsToDollars(initialAppointment.tipCents)));
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
	const [recordAdjustment, { loading: recordingAdjustment }] = useMutation(
		AppointmentService.RECORD_ADJUSTMENT
	);
	// DECISIONS.md M4 - see the Adjustments section in the render below. Local, uncontrolled-style
	// state that clears itself on a successful save, same pattern the rest of this form doesn't
	// use (those fields stay populated because they describe the session itself) - this one is a
	// log entry, not a persistent field, so there's nothing to leave filled in afterward.
	const [adjustmentDollars, setAdjustmentDollars] = useState("");
	const [adjustmentReason, setAdjustmentReason] = useState("");
	const [applyDeposit, { loading: applyingDeposit }] = useMutation(DepositService.APPLY_DEPOSIT);
	// Used ONLY for the final, deliberate quote right before a card is actually reached for
	// (handleChargeViaSquare) - one call, on a click, with nothing else in flight against it.
	const [fetchChargeQuote, { loading: quoting }] = AppointmentService.useChargeQuote();
	// Used for every OTHER quote - the live preview as the artist types and the fresh quote taken
	// right before any save. A plain client.query() rather than the useLazyQuery hook above: those
	// calls fire repeatedly and close together (every keystroke, debounced), and Apollo's lazy
	// query execute function shares one underlying observable across every call from the same
	// hook instance - a fast second call can resolve against the first call's in-flight state
	// rather than its own, which is exactly the kind of intermittent, hard-to-notice failure that
	// would look like "the total just stopped updating." client.query() has no shared state to
	// collide with - every call is its own independent request.
	const apolloClient = useApolloClient();

	// The Square_Fee_Offset is OFFERED, never applied silently (DECISIONS.md M5) - so this starts
	// false and only the artist's own tick turns it on. The amount it adds is the server's to
	// compute; this is only the choice.
	const [applyFeeOffset, setApplyFeeOffset] = useState(false);

	// Live tax/fee/total preview - the server's answer (utils/charge-quote.js), the same function
	// that decides what Square actually charges, queried with the CURRENT unsaved subtotal/tip so
	// the numbers on screen update as the artist types instead of only after a save. See
	// getFreshQuote below for why this state is never itself trusted at save/charge time - it's
	// display only, and a stale debounced value here must never become what gets written or
	// charged.
	const [quote, setQuote] = useState(null);
	// Surfaced rather than swallowed - an earlier version of this caught every failure here and
	// just left the labels blank, which is indistinguishable on screen from "nothing typed yet"
	// and impossible to diagnose from the UI. If the quote can't be computed, the reason is now
	// visible next to the figures it would have filled in.
	const [quoteError, setQuoteError] = useState(null);

	const isClosed = appointment.appointmentStatus === "completed";

	// What Square would actually charge for the CURRENT (possibly unsaved) figures on screen, via
	// getChargeQuote's subtotalCentsOverride - see utils/charge-quote.js's own comment on why that
	// override exists and why it can never reach a real charge. Used both by the debounced preview
	// below and, unwrapped, at the moment of any save/close/charge so what's written is never
	// older than what's on screen.
	//
	// client.query(), not the useLazyQuery hook further up - see that hook's own comment on why.
	const getFreshQuote = async () => {
		const subtotalCents = dollarsToCents(subtotalDollars);
		if (subtotalCents <= 0) {
			return null;
		}
		try {
			const { data: quoteData } = await apolloClient.query({
				query: AppointmentService.GET_CHARGE_QUOTE,
				variables: {
					appointmentId: appointment.id,
					applyFeeOffset,
					tipCents: dollarsToCents(tipDollars),
					subtotalCentsOverride: subtotalCents,
				},
				fetchPolicy: "network-only",
			});
			setQuoteError(null);
			return quoteData?.getChargeQuote || null;
		} catch (err) {
			setQuoteError(err.graphQLErrors?.[0]?.message || err.message);
			return null;
		}
	};

	// Debounced live preview. Closed sessions skip this entirely and read the figures actually
	// saved (see the render below) - there is nothing left to recompute and no reason to ask.
	useEffect(() => {
		if (isClosed) {
			return;
		}
		const subtotalCents = dollarsToCents(subtotalDollars);
		if (subtotalCents <= 0) {
			// No price yet - a session with nothing entered is unfinished, not free (see
			// charge-quote.js), so there's nothing to quote. Cleared rather than left stale.
			setQuote(null);
			setQuoteError(null);
			return;
		}
		let cancelled = false;
		const handle = setTimeout(() => {
			getFreshQuote().then((result) => {
				// A slower, now-superseded call landing after a newer one started must not
				// overwrite what the newer call already set - each call is independent (see
				// getFreshQuote's own comment), so nothing else here prevents that race.
				if (!cancelled) {
					setQuote(result);
				}
			});
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, 400);
		return () => {
			cancelled = true;
			clearTimeout(handle);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [subtotalDollars, tipDollars, applyFeeOffset, isClosed, appointment.id]);

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

	// Available deposits query - skipped once this session already carries a credit.
	const { data: depositData } = DepositService.getAvailableDeposits(appointment.id, {
		skip: Boolean(appointment.depositCreditCents),
	});
	const availableDeposits = depositData?.getAvailableDeposits || [];

	const effectiveRate = getEffectiveRate(project?.artist, project?.artist?.shop, connections);
	const elapsedSeconds = getLiveElapsedSeconds(appointment);
	const suggestedSubtotalCents = computeSessionSubtotalCents(elapsedSeconds, effectiveRate);

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
		setSubtotalDollars(String(centsToDollars(suggestedSubtotalCents)));
	};

	// Builds what gets SAVED. `freshQuote` is required for a non-zero subtotal - passed in by every
	// caller below, fetched synchronously right before the save, rather than reading the debounced
	// `quote` state, which can lag a few hundred milliseconds behind the box the artist just typed
	// into. Tax and fees are no longer hand-typed (see the render below): they are exactly what the
	// server just quoted for these figures, which is also exactly what Square would charge for them.
	const buildSavePayload = (freshQuote) => {
		const subtotalCents = dollarsToCents(subtotalDollars);
		const tipCents = dollarsToCents(tipDollars);
		const taxCents = freshQuote ? freshQuote.taxCents : 0;
		const feeCents = freshQuote ? freshQuote.feeOffsetCents : 0;
		// freshQuote.totalCents already accounts for the deposit credit (netSubtotalCents) and the
		// offset, in the server's own order (DECISIONS.md M8) - not re-derived here by addition,
		// which is exactly the "two totals that can disagree" bug this component used to have.
		const totalCents = freshQuote
			? freshQuote.totalCents
			: Math.max(0, subtotalCents + tipCents - (appointment.depositCreditCents || 0));
		return {
			id: appointment.id,
			appointmentDate: moment(sessionDate).toISOString(),
			subtotalCents,
			taxCents,
			feeCents,
			tipCents,
			totalCents,
			sessionNotes: notes,
		};
	};

	const handleSaveDetails = async (e) => {
		e.preventDefault();
		const freshQuote = await getFreshQuote();
		const { data } = await updateSessionDetails({
			variables: { appointmentInput: buildSavePayload(freshQuote) },
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

	// DECISIONS.md M4 - the real reversal already happened by hand in the Square app; this only
	// records that it did. amountCents is validated server-side (positive, and a non-empty reason
	// required) - see server/utils/validation.js's recordAdjustmentInputSchema - so the only
	// client-side guard needed is against firing with nothing typed in at all.
	const handleRecordAdjustment = async (e) => {
		e.preventDefault();
		const amountCents = dollarsToCents(adjustmentDollars);
		if (amountCents <= 0 || !adjustmentReason.trim()) {
			return;
		}
		try {
			const { data } = await recordAdjustment({
				variables: {
					input: { appointmentId: appointment.id, amountCents, reason: adjustmentReason.trim() },
				},
			});
			setAppointment((prev) => ({
				...prev,
				adjustments: [data.recordAdjustment, ...(prev.adjustments || [])],
			}));
			setAdjustmentDollars("");
			setAdjustmentReason("");
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: "Adjustment recorded.",
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MODAL,
			});
		} catch (err) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.graphQLErrors?.[0]?.message || err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MODAL,
			});
		}
	};

	// Closing sets appointmentStatus to 'completed' - the server (mutations/appointments.js) reacts
	// to that transition by overwriting appointmentDate to the moment this save lands, regardless of
	// what sessionDate above says. That's deliberate (DECISIONS.md): a session worked early or late
	// against its booked slot should report on the day it actually happened.
	const handleCloseSession = async (e) => {
		e.preventDefault();
		const freshQuote = await getFreshQuote();
		const { data } = await updateSessionDetails({
			variables: {
				appointmentInput: { ...buildSavePayload(freshQuote), appointmentStatus: "completed" },
			},
		});
		setAppointment((prev) => ({ ...prev, ...data.updateAppointment }));
		setSessionDate(moment(data.updateAppointment.appointmentDate));
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
	//
	// A successful charge here closes the session automatically on the server (routes/
	// squarePayments.js) - a paid-by-card session has nothing left to do, so there is no separate
	// "now click Close" step for that path. onSuccess below just reflects that back.
	const handleChargeViaSquare = async (e) => {
		e.preventDefault();
		const freshQuote = await getFreshQuote();
		const { data } = await updateSessionDetails({
			variables: { appointmentInput: buildSavePayload(freshQuote) },
		});
		setAppointment((prev) => ({ ...prev, ...data.updateAppointment }));

		// The amount is now the server's to state. Fetched rather than added up here, by the same
		// function the charge route uses, so the total on screen is the total charged. No override
		// this time - this reads the subtotal that was JUST saved, which is what the charge route
		// itself will read.
		const { data: quoteData } = await fetchChargeQuote({
			variables: {
				appointmentId: appointment.id,
				applyFeeOffset,
				tipCents: data.updateAppointment.tipCents || 0,
			},
		});
		const chargeQuote = quoteData?.getChargeQuote;
		if (!chargeQuote) {
			return;
		}
		if (!chargeQuote.canCharge) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message:
					chargeQuote.source === "shop"
						? "This shop has not connected a Square account yet."
						: "Connect Square in Settings before taking a card payment.",
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MODAL,
			});
			return;
		}

		setModal({
			isOpen: true,
			title: `Charge ${formatCents(chargeQuote.amountDueCents)} for ${project?.title || "session"}`,
			content: (
				<IBSquarePaymentForm
					// Display only - the server charges what it computed, not what is passed here.
					amountCents={chargeQuote.amountDueCents}
					appointmentId={appointment.id}
					applyFeeOffset={applyFeeOffset}
					tipCents={data.updateAppointment.tipCents || 0}
					note={`Session for project ${project?.title || ""}`}
					onSuccess={() => {
						setModal({ ...modal, isOpen: false });
						setAlert({
							isAlert: true,
							severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
							message: "Charged successfully. Session closed.",
							timeout: ALERT_CONSTANTS.TIMEOUT,
							location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
						});
						// The server just wrote the breakdown, closed the session and recomputed the
						// shop cut against the new subtotal. Without this the view keeps showing
						// pre-charge values.
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

	// Closed: read exactly what was saved - there's nothing left to quote and no reason to ask the
	// server to recompute a figure that already left the client's card. Open: the live preview.
	const displayTaxCents = isClosed ? appointment.taxCents || 0 : quote?.taxCents;
	const displayFeeCents = isClosed ? appointment.feeCents || 0 : quote?.feeOffsetCents;
	const displayTotalCents = isClosed ? appointment.totalCents || 0 : quote?.amountDueCents;
	const hasDisplayFigures = isClosed || Boolean(quote);
	const subtotalCentsEntered = dollarsToCents(subtotalDollars);

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

			{/* Tattoo work and tip are the only figures an artist ever types in here. Tax, fees, the
			    offset and the total are read-only - generated automatically by the same server
			    function that decides what Square will actually charge (utils/charge-quote.js), so
			    what's shown here is never a number someone could disagree with the card over. */}
			<div className="sessionDetailMoney">
				<div className="sessionDetailMoneyRow">
					<FormField
						id="sessionSubtotal"
						label="Tattoo work $"
						help={`Suggested from elapsed time: ${formatCents(suggestedSubtotalCents)}`}
					>
						<IBInput
							id="sessionSubtotal"
							type="number"
							onFocus={(e) => e.target.select()}
							autoFocus
							value={subtotalDollars}
							onChange={(e) => setSubtotalDollars(e.target.value)}
							disabled={isClosed}
						/>
					</FormField>
					<Button variant="text" onClick={handleUseSuggested} disabled={isClosed}>
						Use Suggested
					</Button>
				</div>
				<div className="sessionDetailMoneyRow">
					<FormField
						id="sessionTip"
						label="Tip $"
						help="The artist keeps 100% of this - never part of the shop cut"
					>
						<IBInput
							id="sessionTip"
							type="number"
							value={tipDollars}
							onChange={(e) => setTipDollars(e.target.value)}
							disabled={isClosed}
						/>
					</FormField>
					<div className="sessionDetailMoneyLabel">
						<span className="sessionDetailMoneyLabelName">Tax</span>
						<span className="sessionDetailMoneyLabelValue">
							{hasDisplayFigures ? formatCents(displayTaxCents) : "—"}
						</span>
						<span className="sessionDetailMoneyLabelHint">
							Not income - excluded from the shop cut
						</span>
					</div>
					<div className="sessionDetailMoneyLabel">
						<span className="sessionDetailMoneyLabelName">Fees</span>
						<span className="sessionDetailMoneyLabelValue">
							{hasDisplayFigures ? formatCents(displayFeeCents) : "—"}
						</span>
						<span className="sessionDetailMoneyLabelHint">
							Processing fees - excluded from the shop cut
						</span>
					</div>
				</div>
				{/* The offset is a CHOICE, presented before the card is charged and never applied
				    silently (DECISIONS.md M5). Unticked by default. Sits right under Tax/Fees and
				    above the total it affects, so the relationship between checking this and the
				    total below moving is visible rather than something to discover in a charge
				    dialog. No separate "Offset Fee" line - when this is checked the amount already
				    shows up in Fees above, and a second label repeating the same figure under a
				    different name read as confusing rather than clarifying. */}
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
				{/* The actual total the client owes right now - subtotal, tip, tax and the offset,
				    minus any deposit already credited (DECISIONS.md M8). This is computed by the
				    exact same function routes/squarePayments.js charges, so it is not an estimate:
				    if a card is charged for this session, this is the figure that leaves it. */}
				<div className="sessionDetailMoneyRow">
					<div className="sessionDetailMoneyLabel sessionDetailMoneyLabelTotal">
						<span className="sessionDetailMoneyLabelName">Total charged to client</span>
						<span className="sessionDetailMoneyLabelValue">
							{hasDisplayFigures ? formatCents(displayTotalCents) : "—"}
						</span>
					</div>
				</div>
				{/* Only reachable when there's a real subtotal typed in and hasDisplayFigures is
				    still false - i.e. the quote was asked for and failed, rather than never asked
				    for. See getFreshQuote's own comment on why this used to be swallowed silently. */}
				{!isClosed && quoteError && (
					<div className="sessionDetailQuoteError">
						Couldn't calculate tax/fees/total: {quoteError}
					</div>
				)}
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

			{/* DECISIONS.md M4 - "Nothing in InkBooks is refundable." The real reversal happens by
			    hand in the Square app; this is only the documented record of it. Recording one does
			    NOT change subtotalCents/tipCents/totalCents above - see server/models/Adjustment.js. */}
			<div className="sessionDetailAdjustments">
				<span className="sessionDetailAdjustmentsLabel">Adjustments</span>
				{appointment.adjustments && appointment.adjustments.length > 0 ? (
					<div className="sessionDetailAdjustmentsList">
						{appointment.adjustments.map((adjustment) => (
							<div key={adjustment.id} className="sessionDetailAdjustmentRow">
								<span className="sessionDetailAdjustmentAmount">
									{formatCents(adjustment.amountCents)}
								</span>
								<span className="sessionDetailAdjustmentReason">{adjustment.reason}</span>
								<span className="sessionDetailAdjustmentMeta">
									{moment(adjustment.createdAt).format("MMM D, YYYY")}
									{adjustment.createdBy
										? ` — ${adjustment.createdBy.firstName} ${adjustment.createdBy.lastName}`
										: ""}
								</span>
							</div>
						))}
					</div>
				) : (
					<span className="sessionDetailAdjustmentsEmpty">None recorded.</span>
				)}
				<div className="sessionDetailAdjustmentForm">
					<FormField id="adjustmentAmount" label="Amount reversed $">
						<IBInput
							id="adjustmentAmount"
							type="number"
							value={adjustmentDollars}
							onChange={(e) => setAdjustmentDollars(e.target.value)}
						/>
					</FormField>
					<FormField id="adjustmentReason" label="Reason">
						<IBInput
							id="adjustmentReason"
							type="text"
							placeholder="e.g. Reversed $50 in Square after a client dispute"
							value={adjustmentReason}
							onChange={(e) => setAdjustmentReason(e.target.value)}
						/>
					</FormField>
					<Button
						variant="outlined"
						disabled={
							recordingAdjustment ||
							dollarsToCents(adjustmentDollars) <= 0 ||
							!adjustmentReason.trim()
						}
						onClick={handleRecordAdjustment}
					>
						Record Adjustment
					</Button>
				</div>
			</div>

			<FormField id="sessionNotes" label="Session Notes">
				<IBMultilineInput
					id="sessionNotes"
					defaultValue={notes}
					disabled={isClosed}
					onChange={(e) => setNotes(e.target.value)}
				/>
			</FormField>

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
					disabled={isClosed || saving || quoting || subtotalCentsEntered <= 0}
				>
					{quoting ? "Checking..." : "Charge via Square"}
				</Button>
				<Button
					variant="contained"
					disabled={isClosed || saving}
					onClick={handleCloseSession}
				>
					Close Session
				</Button>
				{/* The manual half of Auto-Responses (decision #7 - see that component's own header
				    comment) - aftercare, a receipt note, or anything else in the viewer's library,
				    sent to this session's own client on demand. project.clientId is the Client
				    document's own _id (see models/Project.js - NOT the client's User._id), the same
				    id ClientDashboard.jsx passes for its own copy of this button. Renders nothing if
				    there's nothing to send, so this is safe even before project.clientId exists. */}
				<SendAutoResponseButton clientId={project?.clientId} appointmentId={appointment.id} />
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
