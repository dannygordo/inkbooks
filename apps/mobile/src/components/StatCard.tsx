import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * One figure on a dashboard - direct port of apps/web's components/analytics/StatCard.jsx.
 * Exists mainly to make one rule impossible to forget: a null value renders as an em dash, never
 * as $0.00 or 0. Money fields come back null for a Staff-role caller on the shop-wide analytics
 * query (see server/graphql/resolvers/analytics.js), and "$0.00" is a confident, specific, wrong
 * answer to "how much did the shop make" - an em dash says nothing, which is the truth in that
 * case. Callers must pass `null` through directly rather than pre-formatting with
 * `formatCents(null)`, which returns "$0.00" and loses the distinction this component exists to
 * preserve - see dashboard.tsx's own `money()` helper.
 *
 * client/[id].tsx (X49) has its own inline stat-card View for its five always-present, never-null
 * client stats - not migrated here, matching income/index.tsx's own un-migrated local PillRow
 * copy (this app doesn't retroactively sweep every prior inline instance once a shared version
 * exists). dashboard.tsx is the first caller that actually needs the null handling.
 */
export function StatCard({
	label,
	value,
	subLabel,
	testID,
}: {
	label: string;
	value: string | number | null | undefined;
	subLabel?: string;
	testID?: string;
}) {
	const isEmpty = value === null || value === undefined;
	return (
		<View style={styles.card} testID={testID}>
			<ThemedText type="small" themeColor="textSecondary">
				{label}
			</ThemedText>
			<ThemedText type="subtitle" themeColor={isEmpty ? 'textSecondary' : undefined}>
				{isEmpty ? '—' : value}
			</ThemedText>
			{subLabel ? (
				<ThemedText type="small" themeColor="textSecondary">
					{subLabel}
				</ThemedText>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		flexBasis: '45%',
		gap: Spacing.half,
	},
});
