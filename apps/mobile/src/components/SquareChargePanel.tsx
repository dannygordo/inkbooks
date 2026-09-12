import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SquarePaymentForm } from '@/components/SquarePaymentForm';
import { SquareReaderPaymentForm } from '@/components/SquareReaderPaymentForm';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  amountCents: number;
  appointmentId: string;
  chargeType?: 'deposit';
  applyFeeOffset?: boolean;
  tipCents?: number;
  note?: string;
  onSuccess: (paymentId: string) => void;
  onError: (message: string) => void;
};

/**
 * Picks between the two ways this app can take a card: a physical Square reader
 * (SquareReaderPaymentForm, Mobile Payments SDK) or a keyed/manual card
 * (SquarePaymentForm, Square's Web Payments SDK in a WebView). Both share the same
 * onSuccess/onError contract and both post to the same family of appointment-charge routes, so
 * this is only ever a UI choice, never a different charge path from the caller's point of view.
 *
 * Defaults to the reader - see the card-reader work this shipped alongside. An artist with no
 * reader on hand isn't stuck: SquareReaderPaymentForm's own "no reader connected" state offers
 * pairing, and this toggle switches to keyed entry in one tap if that's not what they want right
 * now.
 */
export function SquareChargePanel(props: Props) {
  const theme = useTheme();
  const [method, setMethod] = useState<'reader' | 'keyed'>('reader');

  return (
    <View style={styles.container}>
      <View style={[styles.toggleRow, { borderColor: theme.border }]}>
        <ToggleOption label="Card reader" active={method === 'reader'} onPress={() => setMethod('reader')} />
        <ToggleOption label="Enter card" active={method === 'keyed'} onPress={() => setMethod('keyed')} />
      </View>
      {method === 'reader' ? (
        <SquareReaderPaymentForm
          appointmentId={props.appointmentId}
          chargeType={props.chargeType}
          applyFeeOffset={props.applyFeeOffset}
          tipCents={props.tipCents}
          note={props.note}
          onSuccess={props.onSuccess}
          onError={props.onError}
        />
      ) : (
        <SquarePaymentForm
          amountCents={props.amountCents}
          appointmentId={props.appointmentId}
          chargeType={props.chargeType}
          applyFeeOffset={props.applyFeeOffset}
          tipCents={props.tipCents}
          note={props.note}
          onSuccess={props.onSuccess}
          onError={props.onError}
        />
      )}
    </View>
  );
}

function ToggleOption({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggleOption, active ? { backgroundColor: theme.primary } : null]}
      testID={`square-charge-method-${label === 'Card reader' ? 'reader' : 'keyed'}`}
    >
      <ThemedText type="small" style={active ? { color: theme.primaryContrast } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  toggleRow: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
  },
  toggleOption: {
    flex: 1,
    paddingVertical: Spacing.one,
    alignItems: 'center',
  },
});
