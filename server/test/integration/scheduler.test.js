// The scheduler lock and the email sweeps.
//
// The lock is the reason this file exists. A setInterval on one instance is fine; on two it sends
// every digest twice, and that failure is INVISIBLE in development, where there is only ever one
// instance. So it cannot be verified by running the app - it has to be tested, by actually racing
// two runs and asserting one of them did nothing.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const ScheduledRun = require('../../models/ScheduledRun');
const Notification = require('../../models/Notification');
const { createArtistUser, createShopAdminUser } = require('../helpers/factories');
const { runOnce, claim, periodStartFor } = require('../../utils/scheduler');
const { sendDueEmails, findOrphanedEmails, ORPHAN_AFTER_MS } = require('../../utils/notification-jobs');
const { notify, markRead } = require('../../utils/notifications');

const HOUR = 60 * 60 * 1000;

describe('the scheduler lock', () => {
	it('runs a job once per period even when called repeatedly', async () => {
		let runs = 0;
		const now = Date.UTC(2026, 7, 5, 14, 5, 0);

		await runOnce('test-job', HOUR, async () => { runs += 1; }, now);
		await runOnce('test-job', HOUR, async () => { runs += 1; }, now + 60 * 1000);
		await runOnce('test-job', HOUR, async () => { runs += 1; }, now + 30 * 60 * 1000);

		expect(runs).toBe(1);
	});

	it('runs again in the next period', async () => {
		let runs = 0;
		const base = Date.UTC(2026, 7, 5, 14, 0, 0);

		await runOnce('rollover-job', HOUR, async () => { runs += 1; }, base);
		await runOnce('rollover-job', HOUR, async () => { runs += 1; }, base + HOUR);

		expect(runs).toBe(2);
	});

	it('lets exactly one of two concurrent runs through', async () => {
		// THE test. Two instances waking at the same moment is the case the lock exists for, and
		// the only way to see it fail is to actually race them - a sequential test would pass
		// against a naive check-then-run implementation that is completely broken in production.
		let runs = 0;
		const now = Date.UTC(2026, 7, 5, 16, 0, 0);
		const job = async () => {
			runs += 1;
			// A real job takes time, which is precisely the window a check-then-run loses in.
			await new Promise((resolve) => setTimeout(resolve, 20));
		};

		const results = await Promise.all([
			runOnce('race-job', HOUR, job, now),
			runOnce('race-job', HOUR, job, now),
			runOnce('race-job', HOUR, job, now),
		]);

		expect(runs).toBe(1);
		expect(results.filter((r) => r.ran)).toHaveLength(1);
		expect(results.filter((r) => r.reason === 'already-claimed')).toHaveLength(2);
	});

	it('records a failure rather than losing the run', async () => {
		// "It ran and failed" and "it never ran" are different facts. A scheduler that swallowed
		// the difference would be the silent-failure class this whole system exists to catch.
		const now = Date.UTC(2026, 7, 5, 18, 0, 0);
		await expect(
			runOnce('failing-job', HOUR, async () => { throw new Error('boom'); }, now),
		).rejects.toThrow('boom');

		const run = await ScheduledRun.findOne({ job: 'failing-job' });
		expect(run.error).toBe('boom');
		expect(run.finishedAt).toBeTruthy();
	});

	it('does not retry a failed period', async () => {
		// Deliberate. These are sweeps that run again next period anyway, and retrying inside the
		// same period would turn one broken run into a hot loop against whatever broke it.
		let attempts = 0;
		const now = Date.UTC(2026, 7, 5, 19, 0, 0);
		const job = async () => { attempts += 1; throw new Error('still broken'); };

		await expect(runOnce('no-retry', HOUR, job, now)).rejects.toThrow();
		const second = await runOnce('no-retry', HOUR, job, now + 60 * 1000);

		expect(attempts).toBe(1);
		expect(second.ran).toBe(false);
	});

	it('claims by period, not by wall clock', async () => {
		// If periodStart were `new Date()`, every attempt would be unique, the unique index would
		// never fire and the lock would be decoration that looks like protection.
		const now = Date.UTC(2026, 7, 5, 20, 30, 0);
		const first = await claim('clock-job', periodStartFor(HOUR, now));
		const second = await claim('clock-job', periodStartFor(HOUR, now + 45));

		expect(first).toBeTruthy();
		expect(second).toBeNull();
	});
});

describe('the email sweep', () => {
	// Injected rather than relying on utils/email.js, which returns null when no mail credentials
	// are configured - so a test asserting 'sent' would pass or fail depending on whether the
	// machine running it happened to have RESEND_API_KEY set. A fake makes the assertion about the
	// sweep's behaviour instead of about the environment.
	const okSender = async () => ({ id: 'fake-message-id' });
	const nullSender = async () => null;
	const throwingSender = async () => {
		throw new Error('provider exploded');
	};

	async function queuedNotification() {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const [n] = await notify({
			actorId: artist.id,
			recipientIds: [admin.id],
			type: 'deposit_collected',
			category: 'money',
			subjectType: 'appointment',
			subjectId: artist.id,
			title: '$200 deposit collected',
		});
		return { notification: n, admin, artist };
	}

	it('does not send while the grace is still running', async () => {
		// The three minutes are the point. Sending immediately would defeat the entire mechanism.
		await queuedNotification();
		const result = await sendDueEmails({ now: new Date(), send: okSender });
		expect(result.considered).toBe(0);
	});

	it('sends once the grace has expired', async () => {
		const { notification } = await queuedNotification();
		const later = new Date(Date.now() + 10 * 60 * 1000);

		const result = await sendDueEmails({ now: later, send: okSender });
		expect(result.considered).toBe(1);
		expect(result.sent).toBe(1);
		expect((await Notification.findById(notification._id)).emailStatus).toBe('sent');
	});

	it('never sends one that was read inside the grace', async () => {
		// The behaviour the whole delay was built for: somebody who has already seen and handled
		// a thing should not be emailed about it afterwards.
		const { notification, admin } = await queuedNotification();
		await markRead(admin.id, [notification._id]);

		const later = new Date(Date.now() + 10 * 60 * 1000);
		const result = await sendDueEmails({ now: later, send: okSender });

		expect(result.considered).toBe(0);
		expect((await Notification.findById(notification._id)).emailStatus).toBe('cancelled');
	});

	it('sends each notification exactly once across concurrent sweeps', async () => {
		// Two instances both running the email sweep. The claim is a conditional update out of
		// 'pending', so the loser matches nothing and sends nothing.
		const { notification } = await queuedNotification();
		const later = new Date(Date.now() + 10 * 60 * 1000);

		const [a, b] = await Promise.all([
			sendDueEmails({ now: later, send: okSender }),
			sendDueEmails({ now: later, send: okSender }),
		]);

		expect(a.sent + b.sent).toBe(1);
		expect((await Notification.findById(notification._id)).emailStatus).toBe('sent');
	});

	it('marks a notification skipped when the recipient has no address', async () => {
		const { notification, admin } = await queuedNotification();
		const User = require('../../models/User');
		await User.updateOne({ _id: admin.id }, { $unset: { email: '' } });

		const later = new Date(Date.now() + 10 * 60 * 1000);
		await sendDueEmails({ now: later, send: okSender });

		expect((await Notification.findById(notification._id)).emailStatus).toBe('skipped');
	});

	it('records not-sent as not-sent when the provider returns nothing', async () => {
		// utils/email.js warns and returns null when it isn't configured. Marking that 'sent' would
		// put a false claim in the audit trail, and in a dev environment with no mail set up EVERY
		// notification would claim it had been emailed.
		const { notification } = await queuedNotification();
		const later = new Date(Date.now() + 10 * 60 * 1000);

		const result = await sendDueEmails({ now: later, send: nullSender });

		expect(result.sent).toBe(0);
		expect(result.skipped).toBe(1);
		const stored = await Notification.findById(notification._id);
		expect(stored.emailStatus).toBe('skipped');
		expect(stored.emailError).toMatch(/no result/i);
	});

	it('rolls back to failed when the provider throws', async () => {
		// The row is claimed by flipping it to 'sent' BEFORE the send, so a throw must undo that.
		// Leaving it as 'sent' would be worse than no record - it is the record somebody would
		// trust when asking whether an email went out.
		const { notification } = await queuedNotification();
		const later = new Date(Date.now() + 10 * 60 * 1000);

		const result = await sendDueEmails({ now: later, send: throwingSender });

		expect(result.failed).toBe(1);
		const stored = await Notification.findById(notification._id);
		expect(stored.emailStatus).toBe('failed');
		expect(stored.emailError).toMatch(/exploded/);
	});
});

describe('orphaned email detection', () => {
	it('finds nothing when the sweep is keeping up', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		await notify({
			actorId: artist.id,
			recipientIds: [admin.id],
			type: 'deposit_collected',
			category: 'money',
			subjectType: 'appointment',
			subjectId: artist.id,
			title: 'recent',
		});

		expect((await findOrphanedEmails()).orphaned).toBe(0);
	});

	it('finds an email queued long ago and never resolved', async () => {
		// This is the notification system's own silent-failure catcher. If the send sweep dies,
		// nothing else in the app would ever mention it: the notifications still look right
		// in-app, and the only symptom is email that quietly stopped arriving.
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const [n] = await notify({
			actorId: artist.id,
			recipientIds: [admin.id],
			type: 'deposit_collected',
			category: 'money',
			subjectType: 'appointment',
			subjectId: artist.id,
			title: 'stuck',
		});

		// Queued well before the orphan threshold and still pending.
		await Notification.updateOne(
			{ _id: n._id },
			{ $set: { emailAfter: new Date(Date.now() - ORPHAN_AFTER_MS - 60 * 1000) } },
		);

		expect((await findOrphanedEmails()).orphaned).toBe(1);
	});

	it('does not count one that already sent', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const [n] = await notify({
			actorId: artist.id,
			recipientIds: [admin.id],
			type: 'deposit_collected',
			category: 'money',
			subjectType: 'appointment',
			subjectId: artist.id,
			title: 'done',
		});
		await Notification.updateOne(
			{ _id: n._id },
			{
				$set: {
					emailStatus: 'sent',
					emailAfter: new Date(Date.now() - ORPHAN_AFTER_MS - 60 * 1000),
				},
			},
		);

		expect((await findOrphanedEmails()).orphaned).toBe(0);
	});
});
