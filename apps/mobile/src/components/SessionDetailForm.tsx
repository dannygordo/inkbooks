import { useApolloClient } from '@apollo/client';
import type {
  GetAppointmentsByProjectQuery,
  GetArtistShopConnectionsQuery,
  GetProjectDetailQuery,
} from '@inkbooks/api';
import {
  GetChargeQuoteDocument,
  useApplyDepositMutation,
  useDeleteAppointmentMutation,
  useGetAvailableDepositsQuery,
  useRecordAdjustmentMutation,
  useResetSessionTimerMutation,
  useStartSessionTimerMutation,
  useStopSessionTimerMutation,
  useUpdateSessionDetailsMutation,
} from '@inkbooks/api';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { FormField } from '@/components/FormField';
import { SquarePaymentForm } from '@/components/SquarePaymentForm';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  centsToDollars,
  dollarsToCents,
  formatCents,
} from '@/utils/money';
import {
  computeSessionSubtotalCents,
  formatElapsed,
  getEffectiveRate,
  getLiveElapsedSeconds,
} from '@/utils/sessionRate';

type Appointment = NonNullable<GetAppointmentsByProjectQuery['getAppointmentsByProject']>[number];
type Project = NonNullable<GetProjectDetailQuery['getProject']>;
type Connection = NonNullable<NonNullable<GetArtistShopConnectionsQuery['getArtistShopConnections']>[number]>;

type SessionDetailFormProps = {
  appointment: NonNullable<Appointment>;
  project: Project;
  connections: Connection[];
  refetchSessions: () => Promise<unknown>;
  onClosed: () => void;
  onDeleted: () => void;
};

/**
 * Mobile port of apps/web's SessionDetail.jsx - the densest of the four screens this batch adds.
 * Full parity for timer controls, the live tax/tip/total preview, adjustments, deposit-apply,
 * save, close, and (see DECISIONS.md's X13 entry) Charge via Square - ported via
 * SquarePaymentForm.tsx's WebView-hosted card field, since mobile has no native Square SDK.
 * Still deliberately OMITTED: SendAutoResponseButton (never in scope for this port - a separate
 * auto-responses feature, not an appointment-opening destination).
 *
 * Unlike web, this component doesn't keep a locally-mirrored `appointment` state that every
 * mutation handler manually merges into - `appointment` here is a prop sourced from the parent's
 * live GetAppointmentsByProject query, and every mutation below (timer start/stop/reset, save,
 * close, applyDeposit) returns enough Appointment fields with a matching `id` for Apollo's
 * normalized cache to merge the change in and re-render this component with the fresh value on
 * its own - one fewer manually-synced copy of server state than web needed. recordAdjustment is
 * the one exception: it returns only the new Adjustment, not the appointment's whole adjustments
 * array, so there's nothing for normalized cache to merge it into - that handler explicitly
 * refetches the parent's session list instead (refetchSessions), the same refetch-based pattern
 * this port already uses for Add Deposit/Add Session elsewhere.
 */
export function SessionDetailForm({
  appointment,
  project,
  connections,
  refetchSessions,
  onClosed,
  onDeleted,
}: SessionDetailFormProps) {
  const apolloClient = useApolloClient();
  const theme = useTheme();

  const isClosed = appointment.appointmentStatus === 'completed';

  const [sessionDate, setSessionDate] = useState(new Date(appointment.appointmentDate));
  const notesRef = useRef(appointment.sessionNotes ?? '');
  const [deleting, setDeleting] = useState(false);

  const effectiveRate = getEffectiveRate(project.artist, project.artist?.shop, connections);
  const elapsedSecondsInitial = getLiveElapsedSeconds(appointment);
  const suggestedSubtotalCentsInitial = computeSessionSubtotalCents(elapsedSecondsInitial, effectiveRate);

  const [subtotalDollars, setSubtotalDollars] = useState(() =>
    String(centsToDollars(appointment.subtotalCents ?? suggestedSubtotalCentsInitial)),
  );
  const [tipDollars, setTipDollars] = useState(String(centsToDollars(appointment.tipCents)));
  const [applyFeeOffset, setApplyFeeOffset] = useState(false);
  const [quote, setQuote] = useState<{
    taxCents?: number | null;
    feeOffsetCents?: number | null;
    totalCents?: number | null;
    amountDueCents?: number | null;
  } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Forces a re-render every second while the timer is running - the underlying value is always
  // recomputed fresh from accumulatedSeconds/timerStartedAt (getLiveElapsedSeconds), never itself
  // stored client-side.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (appointment.timerStatus !== 'running') {
      return;
    }
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [appointment.timerStatus]);

  const elapsedSeconds = getLiveElapsedSeconds(appointment);
  const suggestedSubtotalCents = computeSessionSubtotalCents(elapsedSeconds, effectiveRate);

  const [startTimer] = useStartSessionTimerMutation();
  const [stopTimer] = useStopSessionTimerMutation();
  const [resetTimer] = useResetSessionTimerMutation();
  const [updateSessionDetails, { loading: saving }] = useUpdateSessionDetailsMutation();
  const [deleteAppointment] = useDeleteAppointmentMutation();
  const [recordAdjustment, { loading: recordingAdjustment }] = useRecordAdjustmentMutation();
  const [applyDeposit, { loading: applyingDeposit }] = useApplyDepositMutation();

  const [adjustmentDollars, setAdjustmentDollars] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');

  const { data: depositData } = useGetAvailableDepositsQuery({
    variables: { appointmentId: appointment.id },
    skip: Boolean(appointment.depositCreditCents),
  });
  const availableDeposits = (depositData?.getAvailableDeposits ?? []).filter((d): d is NonNullable<typeof d> =>
    Boolean(d),
  );

  // Fresh, non-debounced quote - used only right before a save/close actually happens, so what's
  // written is never older than what's on screen. A plain client.query() rather than a lazy-query
  // hook: those calls share one underlying observable per hook instance, and a fast second call
  // can resolve against the first call's in-flight state rather than its own - see web's own
  // comment on why this exact call shape matters here.
  const getFreshQuote = async () => {
    const subtotalCents = dollarsToCents(subtotalDollars);
    if (subtotalCents <= 0) {
      return null;
    }
    try {
      const { data: quoteData } = await apolloClient.query({
        query: GetChargeQuoteDocument,
        variables: {
          appointmentId: appointment.id,
          applyFeeOffset,
          tipCents: dollarsToCents(tipDollars),
          subtotalCentsOverride: subtotalCents,
        },
        fetchPolicy: 'network-only',
      });
      setQuoteError(null);
      return quoteData?.getChargeQuote ?? null;
    } catch (err) {
      setQuoteError((err as Error).message);
      return null;
    }
  };

  // Debounced live preview - closed sessions skip this entirely, there's nothing left to quote.
  useEffect(() => {
    if (isClosed) {
      return;
    }
    const subtotalCents = dollarsToCents(subtotalDollars);
    if (subtotalCents <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      getFreshQuote().then((result) => {
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

  const handleStart = () => startTimer({ variables: { appointmentId: appointment.id } });
  const handleStop = () => stopTimer({ variables: { appointmentId: appointment.id } });
  const handleReset = () => resetTimer({ variables: { appointmentId: appointment.id } });

  const handleUseSuggested = () => setSubtotalDollars(String(centsToDollars(suggestedSubtotalCents)));

  const buildSavePayload = (freshQuote: Awaited<ReturnType<typeof getFreshQuote>>) => {
    const subtotalCents = dollarsToCents(subtotalDollars);
    const tipCents = dollarsToCents(tipDollars);
    const taxCents = freshQuote ? freshQuote.taxCents : 0;
    const feeCents = freshQuote ? freshQuote.feeOffsetCents : 0;
    const totalCents = freshQuote
      ? freshQuote.totalCents
      : Math.max(0, subtotalCents + tipCents - (appointment.depositCreditCents ?? 0));
    return {
      id: appointment.id,
      appointmentDate: sessionDate.toISOString(),
      subtotalCents,
      taxCents,
      feeCents,
      tipCents,
      totalCents,
      sessionNotes: notesRef.current,
    };
  };

  const handleSaveDetails = async () => {
    const freshQuote = await getFreshQuote();
    const { data } = await updateSessionDetails({ variables: { appointmentInput: buildSavePayload(freshQuote) } });
    if (data?.updateAppointment) {
      setSessionDate(new Date(data.updateAppointment.appointmentDate));
    }
  };

  const handleCloseSession = async () => {
    const freshQuote = await getFreshQuote();
    const { data } = await updateSessionDetails({
      variables: { appointmentInput: { ...buildSavePayload(freshQuote), appointmentStatus: 'completed' } },
    });
    if (data?.updateAppointment) {
      setSessionDate(new Date(data.updateAppointment.appointmentDate));
    }
    onClosed();
  };

  // SAVE FIRST, THEN CHARGE - direct port of web's handleChargeViaSquare and its own comment on
  // why: the server charges the session's SAVED subtotal (server/utils/charge-quote.js), so an
  // artist who edits the price and charges without saving must not silently charge the edit while
  // recording something else. canCharge is checked (chargeQuote.graphql) before the card field
  // ever renders, so the UI says "no Square account connected" up front rather than after a failed
  // charge attempt.
  const [squareModal, setSquareModal] = useState<{ amountDueCents: number; tipCents: number } | null>(null);
  const [checkingCharge, setCheckingCharge] = useState(false);
  const [chargeCheckError, setChargeCheckError] = useState<string | null>(null);

  const handleChargeViaSquare = async () => {
    setCheckingCharge(true);
    setChargeCheckError(null);
    try {
      const freshQuote = await getFreshQuote();
      const { data } = await updateSessionDetails({ variables: { appointmentInput: buildSavePayload(freshQuote) } });
      if (data?.updateAppointment) {
        setSessionDate(new Date(data.updateAppointment.appointmentDate));
      }
      const tipCentsSaved = data?.updateAppointment?.tipCents ?? 0;

      const { data: quoteData } = await apolloClient.query({
        query: GetChargeQuoteDocument,
        variables: { appointmentId: appointment.id, applyFeeOffset, tipCents: tipCentsSaved },
        fetchPolicy: 'network-only',
      });
      const chargeQuote = quoteData?.getChargeQuote;
      if (!chargeQuote) {
        return;
      }
      if (!chargeQuote.canCharge) {
        setChargeCheckError(
          chargeQuote.source === 'shop'
            ? 'This shop has not connected a Square account yet.'
            : 'Connect Square in Settings before taking a card payment.',
        );
        return;
      }
      setSquareModal({ amountDueCents: chargeQuote.amountDueCents, tipCents: tipCentsSaved });
    } catch (err) {
      setChargeCheckError((err as Error).message);
    } finally {
      setCheckingCharge(false);
    }
  };

  const handleDeleteSession = () => {
    // RN has no window.confirm - Alert.alert is the platform equivalent, same
    // confirm-before-destructive-action pattern web uses elsewhere.
    Alert.alert('Delete this session?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteAppointment({ variables: { appointmentId: appointment.id } });
            onDeleted();
          } catch {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleRecordAdjustment = async () => {
    const amountCents = dollarsToCents(adjustmentDollars);
    if (amountCents <= 0 || !adjustmentReason.trim()) {
      return;
    }
    await recordAdjustment({
      variables: { input: { appointmentId: appointment.id, amountCents, reason: adjustmentReason.trim() } },
    });
    setAdjustmentDollars('');
    setAdjustmentReason('');
    await refetchSessions();
  };

  const handleApplyDeposit = (depositAppointmentId: string) => async () => {
    await applyDeposit({ variables: { depositAppointmentId, targetAppointmentId: appointment.id } });
  };

  const displayTaxCents = isClosed ? appointment.taxCents ?? 0 : quote?.taxCents;
  const displayFeeCents = isClosed ? appointment.feeCents ?? 0 : quote?.feeOffsetCents;
  const displayTotalCents = isClosed ? appointment.totalCents ?? 0 : quote?.amountDueCents;
  const hasDisplayFigures = isClosed || Boolean(quote);
  const subtotalCentsEntered = dollarsToCents(subtotalDollars);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.statusRow}>
        <ThemedText type="smallBold">{isClosed ? 'Completed' : 'In progress'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Rate: {effectiveRate.source === 'shop' ? 'Shop' : 'Artist'} -{' '}
          {effectiveRate.billingType === 'flat_rate' ? `$${effectiveRate.flatRate} flat` : `$${effectiveRate.hourlyRate}/hr`}
        </ThemedText>
      </View>

      <DateTimeField label="Session date & time" value={sessionDate} onChange={setSessionDate} testID="session-date" />

      <View style={styles.timer}>
        <ThemedText type="title" style={styles.elapsed}>
          {formatElapsed(elapsedSeconds)}
        </ThemedText>
        <View style={styles.timerButtons}>
          <Button
            label="Start"
            variant="secondary"
            disabled={appointment.timerStatus === 'running' || isClosed}
            onPress={handleStart}
            testID="session-timer-start"
          />
          <Button
            label="Stop"
            variant="secondary"
            disabled={appointment.timerStatus !== 'running'}
            onPress={handleStop}
            testID="session-timer-stop"
          />
          <Button label="Reset" variant="secondary" disabled={isClosed} onPress={handleReset} testID="session-timer-reset" />
        </View>
      </View>

      <View style={styles.moneySection}>
        <FormField
          label={`Tattoo work $ (suggested from elapsed time: ${formatCents(suggestedSubtotalCents)})`}
          value={subtotalDollars}
          onChangeText={setSubtotalDollars}
          keyboardType="decimal-pad"
          editable={!isClosed}
          testID="session-subtotal"
        />
        <Button label="Use Suggested" variant="secondary" onPress={handleUseSuggested} disabled={isClosed} testID="session-use-suggested" />

        <FormField
          label="Tip $ (the artist keeps 100% - never part of the shop cut)"
          value={tipDollars}
          onChangeText={setTipDollars}
          keyboardType="decimal-pad"
          editable={!isClosed}
          testID="session-tip"
        />

        <View style={styles.moneyRow}>
          <ThemedText type="small">Tax (excluded from the shop cut)</ThemedText>
          <ThemedText type="small">{hasDisplayFigures ? formatCents(displayTaxCents) : '—'}</ThemedText>
        </View>
        <View style={styles.moneyRow}>
          <ThemedText type="small">Fees (excluded from the shop cut)</ThemedText>
          <ThemedText type="small">{hasDisplayFigures ? formatCents(displayFeeCents) : '—'}</ThemedText>
        </View>

        {!isClosed ? (
          <View style={styles.offsetRow}>
            <Switch value={applyFeeOffset} onValueChange={setApplyFeeOffset} testID="session-fee-offset" />
            <ThemedText type="small" style={styles.offsetLabel}>
              Add the card processing offset to this charge
            </ThemedText>
          </View>
        ) : null}

        <View style={[styles.moneyRow, styles.totalRow]}>
          <ThemedText type="smallBold">Total charged to client</ThemedText>
          <ThemedText type="smallBold">{hasDisplayFigures ? formatCents(displayTotalCents) : '—'}</ThemedText>
        </View>

        {!isClosed && quoteError ? (
          <ThemedText type="small" style={styles.error} testID="session-quote-error">
            Couldn&apos;t calculate tax/fees/total: {quoteError}
          </ThemedText>
        ) : null}

        {appointment.depositCreditCents && appointment.depositCreditCents > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {formatCents(appointment.depositCreditCents)} deposit applied - already paid, deducted from this session's
            total.
          </ThemedText>
        ) : availableDeposits.length > 0 && !isClosed ? (
          <View style={styles.depositsBlock}>
            <ThemedText type="small" themeColor="textSecondary">
              Deposit available to apply
            </ThemedText>
            {availableDeposits.map((deposit) => (
              <View key={deposit.id} style={styles.depositRow}>
                <ThemedText type="small">
                  {formatCents(deposit.depositCents)} taken{' '}
                  {deposit.appointmentDate ? new Date(deposit.appointmentDate).toLocaleDateString() : ''}
                  {deposit.appointmentType === 'consult' ? ' at consult' : ''}
                </ThemedText>
                <Button
                  label="Apply to this session"
                  variant="secondary"
                  disabled={applyingDeposit}
                  onPress={handleApplyDeposit(deposit.id)}
                  testID={`session-apply-deposit-${deposit.id}`}
                />
              </View>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              A deposit can only be applied once, and can&apos;t be moved afterwards.
            </ThemedText>
          </View>
        ) : null}

        {appointment.shopCutCents && appointment.shopCutCents > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Shop cut on this session: {formatCents(appointment.shopCutCents)}
            {appointment.shopCutPercentApplied ? ` (${appointment.shopCutPercentApplied}% of the tattoo work)` : ''}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.adjustments}>
        <ThemedText type="smallBold">Adjustments</ThemedText>
        {appointment.adjustments.length > 0 ? (
          appointment.adjustments.map((adjustment) => (
            <View key={adjustment.id} style={styles.adjustmentRow}>
              <ThemedText type="small">{formatCents(adjustment.amountCents)}</ThemedText>
              <ThemedText type="small">{adjustment.reason}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {new Date(adjustment.createdAt).toLocaleDateString()}
                {adjustment.createdBy ? ` — ${adjustment.createdBy.firstName} ${adjustment.createdBy.lastName}` : ''}
              </ThemedText>
            </View>
          ))
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            None recorded.
          </ThemedText>
        )}
        <FormField label="Amount reversed $" value={adjustmentDollars} onChangeText={setAdjustmentDollars} keyboardType="decimal-pad" testID="session-adjustment-amount" />
        <FormField
          label="Reason"
          placeholder="e.g. Reversed $50 in Square after a client dispute"
          value={adjustmentReason}
          onChangeText={setAdjustmentReason}
          testID="session-adjustment-reason"
        />
        <Button
          label="Record Adjustment"
          variant="secondary"
          disabled={recordingAdjustment || dollarsToCents(adjustmentDollars) <= 0 || !adjustmentReason.trim()}
          onPress={handleRecordAdjustment}
          testID="session-record-adjustment"
        />
      </View>

      <FormField
        label="Session Notes"
        defaultValue={notesRef.current}
        onChangeText={(t) => (notesRef.current = t)}
        editable={!isClosed}
        multiline
        testID="session-notes"
      />

      {chargeCheckError ? (
        <ThemedText type="small" style={styles.error} testID="session-charge-error">
          {chargeCheckError}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Button label="Save" variant="secondary" disabled={isClosed || saving} onPress={handleSaveDetails} testID="session-save" />
        {/* Gated on the session having a PRICE, not a computed grand total - matching web's own
            comment: the total is the server's answer now, and asking for it is what this button
            does. A session with no subtotal is unfinished, and charge-quote.js refuses it. */}
        <Button
          label={checkingCharge ? 'Checking…' : 'Charge via Square'}
          variant="secondary"
          disabled={isClosed || saving || checkingCharge || subtotalCentsEntered <= 0}
          onPress={handleChargeViaSquare}
          testID="session-charge-via-square"
        />
        <Button label="Close Session" disabled={isClosed || saving} onPress={handleCloseSession} testID="session-close" />
        <Button
          label="Delete Session"
          variant="danger"
          disabled={deleting}
          onPress={handleDeleteSession}
          testID="session-delete"
        />
      </View>

      <Modal
        visible={Boolean(squareModal)}
        transparent
        animationType="slide"
        onRequestClose={() => setSquareModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
            {squareModal ? (
              <>
                <ThemedText type="smallBold">
                  Charge {formatCents(squareModal.amountDueCents)} for {project.title}
                </ThemedText>
                <SquarePaymentForm
                  amountCents={squareModal.amountDueCents}
                  appointmentId={appointment.id}
                  applyFeeOffset={applyFeeOffset}
                  tipCents={squareModal.tipCents}
                  note={`Session for project ${project.title}`}
                  onSuccess={() => {
                    setSquareModal(null);
                    onClosed();
                  }}
                  onError={() => {
                    // Surfaced inline by SquarePaymentForm itself - nothing extra to do here.
                  }}
                />
              </>
            ) : null}
            <Button label="Cancel" variant="secondary" onPress={() => setSquareModal(null)} testID="session-square-cancel" />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timer: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  elapsed: {
    fontVariant: ['tabular-nums'],
  },
  timerButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  moneySection: {
    gap: Spacing.two,
  },
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalRow: {
    marginTop: Spacing.one,
  },
  offsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  offsetLabel: {
    flexShrink: 1,
  },
  depositsBlock: {
    gap: Spacing.two,
  },
  depositRow: {
    gap: Spacing.one,
  },
  adjustments: {
    gap: Spacing.two,
  },
  adjustmentRow: {
    gap: Spacing.half,
    paddingVertical: Spacing.one,
  },
  actions: {
    gap: Spacing.two,
  },
  error: {
    color: '#D33',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderTopLeftRadius: Spacing.two,
    borderTopRightRadius: Spacing.two,
  },
});
