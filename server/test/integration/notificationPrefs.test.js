// Preferences and the daily digest.
//
// The rule these guard: a preference controls EMAIL, never the in-app record. The inbox is also
// the audit trail - "did we tell the shop about that payment" has to stay answerable - so a muted
// category still writes the row and simply doesn't email it. Getting that backwards would make
// preferences quietly destroy history, and nothing would ever report it.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createShopAdminUser, createStaffUser } = require('../helpers/factories');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { notify } = require('../../utils/notifications');
const { emailModeFor, defaultsForRole } = require('../../utils/notification-preferences');
const { sendDailyDigests, localHour, renderDigest } = require('../../utils/digest');

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

const GET_SETTINGS = `
	query GetNotificationSettings {
		getNotificationSettings {
			prefs { moneyEmail scheduleEmail rosterEmail messageEmail }
			moneyMode
			scheduleMode
			timezone
			digestHour
		}
	}
`;

const UPDATE_SETTINGS = `
	mutation UpdateNotificationSettings($prefs: NotificationPrefsInput, $timezone: String, $digestHour: Int) {
		updateNotificationSettings(prefs: $prefs, timezone: $timezone, digestHour: $digestHour) {
			prefs { moneyEmail scheduleEmail rosterEmail messageEmail }
			moneyMode
			timezone
			digestHour
		}
	}
`;

const moneyEvent = (actorId, recipientId) => ({
	actorId,
	recipientIds: [recipientId],
	type: 'deposit_collected',
	category: 'money',
	subjectType: 'appointment',
	subjectId: actorId,
	title: '$200.00 deposit collected',
	amountCents: 20000,
});

describe('defaults by role', () => {
	it('digests money for a shop admin and sends it immediately to an artist', async () => {
		// Volume, not importance. Six artists produce 60-80 money events a week; individually that
		// is noise, and as one summary it is the most useful thing the system makes. A solo artist
		// produces a handful, so there is nothing to roll up.
		const { user: admin } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();

		expect(defaultsForRole(admin).money).toBe('digest');
		expect(defaultsForRole(artist).money).toBe('immediate');
	});

	it('does not email a front desk about money', async () => {
		const { shop } = await createShopAdminUser();
		const { user: staff } = await createStaffUser(shop._id);
		expect(emailModeFor(staff, 'money')).toBe('off');
		expect(emailModeFor(staff, 'schedule')).toBe('immediate');
	});

	it('treats an unset preference as the role default, not as off', async () => {
		// A missing preference and a deliberate false are different answers. Storing defaults into
		// every account at creation would freeze today's defaults in forever - changing one later
		// would only affect people who signed up after the change.
		const { user: artist } = await createArtistUser();
		expect(artist.notificationPrefs?.moneyEmail).toBeUndefined();
		expect(emailModeFor(artist, 'money')).toBe('immediate');
	});

	it('lets an explicit false win over the default', async () => {
		const { user: artist } = await createArtistUser();
		artist.notificationPrefs = { moneyEmail: false };
		expect(emailModeFor(artist, 'money')).toBe('off');
	});

	it('turning a category on gives the cadence the role implies', async () => {
		// A shop admin who enables money email is asking to hear about money, not asking to be
		// interrupted 80 times a week. On means on at the cadence that suits them.
		const { user: admin } = await createShopAdminUser();
		admin.notificationPrefs = { moneyEmail: true };
		expect(emailModeFor(admin, 'money')).toBe('digest');
	});
});

describe('preferences control email, never the record', () => {
	it('still writes the notification when email is off', async () => {
		// THE test in this file. A preference that suppressed the row would make the inbox an
		// unreliable record of what happened, and nothing would report the gap.
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		await User.updateOne({ _id: admin.id }, { $set: { 'notificationPrefs.moneyEmail': false } });

		const created = await notify(moneyEvent(artist.id, admin.id));

		expect(created).toHaveLength(1);
		expect(created[0].emailStatus).toBe('skipped');
	});

	it('queues an immediate email for a role that gets them', async () => {
		const { user: someone } = await createArtistUser();
		const { user: artist } = await createArtistUser();

		const [n] = await notify(moneyEvent(someone.id, artist.id));

		expect(n.emailStatus).toBe('pending');
		expect(n.emailAfter).toBeTruthy();
	});

	it('holds a digest-class notification for the digest instead', async () => {
		// 'digest' rather than 'pending' is what keeps the immediate sweep from sending it - two
		// queries over one field, rather than a second field that could disagree with the first.
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();

		const [n] = await notify(moneyEvent(artist.id, admin.id));

		expect(n.emailStatus).toBe('digest');
		expect(n.emailAfter).toBeNull();
	});

	it('resolves preferences per recipient, not once for the event', async () => {
		// One event, three people, three different outcomes - which is the whole shop-versus-solo,
		// money-versus-schedule story, living in the recipient's role rather than the emit site.
		const { user: artist } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		const { user: staff } = await createStaffUser(shop._id);
		const { user: otherArtist } = await createArtistUser();

		await notify({
			...moneyEvent(artist.id, admin.id),
			recipientIds: [admin.id, staff.id, otherArtist.id],
		});

		const statusFor = async (u) =>
			(await Notification.findOne({ userId: u.id })).emailStatus;

		expect(await statusFor(admin)).toBe('digest');
		expect(await statusFor(staff)).toBe('skipped');
		expect(await statusFor(otherArtist)).toBe('pending');
	});
});

describe('the settings API', () => {
	it('reports resolved modes, not just the raw preferences', async () => {
		// A settings screen showing a blank toggle with no way to say what a blank does is a screen
		// nobody can act on. The resolved mode is the sentence a person needs.
		const { user: admin } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation({ query: GET_SETTINGS }, asUser(admin));

		expect(res.body.singleResult.errors).toBeUndefined();
		const s = res.body.singleResult.data.getNotificationSettings;
		expect(s.prefs.moneyEmail).toBeNull();
		expect(s.moneyMode).toBe('digest');
		expect(s.timezone).toBe('America/Los_Angeles');
		expect(s.digestHour).toBe(8);
	});

	it('changes one preference without wiping the others', async () => {
		// A client sending { moneyEmail: false } must not reset the other three - and null is
		// meaningful here, so an absent key and an explicit null are different instructions.
		const { user: admin } = await createShopAdminUser();
		const server = createTestServer();

		await server.executeOperation(
			{ query: UPDATE_SETTINGS, variables: { prefs: { scheduleEmail: false } } },
			asUser(admin),
		);
		const res = await server.executeOperation(
			{ query: UPDATE_SETTINGS, variables: { prefs: { moneyEmail: false } } },
			asUser(admin),
		);

		const prefs = res.body.singleResult.data.updateNotificationSettings.prefs;
		expect(prefs.moneyEmail).toBe(false);
		expect(prefs.scheduleEmail).toBe(false);
	});

	it('saves timezone and digest hour', async () => {
		const { user: admin } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: UPDATE_SETTINGS,
				variables: { timezone: 'America/New_York', digestHour: 7 },
			},
			asUser(admin),
		);

		const s = res.body.singleResult.data.updateNotificationSettings;
		expect(s.timezone).toBe('America/New_York');
		expect(s.digestHour).toBe(7);
	});

	it('refuses an hour outside the day', async () => {
		const { user: admin } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: UPDATE_SETTINGS, variables: { digestHour: 25 } },
			asUser(admin),
		);

		expect(res.body.singleResult.errors).toBeDefined();
	});

	it('does not clear the timezone when only the hour is sent', async () => {
		const { user: admin } = await createShopAdminUser();
		const server = createTestServer();

		await server.executeOperation(
			{ query: UPDATE_SETTINGS, variables: { timezone: 'Europe/London' } },
			asUser(admin),
		);
		const res = await server.executeOperation(
			{ query: UPDATE_SETTINGS, variables: { digestHour: 9 } },
			asUser(admin),
		);

		const s = res.body.singleResult.data.updateNotificationSettings;
		expect(s.timezone).toBe('Europe/London');
		expect(s.digestHour).toBe(9);
	});
});

describe('the digest', () => {
	const okSender = async () => ({ id: 'fake' });

	async function adminWithPendingDigest({ timezone, digestHour }) {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		await User.updateOne({ _id: admin.id }, { $set: { timezone, digestHour } });
		await notify(moneyEvent(artist.id, admin.id));
		return { admin, artist };
	}

	it('reads the hour in the recipient timezone, not in UTC', async () => {
		// The reason the boundary is a zone name and not an offset. 15:30 UTC is 08:00 in Los
		// Angeles and 11:00 in New York, and an offset would be wrong twice a year in both.
		const at = new Date('2026-08-05T15:30:00Z');
		expect(localHour('America/Los_Angeles', at)).toBe(8);
		expect(localHour('America/New_York', at)).toBe(11);
	});

	it('sends at the recipient chosen local hour', async () => {
		const { admin } = await adminWithPendingDigest({
			timezone: 'America/Los_Angeles',
			digestHour: 8,
		});

		const result = await sendDailyDigests({
			now: new Date('2026-08-05T15:30:00Z'),
			send: okSender,
		});

		expect(result.sent).toBe(1);
		expect((await Notification.findOne({ userId: admin.id })).emailStatus).toBe('sent');
	});

	it('stays quiet at every other hour', async () => {
		await adminWithPendingDigest({ timezone: 'America/Los_Angeles', digestHour: 8 });

		const result = await sendDailyDigests({
			now: new Date('2026-08-05T20:30:00Z'), // 13:00 in LA
			send: okSender,
		});

		expect(result.sent).toBe(0);
	});

	it('never digests the same notification twice', async () => {
		// Idempotent through the rows themselves - they leave 'digest' as part of sending. A
		// separate "last digest sent" field would be a second record of a fact the rows already
		// carry, and it could disagree with them.
		await adminWithPendingDigest({ timezone: 'America/Los_Angeles', digestHour: 8 });
		const at = new Date('2026-08-05T15:30:00Z');

		const first = await sendDailyDigests({ now: at, send: okSender });
		const second = await sendDailyDigests({ now: at, send: okSender });

		expect(first.sent).toBe(1);
		expect(second.sent).toBe(0);
	});

	it('leaves immediate notifications alone', async () => {
		// The digest must not swallow something meant to interrupt. Exceptions are immediate on
		// purpose - a failed payment rolled into tomorrow morning's summary is the failure this
		// whole cadence split exists to avoid.
		const { user: someone } = await createArtistUser();
		const { user: artist } = await createArtistUser();
		await User.updateOne(
			{ _id: artist.id },
			{ $set: { timezone: 'America/Los_Angeles', digestHour: 8 } },
		);
		await notify(moneyEvent(someone.id, artist.id));

		const result = await sendDailyDigests({
			now: new Date('2026-08-05T15:30:00Z'),
			send: okSender,
		});

		expect(result.sent).toBe(0);
		expect((await Notification.findOne({ userId: artist.id })).emailStatus).toBe('pending');
	});

	it('records not-sent as not-sent when the provider returns nothing', async () => {
		const { admin } = await adminWithPendingDigest({
			timezone: 'America/Los_Angeles',
			digestHour: 8,
		});

		await sendDailyDigests({
			now: new Date('2026-08-05T15:30:00Z'),
			send: async () => null,
		});

		const stored = await Notification.findOne({ userId: admin.id });
		expect(stored.emailStatus).toBe('skipped');
	});

	it('totals the money section so the useful number is not left to be added up', async () => {
		const { html, text } = renderDigest([
			{ category: 'money', title: 'a', body: '', amountCents: 20000 },
			{ category: 'money', title: 'b', body: '', amountCents: 45000 },
			{ category: 'schedule', title: 'c', body: '' },
		]);
		expect(text).toContain('$650.00');
		expect(html).toContain('$650.00');
	});
});
