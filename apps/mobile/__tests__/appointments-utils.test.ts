import {
  buildListEntries,
  formatAppointmentTime,
  getAppointmentArtistName,
  getAppointmentClientName,
  getAppointmentStatusLabel,
  getAppointmentTitle,
} from '@/utils/appointments';

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Appointment',
    id: 'appt-1',
    projectId: null,
    userId: 'artist-1',
    bookingRequestId: null,
    project: null,
    bookingRequest: null,
    shopId: null,
    isPersonal: false,
    user: null,
    title: 'Sleeve session',
    description: null,
    appointmentType: 'session',
    appointmentDate: '2026-08-27T15:00:00.000Z',
    durationMinutes: 60,
    appointmentEnd: '2026-08-27T16:00:00.000Z',
    appointmentStatus: 'scheduled',
    totalCents: null,
    tipCents: null,
    shopCutStatus: 'not_applicable',
    shopCutCents: null,
    shopCutPaymentMethod: null,
    shopCutSquareInvoiceId: null,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('buildListEntries', () => {
  it('groups appointments by calendar day, sorted chronologically within and across days', () => {
    const entries = buildListEntries([
      appointment({ id: 'later-day', appointmentDate: '2026-08-28T10:00:00.000Z' }),
      appointment({ id: 'first-of-day', appointmentDate: '2026-08-27T09:00:00.000Z' }),
      appointment({ id: 'second-of-day', appointmentDate: '2026-08-27T15:00:00.000Z' }),
    ]);

    const ids = entries.map((entry) => (entry.kind === 'appointment' ? entry.appointment.id : `header:${entry.label}`));
    const headerCount = entries.filter((entry) => entry.kind === 'header').length;

    expect(headerCount).toBe(2);
    // Both same-day appointments come after their one shared header and in time order; the next
    // day's header and appointment come last.
    expect(ids.indexOf('first-of-day')).toBeLessThan(ids.indexOf('second-of-day'));
    expect(ids.indexOf('second-of-day')).toBeLessThan(ids.indexOf('later-day'));
  });

  it('counts each day header against its own group, not the total', () => {
    const entries = buildListEntries([
      appointment({ id: 'a', appointmentDate: '2026-08-27T09:00:00.000Z' }),
      appointment({ id: 'b', appointmentDate: '2026-08-27T15:00:00.000Z' }),
      appointment({ id: 'c', appointmentDate: '2026-08-28T09:00:00.000Z' }),
    ]);

    const headers = entries.filter((entry) => entry.kind === 'header');
    expect(headers.map((h) => (h.kind === 'header' ? h.count : null))).toEqual([2, 1]);
  });

  it('returns no entries for an empty list', () => {
    expect(buildListEntries([])).toEqual([]);
  });
});

describe('formatAppointmentTime', () => {
  it('formats an ISO date as a local time string', () => {
    // Only asserting it doesn't throw and returns non-empty - the exact string is locale/timezone
    // dependent (Intl-backed, deliberately not a hardcoded format - see the function's own
    // comment), which this test environment's ICU data may render differently than a device would.
    expect(formatAppointmentTime('2026-08-27T15:00:00.000Z').length).toBeGreaterThan(0);
  });
});

describe('getAppointmentClientName', () => {
  it("prefers the project's client over the booking request's", () => {
    const name = getAppointmentClientName(
      appointment({
        project: { id: 'p1', title: 'x', depositCollectedCents: 0, client: { id: 'c1', user: { id: 'u1', firstName: 'Ada', lastName: 'Lovelace', avatar: null } } },
        bookingRequest: { id: 'br1', client: { id: 'c2', firstName: 'Wrong', lastName: 'Name' } },
      }),
    );
    expect(name).toBe('Ada Lovelace');
  });

  it("falls back to the booking request's client for a consult with no project yet", () => {
    const name = getAppointmentClientName(
      appointment({ bookingRequest: { id: 'br1', client: { id: 'c2', firstName: 'Grace', lastName: 'Hopper' } } }),
    );
    expect(name).toBe('Grace Hopper');
  });

  it('returns an empty string when neither is present (a personal appointment)', () => {
    expect(getAppointmentClientName(appointment({ isPersonal: true }))).toBe('');
  });
});

describe('getAppointmentTitle', () => {
  it("prefers the project's title over the appointment's own", () => {
    expect(
      getAppointmentTitle(appointment({ title: 'own title', project: { id: 'p1', title: 'Project title', depositCollectedCents: 0, client: null } })),
    ).toBe('Project title');
  });

  it("falls back to the appointment's own title without a project", () => {
    expect(getAppointmentTitle(appointment({ title: 'Dentist', project: null }))).toBe('Dentist');
  });

  it('falls back to a placeholder with neither', () => {
    expect(getAppointmentTitle(appointment({ title: null, project: null }))).toBe('(untitled appointment)');
  });
});

describe('getAppointmentStatusLabel', () => {
  it('humanizes a known status', () => {
    expect(getAppointmentStatusLabel(appointment({ appointmentStatus: 'no_show' }))).toBe('No-show');
  });

  it('passes through an unrecognized status verbatim', () => {
    expect(getAppointmentStatusLabel(appointment({ appointmentStatus: 'something_new' }))).toBe('something_new');
  });
});

describe('getAppointmentArtistName', () => {
  it('formats the assigned artist\'s name', () => {
    expect(
      getAppointmentArtistName(appointment({ user: { id: 'u1', tagColor: null, firstName: 'Ada', lastName: 'Lovelace', avatar: null } })),
    ).toBe('Ada Lovelace');
  });

  it('returns an empty string with no assigned user', () => {
    expect(getAppointmentArtistName(appointment({ user: null }))).toBe('');
  });
});
