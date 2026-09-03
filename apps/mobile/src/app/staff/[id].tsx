import {
  useArchiveStaffMutation,
  useGetStaffDetailQuery,
  useUnarchiveStaffMutation,
  useUpdateStaffIdentityMutation,
} from '@inkbooks/api';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArchiveControl } from '@/components/ArchiveControl';
import { Avatar } from '@/components/Avatar';
import { FormField } from '@/components/FormField';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ROLES, STAFF_STATUS } from '@/constants/auth';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

/**
 * The shop's management view into one staff member - simpler than artist/[id].tsx in every
 * respect: no self-service edit path at all (`updateStaff` has a hard SHOP_ADMIN floor
 * server-side, unlike `updateArtist`'s self-or-shop-admin rule - matching web's own
 * `canEditIdentity = user.role <= ROLES.SHOP_ADMIN`, no self branch) and no embedded dashboard
 * panels to defer - Staff never had an ArtistPerformancePanel-equivalent to begin with. See
 * DECISIONS.md X23.
 */
export default function StaffDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const theme = useTheme();

  const { data, loading, error, refetch } = useGetStaffDetailQuery({
    variables: { staffId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const staffMember = data?.getOneStaff;

  const [archiveStaff, { loading: archiving }] = useArchiveStaffMutation();
  const [unarchiveStaff, { loading: restoring }] = useUnarchiveStaffMutation();

  const handleArchive = () => {
    if (!staffMember) return;
    archiveStaff({ variables: { staffId: staffMember.id } })
      .then(() => refetch())
      .catch(() => {});
  };

  const handleRestore = () => {
    if (!staffMember) return;
    unarchiveStaff({ variables: { staffId: staffMember.id } })
      .then(() => refetch())
      .catch(() => {});
  };

  if ((loading && !staffMember) || !id) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="staff-detail-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !staffMember) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary" testID="staff-detail-error">
            {error ? `Couldn't load this staff member: ${error.message}` : 'This staff member does not exist.'}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const canEditIdentity = Boolean(user?.role && user.role <= ROLES.SHOP_ADMIN);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Avatar
              imageUri={staffMember.user?.avatar || staffMember.avatar}
              firstName={staffMember.firstName}
              lastName={staffMember.lastName}
              size={64}
            />
            <View style={styles.headerInfo}>
              <ThemedText type="subtitle">
                {staffMember.firstName} {staffMember.lastName}
              </ThemedText>
              {staffMember.title ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {staffMember.title}
                </ThemedText>
              ) : null}
            </View>
          </View>

          <ArchiveControl
            kind="staff member"
            name={`${staffMember.firstName} ${staffMember.lastName}`}
            isArchived={staffMember.status === STAFF_STATUS.ARCHIVED}
            archiving={archiving}
            restoring={restoring}
            onArchive={handleArchive}
            onRestore={handleRestore}
            testID="staff-archive-control"
          />

          <IdentityCard staffMember={staffMember} canEdit={canEditIdentity} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

type StaffMember = NonNullable<ReturnType<typeof useGetStaffDetailQuery>['data']>['getOneStaff'];

function IdentityCard({ staffMember, canEdit }: { staffMember: NonNullable<StaffMember>; canEdit: boolean }) {
  const firstNameRef = useRef(staffMember.firstName);
  const lastNameRef = useRef(staffMember.lastName);
  const emailRef = useRef(staffMember.email);
  const phoneRef = useRef(staffMember.phone ?? '');
  const titleRef = useRef(staffMember.title ?? '');
  const addressRef = useRef(staffMember.address ?? '');
  const cityRef = useRef(staffMember.city ?? '');
  const stateRef = useRef(staffMember.state ?? '');
  const zipRef = useRef(staffMember.zip ?? '');
  const instagramRef = useRef(staffMember.instagram ?? '');
  const facebookRef = useRef(staffMember.facebook ?? '');
  const lastSavedRef = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [updateStaff] = useUpdateStaffIdentityMutation();

  // shopId/userId/status are required by StaffInput but never edited here - echoed back
  // unchanged, matching web's own buildIdentityPayload exactly (see staff.graphql's own comment).
  const buildPayload = () => ({
    id: staffMember.id,
    firstName: firstNameRef.current,
    lastName: lastNameRef.current,
    email: emailRef.current,
    phone: phoneRef.current,
    title: titleRef.current,
    address: addressRef.current,
    city: cityRef.current,
    state: stateRef.current,
    zip: zipRef.current,
    instagram: instagramRef.current,
    facebook: facebookRef.current,
    shopId: staffMember.shopId,
    userId: staffMember.userId,
    status: staffMember.status,
  });

  if (lastSavedRef.current === null) {
    lastSavedRef.current = JSON.stringify(buildPayload());
  }

  const save = async () => {
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) {
      return;
    }
    lastSavedRef.current = serialized;
    setSaveState('saving');
    try {
      await updateStaff({ variables: { staff: payload } });
      setSaveState('saved');
    } catch {
      lastSavedRef.current = null;
      setSaveState('error');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold">Details</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" testID="staff-save-state">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'All changes saved'}
          {saveState === 'error' && "Couldn't save - try again"}
        </ThemedText>
      </View>
      {!canEdit ? (
        <ThemedText type="small" themeColor="textSecondary">
          Only a shop admin can edit these details.
        </ThemedText>
      ) : null}

      <FormField
        label="First Name"
        defaultValue={staffMember.firstName}
        onChangeText={(t) => (firstNameRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="staff-first-name"
      />
      <FormField
        label="Last Name"
        defaultValue={staffMember.lastName}
        onChangeText={(t) => (lastNameRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="staff-last-name"
      />
      <FormField
        label="Email"
        defaultValue={staffMember.email}
        onChangeText={(t) => (emailRef.current = t)}
        onBlur={save}
        editable={canEdit}
        keyboardType="email-address"
        autoCapitalize="none"
        testID="staff-email"
      />
      <FormField
        label="Phone"
        defaultValue={staffMember.phone ?? ''}
        onChangeText={(t) => (phoneRef.current = t)}
        onBlur={save}
        editable={canEdit}
        keyboardType="phone-pad"
        testID="staff-phone"
      />
      <FormField
        label="Title"
        defaultValue={staffMember.title ?? ''}
        onChangeText={(t) => (titleRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="staff-title"
      />
      <FormField
        label="Address"
        defaultValue={staffMember.address ?? ''}
        onChangeText={(t) => (addressRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="staff-address"
      />
      <FormField
        label="City"
        defaultValue={staffMember.city ?? ''}
        onChangeText={(t) => (cityRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="staff-city"
      />
      <FormField
        label="State"
        defaultValue={staffMember.state ?? ''}
        onChangeText={(t) => (stateRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="staff-state"
      />
      <FormField
        label="Zip"
        defaultValue={staffMember.zip ?? ''}
        onChangeText={(t) => (zipRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="staff-zip"
      />
      <FormField
        label="Instagram"
        defaultValue={staffMember.instagram ?? ''}
        onChangeText={(t) => (instagramRef.current = t)}
        onBlur={save}
        editable={canEdit}
        autoCapitalize="none"
        testID="staff-instagram"
      />
      <FormField
        label="Facebook"
        defaultValue={staffMember.facebook ?? ''}
        onChangeText={(t) => (facebookRef.current = t)}
        onBlur={save}
        editable={canEdit}
        autoCapitalize="none"
        testID="staff-facebook"
      />
    </View>
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
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerInfo: {
    gap: Spacing.half,
  },
  card: {
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
