import {
  BOOKING_REQUEST_FILTERS,
  bookingRequestStatusLabel,
} from '@/utils/bookingRequests';

describe('bookingRequestStatusLabel', () => {
  it('labels every real status', () => {
    expect(bookingRequestStatusLabel('pending')).toBe('Pending');
    expect(bookingRequestStatusLabel('consult_booked')).toBe('Consult booked');
    expect(bookingRequestStatusLabel('session_booked')).toBe('Session booked');
    expect(bookingRequestStatusLabel('declined')).toBe('Declined');
    expect(bookingRequestStatusLabel('not_booked')).toBe('Not booked');
  });

  it('falls back to the raw value for an unrecognized status', () => {
    expect(bookingRequestStatusLabel('something_new')).toBe('something_new');
  });
});

describe('BOOKING_REQUEST_FILTERS', () => {
  it('sends no statuses at all for the pending filter', () => {
    const pending = BOOKING_REQUEST_FILTERS.find((f) => f.key === 'pending');
    expect(pending?.statuses).toBeUndefined();
  });

  it('groups booked and closed statuses correctly', () => {
    const booked = BOOKING_REQUEST_FILTERS.find((f) => f.key === 'booked');
    const closed = BOOKING_REQUEST_FILTERS.find((f) => f.key === 'closed');
    expect(booked?.statuses).toEqual(['consult_booked', 'session_booked']);
    expect(closed?.statuses).toEqual(['declined', 'not_booked']);
  });

  it('includes every status in the "all" filter', () => {
    const all = BOOKING_REQUEST_FILTERS.find((f) => f.key === 'all');
    expect(all?.statuses).toHaveLength(5);
  });
});
