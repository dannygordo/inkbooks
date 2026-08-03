import React, { useEffect, useRef, useState } from "react";
import { useMutation } from "@apollo/client";
import { Button, Chip } from "@mui/material";
import { PlayArrow, Stop, RestartAlt, Save } from "@mui/icons-material";
import { AppointmentService } from "../../services/AppointmentService";
import IBInput from "../inputs/IBInput";
import IBMultilineInput from "../inputs/IBMultilineInput";
import IBSquarePaymentForm from "../IBSquarePayments/IBSquarePaymentForm";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import {
	getEffectiveRate,
	computeSessionTotal,
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
 */
const SessionDetail = ({ appointment: initialAppointment, project, connections, onClosed }) => {
	const { setModal, modal, setAlert } = useAuth();
	const [appointment, setAppointment] = useState(initialAppointment);
	const [notes, setNotes] = useState(initialAppointment.sessionNotes || "");
	const totalRef = useRef();
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

	const effectiveRate = getEffectiveRate(project?.artist, project?.artist?.shop, connections);
	const elapsedSeconds = getLiveElapsedSeconds(appointment);
	const suggestedTotal = computeSessionTotal(elapsedSeconds, effectiveRate);
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
		if (totalRef.current) {
			totalRef.current.value = suggestedTotal;
		}
	};

	const buildSavePayload = () => ({
		id: appointment.id,
		appointmentDate: appointment.appointmentDate,
		total: totalRef.current?.value ? parseInt(totalRef.current.value, 10) : appointment.total,
		sessionNotes: notes,
	});

	const handleSaveDetails = async (e) => {
		e.preventDefault();
		const { data } = await updateSessionDetails({
			variables: { appointmentInput: buildSavePayload() },
		});
		setAppointment((prev) => ({ ...prev, ...data.updateAppointment }));
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message: "Session saved.",
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MODAL,
		});
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

	const handleChargeViaSquare = (e) => {
		e.preventDefault();
		const amountCents = Math.round(
			(totalRef.current?.value ? parseInt(totalRef.current.value, 10) : appointment.total || 0) *
				100
		);
		setModal({
			isOpen: true,
			title: `Charge for ${project?.title || "session"}`,
			content: (
				<IBSquarePaymentForm
					amountCents={amountCents}
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

			<div className="sessionDetailTotal">
				<IBInput
					id="sessionTotal"
					label="Session Total $"
					helperText={`Suggested from elapsed time: $${suggestedTotal}`}
					type="number"
					inputRef={totalRef}
					defaultValue={appointment.total ?? suggestedTotal}
					disabled={isClosed}
				/>
				<Button variant="text" onClick={handleUseSuggested} disabled={isClosed}>
					Use Suggested
				</Button>
			</div>

			<IBMultilineInput
				id="sessionNotes"
				label="Session Notes"
				helperText=" "
				defaultValue={notes}
				disabled={isClosed}
				onChange={(e) => setNotes(e.target.value)}
			/>

			<div className="sessionDetailActions">
				<Button
					variant="outlined"
					startIcon={<Save />}
					disabled={isClosed || saving}
					onClick={handleSaveDetails}
				>
					Save
				</Button>
				<Button
					variant="outlined"
					onClick={handleChargeViaSquare}
					disabled={!totalRef.current?.value && !appointment.total}
				>
					Charge via Square
				</Button>
				<Button
					variant="contained"
					sx={{ backgroundColor: "#333" }}
					disabled={isClosed || saving}
					onClick={handleCloseSession}
				>
					Close Session
				</Button>
			</div>
		</div>
	);
};

export default SessionDetail;
