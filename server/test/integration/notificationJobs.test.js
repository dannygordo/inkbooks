// notification-jobs.js's two nudge sweeps (sendMessageNudges, sendBoothRentNudges) and the
// notificationJobs() composition that wires every scheduled job together had zero coverage
// anywhere - scheduler.test.js imports from this same file but only ever exercises sendDueEmails
// and findOrphanedEmails. Feature 3 (message nudges, PLAN.md) and Feature 5's active half (booth
// rent escalation) are real, dedup'd, actor-rule-sensitive notification logic.
//
// findUnansweredMessages/findOverdueBoothRentCharges (utils/attention.js) and
// resolveThresholdsForArtists (utils/response-time.js) are mocked at the module boundary - their
// own query logic already has its own dedicated coverage (attention.test.js, response-time's own
// suite). What's specific to THIS file is what it does with what they return: the
// dedup-by-recent-notification check, the actor-rule-correct notify() calls, and the
// created/considered counters. notify() itself runs for real against the test DB, so the
// assertions below are on actual stored Notification rows, not a spy.
//
// describe/it/expect/vi come from Vitest's `globals: true` config.
vi.mock('../../utils/attention', () => ({
	findUnansweredMessages: vi.fn(),
	findOverdueBoothRentCharges: vi.fn(),
}));
vi.mock('../../utils/response-time', () => ({
	resolveThresholdsForArtists: vi.fn(),
	// notification-jobs.js imports this constant directly (not through the mocked function), so
	// mocking the module means THIS is the value its own fallback (`|| DEFAULT_REPEAT_INTERVAL_
	// MINUTES`) actually uses - picked distinct from the real default so a test that forgets to
	// mock resolveThresholdsForArtists's return shape fails loudly instead of coincidentally
	// matching production's real number.
	DEFAULT_REPEAT_INTERVAL_MINUTES: 180,
}));
vi.mock('../../utils/booth-rent', async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, resolveBoothRentPlanAt: vi.fn() };
});
vi.mock('../../utils/notification-audience', () => ({
	shopAdminUserIds: vi.fn(),
}));

const { findUnansweredMessages, findOverdueBoothRentCharges } = require('../../utils/attention');
const { resolveThresholdsForArtists } = require('../../utils/response-time');
const { resolveBoothRentPlanAt } = require('../../utils/booth-rent');
const { shopAdminUserIds } = require('../../utils/notification-audience');
const Notification = require('../../models/Notification');
const BoothRentCharge = require('../../models/BoothRentCharge');
const { createArtistUser, createClientUser, createShopAdminUser } = require('../helpers/factories');
const { sendMessageNudges, sendBoothRentNudges, notificationJobs } = require('../../utils/notification-jobs');

// findUnansweredMessages returns a real Conversation._id in production - a fixed valid ObjectId
// stands in for it here since the conversation itself is never read back through Mongo, only
// used as Notification.subjectId (itself schema-typed ObjectId, so a string like 'conv-1' would
// fail to cast).
const FAKE_CONVERSATION_ID = '507f1f77bcf86cd799439099';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('sendMessageNudges', () => {
	it('returns zero without querying anything when there are no artists at all', async () => {
		const result = await sendMessageNudges();
		expect(result).toEqual({ created: 0, considered: 0 });
		expect(findUnansweredMessages).not.toHaveBeenCalled();
	});

	it('creates a real notification for an unanswered conversation, with the client as actor', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		resolveThresholdsForArtists.mockResolvedValue(
			new Map([[String(artist._id), { repeatIntervalMinutes: 60 }]]),
		);
		findUnansweredMessages.mockResolvedValue([
			{
				artistUserId: artist._id,
				clientUserId: clientUser._id,
				conversationId: FAKE_CONVERSATION_ID,
				latestMessage: { message: 'Hey, still there?' },
			},
		]);

		const result = await sendMessageNudges();

		expect(result).toEqual({ created: 1, considered: 1 });
		const notif = await Notification.findOne({ userId: artist._id, type: 'message_unanswered' });
		expect(notif).toBeTruthy();
		expect(String(notif.actorId)).toBe(String(clientUser._id));
		expect(String(notif.subjectId)).toBe(FAKE_CONVERSATION_ID);
		expect(notif.body).toContain('Hey, still there?');
	});

	// The three-way body fallback is the only wording logic this function owns - worth pinning
	// directly rather than trusting it only through the "some real text" case above.
	it('falls back to a generic nudge for a message with no text and no image', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		resolveThresholdsForArtists.mockResolvedValue(
			new Map([[String(artist._id), { repeatIntervalMinutes: 60 }]]),
		);
		findUnansweredMessages.mockResolvedValue([
			{
				artistUserId: artist._id,
				clientUserId: clientUser._id,
				conversationId: FAKE_CONVERSATION_ID,
				latestMessage: { message: '' },
			},
		]);

		await sendMessageNudges();

		const notif = await Notification.findOne({ userId: artist._id, type: 'message_unanswered' });
		expect(notif.body).toBe('Reply when you get a chance.');
	});

	it('falls back to an image-specific nudge when the unanswered message is image-only', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		resolveThresholdsForArtists.mockResolvedValue(
			new Map([[String(artist._id), { repeatIntervalMinutes: 60 }]]),
		);
		findUnansweredMessages.mockResolvedValue([
			{
				artistUserId: artist._id,
				clientUserId: clientUser._id,
				conversationId: FAKE_CONVERSATION_ID,
				latestMessage: { message: '', imageUrls: ['https://example.com/a.jpg'] },
			},
		]);

		await sendMessageNudges();

		const notif = await Notification.findOne({ userId: artist._id, type: 'message_unanswered' });
		expect(notif.body).toBe('They sent an image.');
	});

	// The dedup THIS function owns (by query, not a unique index - see its own header comment):
	// a recent 'message_unanswered' row for the same conversation must suppress a re-nudge.
	it('never nudges twice inside the repeat interval - a recent notification is the dedup', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		resolveThresholdsForArtists.mockResolvedValue(
			new Map([[String(artist._id), { repeatIntervalMinutes: 60 }]]),
		);
		findUnansweredMessages.mockResolvedValue([
			{
				artistUserId: artist._id,
				clientUserId: clientUser._id,
				conversationId: FAKE_CONVERSATION_ID,
				latestMessage: { message: 'Still waiting...' },
			},
		]);

		const first = await sendMessageNudges();
		const second = await sendMessageNudges();

		expect(first.created).toBe(1);
		expect(second).toEqual({ created: 0, considered: 1 });
		expect(await Notification.countDocuments({ userId: artist._id, type: 'message_unanswered' })).toBe(1);
	});

	// thresholdsByArtist.get() returning undefined for an artist findUnansweredMessages still
	// returned (a real possibility - the two calls query independently) must not throw reading
	// `.repeatIntervalMinutes` off it, and must fall back to the mocked module's own default.
	it('falls back to the default repeat interval when the artist has no resolved threshold row', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		resolveThresholdsForArtists.mockResolvedValue(new Map());
		findUnansweredMessages.mockResolvedValue([
			{
				artistUserId: artist._id,
				clientUserId: clientUser._id,
				conversationId: FAKE_CONVERSATION_ID,
				latestMessage: { message: 'Hello?' },
			},
		]);

		const result = await sendMessageNudges();

		expect(result.created).toBe(1);
		expect(await Notification.countDocuments({ userId: artist._id, type: 'message_unanswered' })).toBe(1);
	});
});

describe('sendBoothRentNudges', () => {
	it('returns zero without querying anything when there are no artists at all', async () => {
		const result = await sendBoothRentNudges();
		expect(result).toEqual({ created: 0, considered: 0 });
		expect(findOverdueBoothRentCharges).not.toHaveBeenCalled();
	});

	it('notifies both the artist and the shop admins for an overdue charge, each with the other as actor', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser({ artist: { shopId: shop._id } });
		const charge = await new BoothRentCharge({
			artistId: artist._id,
			shopId: shop._id,
			amountCents: 15000,
			periodMonth: new Date('2026-08-01'),
			dueDate: new Date('2026-08-01'),
			status: 'due',
		}).save();
		resolveBoothRentPlanAt.mockResolvedValue({ setByUserId: shopAdmin._id });
		shopAdminUserIds.mockResolvedValue([shopAdmin._id]);
		findOverdueBoothRentCharges.mockResolvedValue([charge]);

		const result = await sendBoothRentNudges();

		expect(result).toEqual({ created: 2, considered: 1 });
		const artistNotif = await Notification.findOne({ userId: artist._id, type: 'booth_rent_overdue' });
		expect(artistNotif).toBeTruthy();
		expect(String(artistNotif.actorId)).toBe(String(shopAdmin._id));
		expect(artistNotif.amountCents).toBe(15000);
		const adminNotif = await Notification.findOne({ userId: shopAdmin._id, type: 'booth_rent_overdue' });
		expect(adminNotif).toBeTruthy();
		expect(String(adminNotif.actorId)).toBe(String(artist._id));
	});

	// resolveBoothRentPlanAt returning null (a charge with no resolvable plan at its own due date)
	// must skip only the artist-side notify() call - the function's own header comment is explicit
	// that the two sides are independent, not one call gated on the other.
	it('skips the artist-side notification when no plan can be resolved, but still notifies the shop', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser({ artist: { shopId: shop._id } });
		const charge = await new BoothRentCharge({
			artistId: artist._id,
			shopId: shop._id,
			amountCents: 15000,
			periodMonth: new Date('2026-08-01'),
			dueDate: new Date('2026-08-01'),
			status: 'due',
		}).save();
		resolveBoothRentPlanAt.mockResolvedValue(null);
		shopAdminUserIds.mockResolvedValue([shopAdmin._id]);
		findOverdueBoothRentCharges.mockResolvedValue([charge]);

		const result = await sendBoothRentNudges();

		expect(result).toEqual({ created: 1, considered: 1 });
		expect(await Notification.countDocuments({ userId: artist._id, type: 'booth_rent_overdue' })).toBe(0);
		expect(await Notification.countDocuments({ userId: shopAdmin._id, type: 'booth_rent_overdue' })).toBe(1);
	});

	it('never nudges the same charge twice inside the repeat interval', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser({ artist: { shopId: shop._id } });
		const charge = await new BoothRentCharge({
			artistId: artist._id,
			shopId: shop._id,
			amountCents: 15000,
			periodMonth: new Date('2026-08-01'),
			dueDate: new Date('2026-08-01'),
			status: 'due',
		}).save();
		resolveBoothRentPlanAt.mockResolvedValue({ setByUserId: shopAdmin._id });
		shopAdminUserIds.mockResolvedValue([shopAdmin._id]);
		findOverdueBoothRentCharges.mockResolvedValue([charge]);

		const first = await sendBoothRentNudges();
		const second = await sendBoothRentNudges();

		expect(first.created).toBe(2);
		expect(second).toEqual({ created: 0, considered: 1 });
		expect(await Notification.countDocuments({ subjectId: charge._id })).toBe(2);
	});
});

describe('notificationJobs', () => {
	it('returns all seven scheduled jobs, named and cadenced as the scheduler expects', () => {
		const jobs = notificationJobs();

		expect(jobs.map((j) => j.name)).toEqual([
			'notification-emails',
			'client-schedule-emails',
			'notification-digests',
			'appointment-reminders',
			'message-nudges',
			'booth-rent-nudges',
			'notification-email-orphans',
		]);
		const byName = Object.fromEntries(jobs.map((j) => [j.name, j.everyMs]));
		// client-schedule-emails is deliberately the tightest cadence (see this file's own header
		// comment on why a booking confirmation can't tolerate the standard 5-minute sweep).
		expect(byName['client-schedule-emails']).toBe(60 * 1000);
		expect(byName['notification-emails']).toBe(5 * 60 * 1000);
		expect(byName['notification-digests']).toBe(60 * 60 * 1000);
	});

	// The orphan job's onReport calls are real alerting logic (not just string formatting like
	// businessJobs' own summaries), and it's the one job whose run() branches on live data rather
	// than only delegating - worth exercising end to end against real Notification rows rather
	// than mocking findOrphanedEmails away.
	it("reports via onReport when a real backlog exists, and stays silent when it doesn't", async () => {
		const { user: artist } = await createArtistUser();
		const stuckSince = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago > the 1h orphan cutoff
		await new Notification({
			userId: artist._id,
			actorId: artist._id,
			type: 'test_event',
			category: 'message',
			subjectType: 'conversation',
			subjectId: FAKE_CONVERSATION_ID,
			title: 'x',
			emailStatus: 'pending',
			emailAfter: stuckSince,
			createdAt: stuckSince,
		}).save();

		const reports = [];
		const orphanJob = notificationJobs({ onReport: (msg) => reports.push(msg) }).find(
			(j) => j.name === 'notification-email-orphans',
		);
		const summary = await orphanJob.run();

		expect(summary).toBe('orphaned=1 digestStuck=0');
		expect(reports).toHaveLength(1);
		expect(reports[0]).toContain('1 email(s) queued over an hour ago');
	});

	it('stays silent when the sweep is keeping up', async () => {
		const reports = [];
		const orphanJob = notificationJobs({ onReport: (msg) => reports.push(msg) }).find(
			(j) => j.name === 'notification-email-orphans',
		);

		const summary = await orphanJob.run();

		expect(summary).toBe('orphaned=0 digestStuck=0');
		expect(reports).toHaveLength(0);
	});
});
