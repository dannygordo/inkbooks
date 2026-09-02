// Direct port of apps/web's ArtistBookingRequests.jsx STATUS_LABELS and STATUS_FILTERS - the
// funnel's five terminal/non-terminal statuses and the four ways the inbox can be filtered by
// them. Kept together, like utils/tagColors.ts's palette+filter pairing, since the filters ARE a
// grouping of the labels.
export const BOOKING_REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  consult_booked: 'Consult booked',
  session_booked: 'Session booked',
  declined: 'Declined',
  // Distinct from "Declined" - the consult happened, the client just chose not to move forward
  // afterward. See server/models/BookingRequest.js's own comment on why these are kept as two
  // separate terminal values instead of one shared "closed" status.
  not_booked: 'Not booked',
};

export function bookingRequestStatusLabel(status: string): string {
  return BOOKING_REQUEST_STATUS_LABELS[status] ?? status;
}

export type BookingRequestFilterKey = 'pending' | 'booked' | 'closed' | 'all';

// `statuses: undefined` for "pending" sends no statuses argument at all rather than listing the
// one open status - the default lives in exactly one place (the resolver), same reasoning as
// web's own comment on this constant.
export const BOOKING_REQUEST_FILTERS: {
  key: BookingRequestFilterKey;
  label: string;
  statuses?: string[];
}[] = [
  { key: 'pending', label: 'Pending', statuses: undefined },
  { key: 'booked', label: 'Booked', statuses: ['consult_booked', 'session_booked'] },
  { key: 'closed', label: 'Declined & not booked', statuses: ['declined', 'not_booked'] },
  {
    key: 'all',
    label: 'All',
    statuses: ['pending', 'consult_booked', 'session_booked', 'declined', 'not_booked'],
  },
];
