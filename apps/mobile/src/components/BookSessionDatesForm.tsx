import { useApolloClient } from '@apollo/client';
import {
  useConvertBookingRequestMutation,
  useCreateAppointmentMutation,
  useRecordDepositMutation,
} from '@inkbooks/api';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { DurationPicker } from '@/components/DurationPicker';
import { FormField } from '@/components/FormField';
import { SquarePaymentForm } from '@/components/SquarePaymentForm';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { SESSION_DEFAULT_MINUTES } from '@/utils/duration';
import { dollarsToCents, formatCents } from '@/utils/money';
import { getUserShopId } from '@/utils/user';

// Same refetch set apps/web's AppointmentService.CALENDAR_REFETCH_QUERIES uses - see
// appointment/[id].tsx's own copy of this constant for why it's a plain name list rather than an
// imported document array.
const CALENDAR_REFETCH_QUERIES = ['GetAppointmentsByShop', 'GetAppointmentsByArtist'];

type Sitting = { date: Date; durationMinutes: number };

type BookSessionDatesFormProps = {
  bookingRequestId: string;
  initialDate: Date;
  consultAppointmentId: string;
  onSuccess: (projectId?: string | null) => void;
  onCancel: () => void;
};

/**
 * Mobile port of apps/web's BookSessionDatesForm.jsx, now including the Square card-deposit
 * branch (DECISIONS.md's X13 entry - originally cash-only per X12, ported via
 * SquarePaymentForm.tsx's WebView-hosted card field the same way SessionDetailForm's Charge via
 * Square is). `needsMethod` gates the Cash/Card choice exactly like web's ToggleButtonGroup: only
 * asked once there's actually a deposit amount entered, no default preselected (a wrong answer
 * accepted in a hurry is worse than an unanswered one - the shop reconciles the drawer against
 * this).
 *
 * Also omitted: the per-row DaySchedule conflict-check panel (web's own "what's already on the
 * books that day" hint) - a documented v1 simplification, not a silent one; see DECISIONS.md.
 *
 * Mechanically identical to web otherwise: the FIRST sitting always goes through
 * convertBookingRequest (outcome: "session_booked", which is what creates the Project from the
 * BookingRequest's own intake fields - server/graphql/mutations/bookingRequests.js). Every
 * additional sitting is a plain createAppointment against the resulting projectId.
 *
 * RECORD FIRST, THEN CHARGE for the card path (see handleSubmit's own comment) - the deposit
 * amount is written to the consult as PENDING before any card is taken, and the charge route
 * charges the figure it finds there, so the browser/app never says what to charge and the amount
 * charged and the amount recorded cannot be two different numbers. Cash is recorded immediately
 * instead, because cash IS an assertion (someone handed over notes) with no separate settlement
 * step. Either way the deposit is recorded AFTER the booking succeeds and against the CONSULT
 * appointment (the money was taken at the consult, not the new session) - a failure recording it
 * does not roll back the booking, matching web's own comment on why.
 */
export function BookSessionDatesForm({
  bookingRequestId,
  initialDate,
  consultAppointmentId,
  onSuccess,
  onCancel,
}: BookSessionDatesFormProps) {
  const { user } = useAuth();
  const shopId = getUserShopId(user);
  const client = useApolloClient();
  const theme = useTheme();

  const [sessionDates, setSessionDates] = useState<Sitting[]>([
    { date: initialDate, durationMinutes: SESSION_DEFAULT_MINUTES },
  ]);
  const [projectTitle, setProjectTitle] = useState('');
  const [depositDollars, setDepositDollars] = useState('');
  // No default, deliberately - see this file's header comment.
  const [depositMethod, setDepositMethod] = useState<'cash' | 'square' | null>(null);
  // Set once the sessions are booked and a Square deposit still needs charging - its presence is
  // what swaps the form out for the card field, mirroring web's own pendingCardDeposit.
  const [pendingCardDeposit, setPendingCardDeposit] = useState<{
    depositCents: number;
    projectId: string | null | undefined;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [convertBookingRequest] = useConvertBookingRequestMutation();
  const [createAppointment] = useCreateAppointmentMutation();
  const [recordDeposit] = useRecordDepositMutation();

  const refetchAppointments = () => client.refetchQueries({ include: CALENDAR_REFETCH_QUERIES });

  const updateDate = (index: number, date: Date) => {
    setSessionDates((prev) => prev.map((s, i) => (i === index ? { ...s, date } : s)));
  };

  const updateDuration = (index: number, durationMinutes: number) => {
    setSessionDates((prev) => prev.map((s, i) => (i === index ? { ...s, durationMinutes } : s)));
  };

  const addDate = () => {
    // Defaults the next session a week after the last one, carrying its length forward too - same
    // "better guess than a constant" reasoning as web's own addDate.
    const last = sessionDates[sessionDates.length - 1];
    const nextDate = new Date(last.date);
    nextDate.setDate(nextDate.getDate() + 7);
    setSessionDates((prev) => [...prev, { date: nextDate, durationMinutes: last.durationMinutes }]);
  };

  const removeDate = (index: number) => {
    setSessionDates((prev) => prev.filter((_, i) => i !== index));
  };

  const depositCents = depositDollars ? dollarsToCents(depositDollars) : 0;
  const needsMethod = depositCents > 0;

  // The sessions are already booked by the time a Square deposit reaches this point; only the
  // card charge is outstanding. Direct port of web's handleCardDepositSuccess.
  const handleCardDepositSuccess = async () => {
    await refetchAppointments();
    onSuccess(pendingCardDeposit?.projectId);
  };

  const handleSubmit = async () => {
    if (!projectTitle.trim()) {
      setError('Give the project a title first.');
      return;
    }
    if (sessionDates.some((s) => !(s.durationMinutes > 0))) {
      setError('Give every session a length.');
      return;
    }
    if (needsMethod && !depositMethod) {
      setError('Say how the deposit was taken.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const [firstSitting, ...restSittings] = sessionDates;
      const { data } = await convertBookingRequest({
        variables: {
          bookingRequestId,
          outcome: 'session_booked',
          appointmentInput: {
            appointmentDate: firstSitting.date.toISOString(),
            durationMinutes: firstSitting.durationMinutes,
            shopCutStatus: 'unpaid',
            appointmentStatus: 'scheduled',
          },
          projectTitle,
        },
      });
      const projectId = data?.convertBookingRequest.resultingAppointment?.projectId;

      for (const sitting of restSittings) {
        const now = new Date().toISOString();
        await createAppointment({
          variables: {
            appointmentInput: {
              projectId,
              userId: user?.id,
              shopId,
              title: projectTitle,
              appointmentType: 'session',
              shopCutStatus: 'unpaid',
              appointmentStatus: 'scheduled',
              createdAt: now,
              updatedAt: now,
              appointmentDate: sitting.date.toISOString(),
              durationMinutes: sitting.durationMinutes,
            },
          },
        });
      }

      // Cash is recorded immediately (an assertion someone handed over notes); a Square deposit is
      // recorded PENDING and then charged - see this file's header comment. Either way, a failure
      // recording it doesn't roll back the booking; the sessions are real and on the calendar.
      if (depositCents > 0 && depositMethod === 'square') {
        try {
          await recordDeposit({
            variables: {
              appointmentId: consultAppointmentId,
              depositCents,
              paymentMethod: 'square',
              pending: true,
            },
          });
        } catch (depositErr) {
          setError(
            `Sessions booked, but the deposit couldn't be recorded: ${(depositErr as Error).message}`,
          );
          setSubmitting(false);
          return;
        }
        await refetchAppointments();
        setPendingCardDeposit({ depositCents, projectId });
        setSubmitting(false);
        return;
      }

      if (depositCents > 0) {
        try {
          await recordDeposit({
            variables: {
              appointmentId: consultAppointmentId,
              depositCents,
              paymentMethod: 'cash',
            },
          });
        } catch (depositErr) {
          setError(
            `Sessions booked, but the deposit couldn't be recorded: ${(depositErr as Error).message}`,
          );
          setSubmitting(false);
          return;
        }
      }

      await refetchAppointments();
      onSuccess(projectId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // The sessions are already booked by this point; only the card charge is outstanding. Shown
  // INSTEAD OF the form (not beside it) - direct port of web's own early return - so there is no
  // Confirm button left that would book the sessions a second time.
  if (pendingCardDeposit) {
    return (
      <View style={styles.container}>
        <ThemedText type="small">
          Sessions booked. Take the {formatCents(pendingCardDeposit.depositCents)} deposit to
          finish.
        </ThemedText>
        <SquarePaymentForm
          amountCents={pendingCardDeposit.depositCents}
          appointmentId={consultAppointmentId}
          chargeType="deposit"
          note="InkBooks deposit"
          onSuccess={handleCardDepositSuccess}
          onError={(message) => setError(message)}
        />
        {error ? (
          <ThemedText type="small" style={styles.error} testID="book-session-error">
            {error}
          </ThemedText>
        ) : null}
        {/* No Cancel here - the sessions exist, and backing out of this screen doesn't unbook
            them. The deposit can be recorded later from the consult if the card fails now. */}
        <Button
          label="Skip the deposit for now"
          variant="secondary"
          onPress={() => onSuccess(pendingCardDeposit.projectId)}
          testID="book-session-skip-deposit"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FormField
        label="Project title"
        placeholder="e.g. Sleeve piece"
        value={projectTitle}
        onChangeText={setProjectTitle}
        testID="book-session-title"
      />

      <View style={styles.sittingList}>
        {sessionDates.map((sitting, index) => (
          <View key={index} style={styles.sittingGroup}>
            <View style={styles.sittingHeader}>
              <ThemedText type="smallBold">Session {index + 1}</ThemedText>
              {sessionDates.length > 1 ? (
                <Pressable onPress={() => removeDate(index)} accessibilityRole="button" accessibilityLabel="Remove this session">
                  <ThemedText type="small" themeColor="textSecondary">
                    Remove
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
            <DateTimeField
              label="Date & time"
              value={sitting.date}
              onChange={(date) => updateDate(index, date)}
              testID={`book-session-date-${index}`}
            />
            <DurationPicker
              minutes={sitting.durationMinutes}
              onChange={(minutes) => updateDuration(index, minutes)}
              testID={`book-session-duration-${index}`}
            />
          </View>
        ))}
      </View>

      <Button label="Add another session" variant="secondary" onPress={addDate} testID="book-session-add" />

      <FormField
        label="Deposit taken today ($, optional)"
        placeholder="0"
        value={depositDollars}
        onChangeText={setDepositDollars}
        keyboardType="decimal-pad"
        testID="book-session-deposit"
      />

      {/* Only asked once there's an amount - a payment-method question above an empty deposit
          field is a question about nothing. No default selected - see this file's header comment
          on why. */}
      {needsMethod ? (
        <View style={styles.depositMethod}>
          <ThemedText type="small" themeColor="textSecondary">
            How was it taken?
          </ThemedText>
          <View style={styles.depositMethodRow}>
            <Pressable
              onPress={() => setDepositMethod('cash')}
              accessibilityRole="button"
              accessibilityState={{ selected: depositMethod === 'cash' }}
              testID="book-session-deposit-method-cash"
              style={[
                styles.pill,
                {
                  backgroundColor: depositMethod === 'cash' ? theme.text : theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <ThemedText type="small" style={{ color: depositMethod === 'cash' ? theme.background : theme.text }}>
                Cash
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setDepositMethod('square')}
              accessibilityRole="button"
              accessibilityState={{ selected: depositMethod === 'square' }}
              testID="book-session-deposit-method-square"
              style={[
                styles.pill,
                {
                  backgroundColor: depositMethod === 'square' ? theme.text : theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <ThemedText type="small" style={{ color: depositMethod === 'square' ? theme.background : theme.text }}>
                Card (Square)
              </ThemedText>
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {depositMethod === 'square' ? "You'll enter the card on the next step." : 'Recorded against this consult either way.'}
          </ThemedText>
        </View>
      ) : null}

      {error ? (
        <ThemedText type="small" style={styles.error} testID="book-session-error">
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={submitting ? 'Booking…' : 'Confirm'}
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting || (needsMethod && !depositMethod)}
          fullWidth
          testID="book-session-confirm"
        />
        <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={submitting} fullWidth testID="book-session-cancel" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  sittingList: {
    gap: Spacing.four,
  },
  sittingGroup: {
    gap: Spacing.two,
  },
  depositMethod: {
    gap: Spacing.one,
  },
  depositMethodRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  sittingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actions: {
    gap: Spacing.two,
  },
  error: {
    color: '#D33',
  },
});
