// Appointment reminders (utils/reminders.js) - text/email nudges sent to a CLIENT ahead of an
// upcoming appointment, wired into utils/notification-jobs.js's sendDueReminders sweep. Had ZERO
// test coverage anywhere in the suite despite being referenced repeatedly by comments elsewhere
// (utils/auto-responses.js's "same reasoning as sendRemindersForArtist", AutoResponseLog's own
// "ReminderLog's own claim-before-send pattern") - this file closes that gap.
//
// CORRECTION (2026-09-04, confirmed by running the real suite for the first time and by a direct
// isolated reproduction - see DECISIONS.md): the original version of this file mocked via
// `vi.mock('../../utils/email', () => ({ sendEmail: vi.fn() }))` + a destructured
// `const { sendEmail } = require(...)`, on the theory that vi.mock's hoisting makes the
// destructuring inside reminders.js pick up the mock regardless of require-time vs call-time.
// That theory is wrong for this project: Vitest's vi.mock() only reliably replaces ESM import
// bindings - it does not intercept plain CommonJS require() calls, which is what this entire
// codebase uses. Every test below that called `sendEmail.mockImplementation(...)` or asserted
// `sendEmail.not.toHaveBeenCalled()` was doing so against the REAL, unmocked utils/email.js
// export, which has no such methods - it just silently threw "is not a function"/"is not a spy"
// the moment a real run finally exercised it.
//
// The fix: vi.spyOn() the ALREADY-REQUIRED module's own object, and do it BEFORE requiring
// utils/reminders.js below. reminders.js destructures `const { sendEmail } = require('./email')`
// once, at its own module-load time (this whole codebase is CJS, not the injectable-function-
// argument pattern utils/auto-responses.js's sendEmailFn/sendSmsFn use) - whichever function
// happens to be sitting on `email.sendEmail` at that exact moment is the one reminders.js's
// internal `sendEmail` binding points to forever after (Node caches the module; the destructuring
// runs exactly once). Spy first, require reminders.js second, and never call `.mockRestore()` on
// these two spies (that would only reset the *property* on the email/sms module - the function
// object reminders.js already captured stays a spy regardless, but restoring is pointless here
// and invites confusion); `.mockClear()`/`.mockReset()` between tests is fine and is what
// beforeEach below actually does.
//
// describe/it/expect/vi come from Vitest's `globals: true` config.
const emailModule = require('../../utils/email');
const smsModule = require('../../utils/sms');
const sendEmail = vi.spyOn(emailModule, 'sendEmail').mockResolvedValue({});
const sendSms = vi.spyOn(smsModule, 'sendSms').mockResolvedValue({});

const ReminderSettings = require('../../models/ReminderSettings');
const ReminderLog = require('../../models/ReminderLog');
const {
	createArtistUser,
	createClientUser,
	createProject,
	createAppointment,
} = require('../helpers/factories');
const {
	sendDueReminders,
	sendRemindersForArtist,
	resolveClientForAppointment,
	buildClientLink,
	formatAppointmentDateTime,
} = require('../../utils/reminders');
const Artist = require('../../models/Artist');

function recorder() {
	const sent = [];
	sendEmail.mockImplementation(async (m) => {
		sent.push(m);
		return { id: `email-${sent.length}` };
	});
	return sent;
}

function smsRecorder() {
	const sent = [];
	sendSms.mockImplementation(async (m) => {
		sent.push(m);
		return { id: `sms-${sent.length}` };
	});
	return sent;
}

async function artistWithClient() {
	const { user: artist } = await createArtistUser();
	const { user: clientUser, client } = await createClientUser();
	const project = await createProject(artist._id, client._id);
	return { artist, clientUser, client, project };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('formatAppointmentDateTime', () => {
	it('formats in the given timezone when one is provided', () => {
		const date = new Date('2026-06-15T14:30:00Z');
		const { appointmentDate, appointmentTime } = formatAppointmentDateTime(date, 'America/New_York');
		expect(appointmentDate).toContain('June');
		expect(appointmentDate).toContain('15');
		// 14:30 UTC is 10:30am in New York (EDT, UTC-4) in June.
		expect(appointmentTime).toBe('10:30 AM');
	});

	it('falls back to the server default zone when none is given', () => {
		const date = new Date('2026-06-15T14:30:00Z');
		const result = formatAppointmentDateTime(date, undefined);
		expect(result.appointmentDate).toContain('June');
		expect(typeof result.appointmentTime).toBe('string');
	});
});

describe('buildClientLink', () => {
	it("builds the artist's public booking page URL when they have a bookingSlug", () => {
		const link = buildClientLink({ bookingSlug: 'jordan-ink' });
		expect(link).toContain('/book/jordan-ink');
	});

	it('falls back to the plain app root for an artist with no bookingSlug, and for no artist at all', () => {
		const withoutSlug = buildClientLink({ bookingSlug: null });
		const withoutArtist = buildClientLink(null);
		expect(withoutSlug).not.toContain('/book/');
		expect(withoutArtist).not.toContain('/book/');
		expect(withoutSlug).toBe(withoutArtist);
	});
});

describe('resolveClientForAppointment', () => {
	it("resolves through the appointment's Project for a session/consult that has one", async () => {
		const { client, project, artist } = await artistWithClient();
		const appointment = await createAppointment(artist._id, { projectId: project._id });

		const resolved = await resolveClientForAppointment(appointment);

		expect(String(resolved._id)).toBe(String(client._id));
	});

	it('resolves through the BookingRequest for a not-yet-a-project consult', async () => {
		const { createBookingRequest } = require('../helpers/factories');
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		const bookingRequest = await createBookingRequest(artist._id, client._id);
		const appointment = await createAppointment(artist._id, {
			bookingRequestId: bookingRequest._id,
			appointmentType: 'consult',
		});

		const resolved = await resolveClientForAppointment(appointment);

		expect(String(resolved._id)).toBe(String(client._id));
	});

	it('returns null for an appointment with neither - an "Other" type has no client to remind', async () => {
		const { user: artist } = await createArtistUser();
		const appointment = await createAppointment(artist._id, { appointmentType: 'other' });

		expect(await resolveClientForAppointment(appointment)).toBeNull();
	});
});

describe('sendRemindersForArtist', () => {
	it('sends nothing when every rule is disabled', async () => {
		const { artist } = await artistWithClient();
		const settings = await new ReminderSettings({
			artistUserId: artist._id,
			emailEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: false }],
		}).save();

		const result = await sendRemindersForArtist(settings, new Date());

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('sends nothing when neither emailEnabled nor smsEnabled is set, even with an enabled rule', async () => {
		const { artist } = await artistWithClient();
		const settings = await new ReminderSettings({
			artistUserId: artist._id,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();

		const result = await sendRemindersForArtist(settings, new Date());

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
	});

	it("sends the email reminder once a rule's offset window is reached, and logs it", async () => {
		const { artist, clientUser, project } = await artistWithClient();
		const now = new Date();
		const appointment = await createAppointment(artist._id, {
			projectId: project._id,
			appointmentDate: new Date(now.getTime() + 30 * 60 * 1000), // 30 min from now
		});
		const settings = await new ReminderSettings({
			artistUserId: artist._id,
			emailEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }], // due 30 min before now
		}).save();
		const sent = recorder();

		const result = await sendRemindersForArtist(settings, now);

		expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe(clientUser.email);
		const log = await ReminderLog.findOne({ appointmentId: appointment._id });
		expect(log.status).toBe('sent');
		expect(log.channel).toBe('email');
		expect(log.offsetMinutes).toBe(60);
	});

	it("does not send, and creates no log, for a rule whose offset window hasn't been reached yet", async () => {
		const { artist, project } = await artistWithClient();
		const now = new Date();
		const appointment = await createAppointment(artist._id, {
			projectId: project._id,
			appointmentDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days out
		});
		const settings = await new ReminderSettings({
			artistUserId: artist._id,
			emailEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }], // due 1 hour before - nowhere close yet
		}).save();

		const result = await sendRemindersForArtist(settings, now);

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(await ReminderLog.countDocuments({ appointmentId: appointment._id })).toBe(0);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	// The dedup THIS function relies on - a unique index on the model, not a query check (see
	// ReminderLog's own header comment on why a send failure here never retries).
	it('never re-sends the same appointment/offset/channel - the second call is a no-op', async () => {
		const { artist, project } = await artistWithClient();
		const now = new Date();
		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentDate: new Date(now.getTime() + 30 * 60 * 1000),
		});
		const settings = await new ReminderSettings({
			artistUserId: artist._id,
			emailEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();
		recorder();

		const first = await sendRemindersForArtist(settings, now);
		const second = await sendRemindersForArtist(settings, now);

		expect(first.sent).toBe(1);
		expect(second).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(sendEmail).toHaveBeenCalledTimes(1);
	});

	it('sends over SMS too, independently logged from the email channel', async () => {
		const { artist, client, project } = await artistWithClient();
		client.phone = '+15095550100';
		await client.save();
		const now = new Date();
		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentDate: new Date(now.getTime() + 30 * 60 * 1000),
		});
		const settings = await new ReminderSettings({
			artistUserId: artist._id,
			emailEnabled: true,
			smsEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();
		recorder();
		const texted = smsRecorder();

		const result = await sendRemindersForArtist(settings, now);

		expect(result).toEqual({ sent: 2, skipped: 0, failed: 0 });
		expect(texted).toHaveLength(1);
		expect(texted[0].to).toBe('+15095550100');
	});

	// client.phone defaults to '' - the realistic way an sms channel goes unsent, since
	// Client.email is `required: true` and can never be falsy the same way.
	it('reports skipped, not sent, for an sms channel when the client has no phone on file', async () => {
		const { artist, project } = await artistWithClient();
		const now = new Date();
		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentDate: new Date(now.getTime() + 30 * 60 * 1000),
		});
		const settings = await new ReminderSettings({
			artistUserId: artist._id,
			smsEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();

		const result = await sendRemindersForArtist(settings, now);

		expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 });
		const log = await ReminderLog.findOne({ channel: 'sms' });
		expect(log.status).toBe('skipped');
	});

	it('reports failed and logs the error, without throwing, when the send provider itself throws', async () => {
		const { artist, project } = await artistWithClient();
		const now = new Date();
		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentDate: new Date(now.getTime() + 30 * 60 * 1000),
		});
		const settings = await new ReminderSettings({
			artistUserId: artist._id,
			emailEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();
		sendEmail.mockRejectedValue(new Error('provider timed out'));

		const result = await sendRemindersForArtist(settings, now);

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 1 });
		const log = await ReminderLog.findOne({ channel: 'email' });
		expect(log.status).toBe('failed');
		expect(log.error).toBe('provider timed out');
	});

	// Excluded at the query level (appointmentStatus not in REMINDABLE_STATUSES), not by a runtime
	// check - the exact failure this list exists to prevent, per the constant's own comment: a
	// client reminded about an appointment that was already cancelled/completed/no-showed.
	it('never reminds about a completed, cancelled, or no-show appointment', async () => {
		const { artist, project } = await artistWithClient();
		const now = new Date();
		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentDate: new Date(now.getTime() + 30 * 60 * 1000),
			appointmentStatus: 'cancelled',
		});
		const settings = await new ReminderSettings({
			artistUserId: artist._id,
			emailEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();

		const result = await sendRemindersForArtist(settings, now);

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('skips an appointment with no resolvable client (an "Other" type appointment) rather than guessing', async () => {
		const { user: artist } = await createArtistUser();
		const now = new Date();
		await createAppointment(artist._id, {
			appointmentType: 'other',
			appointmentDate: new Date(now.getTime() + 30 * 60 * 1000),
		});
		const settings = await new ReminderSettings({
			artistUserId: artist._id,
			emailEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();

		const result = await sendRemindersForArtist(settings, now);

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
	});

	// The Artist row is looked up separately from the reminder settings themselves - a defensive
	// branch for a state that "can't" happen (see this function's own header comment: "an Artist
	// row can't disappear while their User does not") but is cheap to pin: no artist means no
	// honest {{artistName}}, so skip rather than guess, exactly like the null-client case above.
	it('sends nothing, without throwing, when the settings reference an artistUserId with no Artist row', async () => {
		const { client, clientUser } = await createClientUser();
		void clientUser;
		const now = new Date();
		const settings = await new ReminderSettings({
			artistUserId: client._id, // stands in for "some userId with no Artist row"
			emailEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();

		const result = await sendRemindersForArtist(settings, now);

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(sendEmail).not.toHaveBeenCalled();
	});
});

describe('sendDueReminders', () => {
	it('aggregates results across every artist with reminders configured, and reports how many were checked', async () => {
		const first = await artistWithClient();
		const second = await artistWithClient();
		const now = new Date();
		await createAppointment(first.artist._id, {
			projectId: first.project._id,
			appointmentDate: new Date(now.getTime() + 30 * 60 * 1000),
		});
		await createAppointment(second.artist._id, {
			projectId: second.project._id,
			appointmentDate: new Date(now.getTime() + 30 * 60 * 1000),
		});
		await new ReminderSettings({
			artistUserId: first.artist._id,
			emailEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();
		await new ReminderSettings({
			artistUserId: second.artist._id,
			emailEnabled: true,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();
		recorder();

		const result = await sendDueReminders({ now });

		expect(result).toEqual({ sent: 2, skipped: 0, failed: 0, artistsChecked: 2 });
	});

	// The query itself excludes a settings row with neither channel on - the same
	// "genuinely nothing to do" case sendRemindersForArtist's own first test covers at the
	// function level, pinned here at the sweep's own query boundary instead.
	it('does not even consider an artist whose reminders are entirely disabled', async () => {
		const { artist } = await artistWithClient();
		await new ReminderSettings({
			artistUserId: artist._id,
			rules: [{ offsetMinutes: 60, enabled: true }],
		}).save();

		const result = await sendDueReminders({ now: new Date() });

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0, artistsChecked: 0 });
	});
});
