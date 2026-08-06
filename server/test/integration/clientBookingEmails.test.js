// What a client is told when their work gets booked, and - the harder half - WHEN.
//
// describe/it/expect come from Vitest's `globals: true` config.
const {
	createArtistUser,
	createClientUser,
	createProject,
	createAppointment,
	createBookingRequest,
} = require('../helpers/factories');
const ClientScheduleEmail = require('../../models/ClientScheduleEmail');
const {
	buildClientBookingEmail,
	queueProjectScheduleEmail,
	sendConsultBookedEmail,
	sendDueClientScheduleEmails,
} = require('../../utils/client-booking-emails');

/**
 * A stand-in mail provider.
 *
 * Returns a truthy value, because sendEmail() signals FAILURE by returning null rather than by
 * throwing - the convention the real senders check. A spy returning undefined would look like a
 * rejected send to the code under test and quietly exercise the wrong branch.
 */
function recorder() {
	const sent = [];
	const send = async (message) => {
		sent.push(message);
		return { id: `msg-${sent.length}` };
	};
	return { sent, send };
}

/** A project with a client and an artist behind it, ready to have sittings hung off it. */
async function projectWithParties() {
	const { user: artist } = await createArtistUser();
	const { user: clientUser, client } = await createClientUser();
	const project = await createProject(artist._id, client._id);
	return { artist, clientUser, client, project };
}

const minutesFromNow = (base, minutes) => new Date(base.getTime() + minutes * 60 * 1000);

describe('the debounce on a session confirmation', () => {
	it('coalesces four sittings entered in a row into one email', async () => {
		// THE requirement. An artist booking a course of work enters four dates in ninety seconds.
		// Sending per sitting means four emails, three of them already out of date on arrival, and
		// the client has to work out which one is current.
		const { artist, project } = await projectWithParties();
		const start = new Date('2026-08-05T17:00:00Z');

		for (let i = 0; i < 4; i += 1) {
			await createAppointment(artist._id, {
				projectId: project._id,
				appointmentType: 'session',
				appointmentDate: new Date(`2026-09-0${i + 1}T20:00:00Z`),
				durationMinutes: 180,
			});
			// Each one a few seconds after the last, all well inside the debounce.
			await queueProjectScheduleEmail(project._id, { now: minutesFromNow(start, i * 0.5) });
		}

		// ONE row, not four. This is the assertion that would fail if the queue inserted per
		// sitting instead of pushing the existing deadline.
		expect(await ClientScheduleEmail.countDocuments({ projectId: project._id })).toBe(1);

		const { sent, send } = recorder();
		await sendDueClientScheduleEmails({ now: minutesFromNow(start, 10), send });

		expect(sent).toHaveLength(1);
		// And it lists all four, including the three booked after the row was created - which is
		// only possible because the queue stores ids and renders at send time.
		expect(sent[0].textBody).toContain('September 1, 2026');
		expect(sent[0].textBody).toContain('September 4, 2026');
		expect(sent[0].subject).toContain('4 sessions');
	});

	it('restarts the clock, rather than sending three minutes after the first sitting', async () => {
		// The difference between a debounce and a plain delay, and the thing the user actually
		// asked for. A fixed delay would fire while the artist is still typing.
		const { artist, project } = await projectWithParties();
		const start = new Date('2026-08-05T17:00:00Z');

		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentType: 'session',
			appointmentDate: new Date('2026-09-01T20:00:00Z'),
		});
		await queueProjectScheduleEmail(project._id, { now: start });

		// Two and a half minutes later - inside the window - a second sitting goes in.
		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentType: 'session',
			appointmentDate: new Date('2026-09-08T20:00:00Z'),
		});
		await queueProjectScheduleEmail(project._id, { now: minutesFromNow(start, 2.5) });

		// At 3.5 minutes the ORIGINAL deadline has passed. Nothing may go out: the clock restarted.
		const first = recorder();
		await sendDueClientScheduleEmails({ now: minutesFromNow(start, 3.5), send: first.send });
		expect(first.sent).toHaveLength(0);

		// At 6 minutes - three past the SECOND sitting - it sends.
		const second = recorder();
		await sendDueClientScheduleEmails({ now: minutesFromNow(start, 6), send: second.send });
		expect(second.sent).toHaveLength(1);
		expect(second.sent[0].subject).toContain('2 sessions');
	});

	it('sends again when a sitting is added after the first confirmation has gone', async () => {
		// A fifth sitting three weeks later. The client gets the FULL updated schedule rather than
		// a fragment they have to reconcile against an older email.
		//
		// This is why the unique index on the queue is partial (status: 'pending') - a plain unique
		// index on projectId would make a project announceable exactly once, ever.
		const { artist, project } = await projectWithParties();
		const start = new Date('2026-08-05T17:00:00Z');

		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentType: 'session',
			appointmentDate: new Date('2026-09-01T20:00:00Z'),
		});
		await queueProjectScheduleEmail(project._id, { now: start });
		const first = recorder();
		await sendDueClientScheduleEmails({ now: minutesFromNow(start, 5), send: first.send });
		expect(first.sent).toHaveLength(1);

		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentType: 'session',
			appointmentDate: new Date('2026-09-22T20:00:00Z'),
		});
		const later = new Date('2026-08-26T17:00:00Z');
		await queueProjectScheduleEmail(project._id, { now: later });

		const second = recorder();
		await sendDueClientScheduleEmails({ now: minutesFromNow(later, 5), send: second.send });
		expect(second.sent).toHaveLength(1);
		// Both dates - the whole schedule, not just the new one.
		expect(second.sent[0].textBody).toContain('September 1, 2026');
		expect(second.sent[0].textBody).toContain('September 22, 2026');
	});

	it('sends nothing before the deadline', async () => {
		const { artist, project } = await projectWithParties();
		const start = new Date('2026-08-05T17:00:00Z');
		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentType: 'session',
			appointmentDate: new Date('2026-09-01T20:00:00Z'),
		});
		await queueProjectScheduleEmail(project._id, { now: start });

		const { sent, send } = recorder();
		await sendDueClientScheduleEmails({ now: minutesFromNow(start, 2), send });
		expect(sent).toHaveLength(0);
	});

	it('does not send the same confirmation twice', async () => {
		// The sweep claims a row out of 'pending' BEFORE sending, so a second sweep - or a second
		// server instance - finds nothing to do.
		const { artist, project } = await projectWithParties();
		const start = new Date('2026-08-05T17:00:00Z');
		await createAppointment(artist._id, {
			projectId: project._id,
			appointmentType: 'session',
			appointmentDate: new Date('2026-09-01T20:00:00Z'),
		});
		await queueProjectScheduleEmail(project._id, { now: start });

		const { sent, send } = recorder();
		await sendDueClientScheduleEmails({ now: minutesFromNow(start, 5), send });
		await sendDueClientScheduleEmails({ now: minutesFromNow(start, 6), send });

		expect(sent).toHaveLength(1);
	});
});

describe('a consult confirmation', () => {
	it('goes immediately, with the deposit and the intake on it', async () => {
		// No queue, no sweep, no waiting. There is one appointment and nothing else is coming for
		// it, and the client is usually still standing at the counter.
		const { user: artist } = await createArtistUser();
		const { user: clientUser, client } = await createClientUser();
		const bookingRequest = await createBookingRequest(artist._id, client._id, {
			description: 'Needle and thread, black and grey',
			placement: 'Left forearm',
		});
		const appointment = await createAppointment(artist._id, {
			appointmentType: 'consult',
			appointmentDate: new Date('2026-08-17T17:00:00Z'),
			durationMinutes: 45,
			depositCents: 15000,
			depositStatus: 'available',
		});

		const { sent, send } = recorder();
		const result = await sendConsultBookedEmail(
			{
				appointment,
				clientUserId: clientUser._id,
				artistUserId: artist._id,
				bookingRequestId: bookingRequest._id,
			},
			{ send },
		);

		expect(result.ok).toBe(true);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe(clientUser.email);
		expect(sent[0].subject).toContain('consult');
		expect(sent[0].textBody).toContain('$150.00');
		expect(sent[0].textBody).toContain('Needle and thread, black and grey');
		expect(sent[0].textBody).toContain('Left forearm');
	});

	it('reports a rejected send instead of claiming it went', async () => {
		// sendEmail() returns null on rejection rather than throwing. Treating that as success is
		// how "sent" came to be reported for mail that never left - see message-notifications.js.
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const appointment = await createAppointment(artist._id, { appointmentType: 'consult' });

		const result = await sendConsultBookedEmail(
			{ appointment, clientUserId: clientUser._id, artistUserId: artist._id },
			{ send: async () => null },
		);

		expect(result).toEqual({ ok: false, reason: 'provider-rejected' });
	});
});

describe('what the email says', () => {
	// Against the builder directly - no database, no provider. The wording is the deliverable here,
	// and asserting it through a send would make these tests about plumbing.
	const base = {
		clientFirstName: 'Arya',
		artistName: 'Maya Chen',
		timezone: 'America/Los_Angeles',
		kind: 'session',
		appointments: [
			{ appointmentDate: new Date('2026-08-19T20:00:00Z'), durationMinutes: 210 },
		],
		depositCents: 20000,
	};

	it('states the times in the studio timezone, and names it', async () => {
		// A client flying in needs the time AT THE SHOP. An unlabelled time is a guess as soon as
		// the reader is anywhere else, so the zone is on the email rather than assumed.
		const email = buildClientBookingEmail(base);
		expect(email.textBody).toContain('1:00 PM PDT');
		expect(email.textBody).toContain('America/Los_Angeles');
	});

	it('names the weekday, so a wrong date is obvious', async () => {
		expect(buildClientBookingEmail(base).textBody).toContain('Wednesday');
	});

	it('gives the duration in hours, not a minute count to divide', async () => {
		expect(buildClientBookingEmail(base).textBody).toContain('3 hours 30 minutes');
	});

	it('says so when no deposit was taken, rather than staying silent about money', async () => {
		// Silence about money reads as an oversight and generates the exact question this email
		// exists to prevent.
		const email = buildClientBookingEmail({ ...base, depositCents: 0 });
		expect(email.textBody).toContain('none taken');
	});

	it('leaves out intake fields nobody filled in', async () => {
		// "Placement: —, Size: —" reads as a form that failed rather than a request somebody chose
		// not to over-specify.
		const email = buildClientBookingEmail({
			...base,
			bookingRequest: { description: 'Small piece', placement: '', size: null },
		});
		expect(email.textBody).toContain('Small piece');
		expect(email.textBody).not.toContain('Placement');
		expect(email.textBody).not.toContain('Size');
	});
});
