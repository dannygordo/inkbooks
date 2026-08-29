import type { AppointmentListItemFragment } from '@inkbooks/api';

// Matches server/utils/validation.js's appointmentStatus enum exactly (scheduled, completed,
// rescheduled, cancelled, no_show) - same list apps/web's AppointmentsList.jsx keeps, just
// humanized for display. Duplicated rather than shared for the same packages/shared-doesn't-exist-
// yet reason as constants/auth.ts.
export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export type AppointmentListEntry =
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'appointment'; key: string; appointment: AppointmentListItemFragment };

function sortByDate(items: readonly AppointmentListItemFragment[]): AppointmentListItemFragment[] {
  return [...items].sort(
    (a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime(),
  );
}

// Local calendar day, not UTC - two queries at 11pm and 1am local time on the same evening should
// land in the same group even when that crosses a UTC day boundary. Plain Date getters
// (getFullYear/getMonth/getDate) are already local-time, same as web's moment().format
// ("YYYY-MM-DD") without an explicit .utc() call.
function dayKey(dateISO: string): string {
  const d = new Date(dateISO);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // Locale-formatted rather than a hardcoded "dddd, D MMMM YYYY" the way web's moment call reads -
  // avoids adding moment as a mobile dependency for one label (see utils/dateRanges.ts's own
  // comment on the same tradeoff) and follows the device's own date convention instead of
  // hardcoding one.
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Grouped-by-day entries for FlashList - a day heading (rendered once) followed by that day's
 * appointments, chronological within the day and across days. Mirrors
 * AppointmentsList.jsx's `days` grouping; flattened into one array (rather than nested groups)
 * because that's the shape a virtualized list needs to recycle rows correctly.
 */
export function buildListEntries(items: readonly AppointmentListItemFragment[]): AppointmentListEntry[] {
  const sorted = sortByDate(items);
  const grouped = new Map<string, AppointmentListItemFragment[]>();
  for (const appointment of sorted) {
    const key = dayKey(appointment.appointmentDate);
    const group = grouped.get(key);
    if (group) {
      group.push(appointment);
    } else {
      grouped.set(key, [appointment]);
    }
  }

  const entries: AppointmentListEntry[] = [];
  for (const [key, group] of grouped) {
    entries.push({ kind: 'header', key: `header-${key}`, label: formatDayLabel(key), count: group.length });
    for (const appointment of group) {
      entries.push({ kind: 'appointment', key: appointment.id, appointment });
    }
  }
  return entries;
}

export function formatAppointmentTime(dateISO: string): string {
  return new Date(dateISO).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// A consult has no Project of its own yet (server/models/Appointment.js) - its client is only
// reachable via the original booking request. Same fallback AppointmentsList.jsx's row needs.
export function getAppointmentClientName(appointment: AppointmentListItemFragment): string {
  const projectClientUser = appointment.project?.client?.user;
  if (projectClientUser) {
    return `${projectClientUser.firstName ?? ''} ${projectClientUser.lastName ?? ''}`.trim();
  }
  const bookingClient = appointment.bookingRequest?.client;
  if (bookingClient) {
    return `${bookingClient.firstName} ${bookingClient.lastName}`.trim();
  }
  return '';
}

export function getAppointmentTitle(appointment: AppointmentListItemFragment): string {
  return appointment.project?.title || appointment.title || '(untitled appointment)';
}

export function getAppointmentStatusLabel(appointment: AppointmentListItemFragment): string {
  return APPOINTMENT_STATUS_LABELS[appointment.appointmentStatus] ?? appointment.appointmentStatus;
}

export function getAppointmentArtistName(appointment: AppointmentListItemFragment): string {
  if (!appointment.user) {
    return '';
  }
  return `${appointment.user.firstName ?? ''} ${appointment.user.lastName ?? ''}`.trim();
}
