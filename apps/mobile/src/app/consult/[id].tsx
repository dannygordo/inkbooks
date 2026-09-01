import { useGetConsultAppointmentQuery } from '@inkbooks/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookSessionDatesForm } from '@/components/BookSessionDatesForm';
import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STATUS_LABELS: Record<string, string> = {
  consult_booked: 'Consult booked',
  session_booked: 'Session booked',
  not_booked: 'Not booked',
  declined: 'Declined',
};

/**
 * The `appointmentType === 'consult'` branch of index.tsx's row tap (mirrors apps/web's
 * AppointmentsList.jsx openAppointment() three-way split - see ConsultDetail.jsx, this screen's
 * direct port). A consult Appointment has no Project of its own to view/edit through - this shows
 * its date and its original intake details off the BookingRequest it was created from
 * (Appointment.bookingRequest field resolver), and, while that request is still at
 * consult_booked, offers "Convert to Session" via BookSessionDatesForm - cash-only on mobile, see
 * that component's own header comment.
 */
export default function ConsultDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const theme = useTheme();
  const [showConvertForm, setShowConvertForm] = useState(false);

  const { data, loading, error } = useGetConsultAppointmentQuery({
    variables: { appointmentId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });

  const appointment = data?.getAppointment;
  const bookingRequest = appointment?.bookingRequest;

  const handleConverted = (projectId?: string | null) => {
    setShowConvertForm(false);
    if (projectId) {
      router.replace({ pathname: '/project/[id]', params: { id: projectId } });
    } else {
      router.back();
    }
  };

  if (loading && !appointment) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="consult-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !appointment) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary">
            {error ? `Couldn't load this consult: ${error.message}` : 'Consult not found.'}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (appointment.appointmentType !== 'consult' || !bookingRequest) {
    // Not a consult, or created before Appointment.bookingRequestId existed - same fallback
    // ConsultDetail.jsx shows for the same pre-fix records.
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            This appointment doesn&apos;t have any consult details on file - it may have been
            created before this page existed.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.headerName}>
              {bookingRequest.client?.firstName} {bookingRequest.client?.lastName}
            </ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {STATUS_LABELS[bookingRequest.status] ?? bookingRequest.status}
            </ThemedText>
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            {[bookingRequest.client?.email, bookingRequest.client?.phone].filter(Boolean).join(' · ')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {new Date(appointment.appointmentDate).toLocaleString(undefined, {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </ThemedText>

          <View style={styles.fields}>
            {bookingRequest.description ? <ThemedText type="default">{bookingRequest.description}</ThemedText> : null}
            {bookingRequest.placement ? (
              <ThemedText type="small">Placement: {bookingRequest.placement}</ThemedText>
            ) : null}
            {bookingRequest.size ? <ThemedText type="small">Size: {bookingRequest.size}</ThemedText> : null}
            {bookingRequest.budget ? <ThemedText type="small">Budget: {bookingRequest.budget}</ThemedText> : null}
            {bookingRequest.isCoverUp ? <ThemedText type="small">Cover-up / touch-up</ThemedText> : null}
          </View>

          {bookingRequest.referenceImages && bookingRequest.referenceImages.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
              {bookingRequest.referenceImages.map((url) =>
                url ? <Image key={url} source={{ uri: url }} style={styles.image} resizeMode="cover" /> : null,
              )}
            </ScrollView>
          ) : null}

          {bookingRequest.status === 'consult_booked' && !showConvertForm ? (
            <View style={styles.actions}>
              <Button label="Convert to Session" onPress={() => setShowConvertForm(true)} testID="consult-convert" />
            </View>
          ) : null}

          {showConvertForm ? (
            <BookSessionDatesForm
              bookingRequestId={bookingRequest.id}
              initialDate={new Date(appointment.appointmentDate)}
              consultAppointmentId={appointment.id}
              onSuccess={handleConverted}
              onCancel={() => setShowConvertForm(false)}
            />
          ) : null}

          {bookingRequest.status === 'session_booked' ? (
            <ThemedText type="small" themeColor="textSecondary">
              This consult already led to a booked session.
            </ThemedText>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  centeredText: {
    textAlign: 'center',
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerName: {
    flexShrink: 1,
  },
  fields: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  imageRow: {
    marginTop: Spacing.two,
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: Spacing.two,
    marginRight: Spacing.two,
  },
  actions: {
    marginTop: Spacing.two,
  },
});
