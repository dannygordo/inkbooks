import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ArchiveControlProps = {
	kind: string; // "artist" | "staff member" | "client" - used in the confirmation prose
	name: string;
	isArchived: boolean;
	archiving: boolean;
	restoring: boolean;
	onArchive: () => void;
	onRestore: () => void;
	testID?: string;
};

/**
 * Direct port of apps/web's components/archive/ArchiveControl.jsx - archive/restore, the only way
 * someone leaves the roster (there is no delete: an Artist/Staff/Client row being deleted would
 * leave projects pointing at nothing, a User row with no profile behind it, and appointments
 * keeping their totals with nobody attached - see server/graphql/typeDefs.js's own note on the
 * Mutation type). The confirmation states what archiving does AND doesn't, for the same reason
 * web's own comment gives: "remove this person" reads as "lose their history," and someone who
 * thinks they're about to lose a year of revenue records won't press the button.
 *
 * Uses RN's native `Alert.alert` for the confirmation rather than porting web's own custom
 * backdrop-dialog markup - a native alert is the idiomatic RN equivalent of a modal confirm and
 * needs no bespoke styling. Callers own the archive/unarchive mutation calls themselves (passed in
 * as onArchive/onRestore/archiving/restoring) rather than this component owning them directly, so
 * each caller controls its own refetch/error handling the way its screen already does.
 */
export function ArchiveControl({
	kind,
	name,
	isArchived,
	archiving,
	restoring,
	onArchive,
	onRestore,
	testID,
}: ArchiveControlProps) {
	const theme = useTheme();

	if (isArchived) {
		return (
			<View style={styles.row} testID={testID}>
				<View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
					<ThemedText type="small" themeColor="textSecondary">
						Archived
					</ThemedText>
				</View>
				<Button
					label="Restore"
					variant="secondary"
					onPress={onRestore}
					loading={restoring}
					testID={testID ? `${testID}-restore` : undefined}
				/>
			</View>
		);
	}

	const confirm = () => {
		Alert.alert(
			`Archive ${name}?`,
			`They'll no longer appear in your ${kind} list or anywhere you pick a ${kind}` +
				(kind === 'artist' ? ', so no new work can be booked with them.' : '.') +
				`\n\nNothing they've already done changes. Their past appointments, projects and every ` +
				`dollar recorded against them stay exactly as they are, and still count toward your ` +
				`shop's revenue.\n\nYou can restore them at any time.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'Archive', style: 'destructive', onPress: onArchive },
			],
		);
	};

	return (
		<Button
			label="Archive"
			variant="secondary"
			onPress={confirm}
			loading={archiving}
			testID={testID}
		/>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: Spacing.two,
	},
	badge: {
		borderRadius: Spacing.two,
		paddingHorizontal: Spacing.two,
		paddingVertical: Spacing.one,
	},
});
