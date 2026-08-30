// Push as the fourth notification channel (PRODUCTION_ROADMAP.md Phase 5 step 7) - the
// registration mutations end to end against the real schema, and notify()'s wiring into
// utils/push.js.
//
// vi.spyOn(push, 'sendPushForRecipients'), not vi.mock() - see
// test/integration/shopCutLedger.test.js's comment on why this CommonJS test setup needs the
// module-object form, and utils/notifications.js's own comment on why it requires('./push')
// un-destructured specifically so this spy takes effect.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createShopAdminUser } = require('../helpers/factories');
const PushToken = require('../../models/PushToken');
const push = require('../../utils/push');
const { notify } = require('../../utils/notifications');

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

const REGISTER_DEVICE_TOKEN = `
	mutation RegisterDeviceToken($token: String!, $platform: String!) {
		registerDeviceToken(token: $token, platform: $platform)
	}
`;

const UNREGISTER_DEVICE_TOKEN = `
	mutation UnregisterDeviceToken($token: String!) {
		unregisterDeviceToken(token: $token)
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

describe('registerDeviceToken / unregisterDeviceToken', () => {
	it('registers a new device token for the caller', async () => {
		const { user: artist } = await createArtistUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: REGISTER_DEVICE_TOKEN, variables: { token: 'tok-new', platform: 'ios' } },
			asUser(artist),
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.registerDeviceToken).toBe(true);

		const row = await PushToken.findOne({ token: 'tok-new' });
		expect(String(row.userId)).toBe(String(artist.id));
		expect(row.platform).toBe('ios');
	});

	it('rejects a platform that is neither ios nor android', async () => {
		const { user: artist } = await createArtistUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: REGISTER_DEVICE_TOKEN, variables: { token: 'tok-bad', platform: 'windows' } },
			asUser(artist),
		);

		const { errors } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(errors[0].extensions.code).toBe('BAD_USER_INPUT');
		expect(await PushToken.findOne({ token: 'tok-bad' })).toBeNull();
	});

	// THE case a shared front-desk iPad hits constantly: a second account signs in on a device
	// that already has a registered token from the first. The token belongs to the device, not the
	// account - see models/PushToken.js - so this must reassign the existing row, never create a
	// second one racing to own the same physical device.
	it('reassigns an existing token to a different user rather than creating a second row', async () => {
		const { user: firstArtist } = await createArtistUser();
		const { user: secondArtist } = await createArtistUser();
		const server = createTestServer();

		await server.executeOperation(
			{ query: REGISTER_DEVICE_TOKEN, variables: { token: 'shared-ipad-tok', platform: 'ios' } },
			asUser(firstArtist),
		);
		await server.executeOperation(
			{ query: REGISTER_DEVICE_TOKEN, variables: { token: 'shared-ipad-tok', platform: 'ios' } },
			asUser(secondArtist),
		);

		const rows = await PushToken.find({ token: 'shared-ipad-tok' });
		expect(rows).toHaveLength(1);
		expect(String(rows[0].userId)).toBe(String(secondArtist.id));
	});

	it('unregisters a token, e.g. on logout', async () => {
		const { user: artist } = await createArtistUser();
		const server = createTestServer();
		await server.executeOperation(
			{ query: REGISTER_DEVICE_TOKEN, variables: { token: 'tok-to-remove', platform: 'android' } },
			asUser(artist),
		);

		const response = await server.executeOperation(
			{ query: UNREGISTER_DEVICE_TOKEN, variables: { token: 'tok-to-remove' } },
			asUser(artist),
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.unregisterDeviceToken).toBe(true);
		expect(await PushToken.findOne({ token: 'tok-to-remove' })).toBeNull();
	});

	it('unregistering a token nobody registered is not an error', async () => {
		const { user: artist } = await createArtistUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: UNREGISTER_DEVICE_TOKEN, variables: { token: 'never-registered' } },
			asUser(artist),
		);

		expect(response.body.singleResult.errors).toBeUndefined();
	});

	it('requires authentication', async () => {
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: REGISTER_DEVICE_TOKEN, variables: { token: 'tok-anon', platform: 'ios' } },
			{ contextValue: contextWithToken(null) },
		);

		expect(response.body.singleResult.errors).toBeDefined();
		expect(await PushToken.findOne({ token: 'tok-anon' })).toBeNull();
	});
});

describe('notify() -> push wiring', () => {
	let sendPushSpy;

	beforeEach(() => {
		sendPushSpy = vi.spyOn(push, 'sendPushForRecipients').mockResolvedValue({ sent: 1, pruned: 0 });
	});

	// Artists get money IMMEDIATE by default (notification-preferences.js's defaultsForRole) - the
	// exact bar push reuses (see utils/notifications.js's comment on why there's no separate
	// push-specific preference).
	it('sends push for a recipient whose category resolves to IMMEDIATE', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		await new PushToken({ userId: artist._id, token: 'tok-1', platform: 'ios' }).save();

		// admin as actor, artist as recipient - money is IMMEDIATE for an artist by role default.
		await notify(moneyEvent(admin.id, artist.id));
		// sendPushForRecipients is deliberately not awaited by notify() itself (see
		// utils/notifications.js) - flush the microtask queue so the fire-and-forget call has had a
		// chance to run before asserting on it.
		await new Promise((resolve) => setImmediate(resolve));

		expect(sendPushSpy).toHaveBeenCalledWith(
			[artist.id],
			expect.objectContaining({ title: moneyEvent(admin.id, artist.id).title }),
		);
	});

	// Shop admins get money as a DIGEST by default - the whole reason push reuses email's mode
	// resolution is so a digest recipient's phone doesn't buzz for every one of 60-80 weekly money
	// events any more than their inbox gets 60-80 immediate emails.
	it('does not send push for a recipient whose category resolves to DIGEST', async () => {
		const { user: admin } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await new PushToken({ userId: admin._id, token: 'tok-admin', platform: 'ios' }).save();

		await notify(moneyEvent(artist.id, admin.id));
		await new Promise((resolve) => setImmediate(resolve));

		expect(sendPushSpy).not.toHaveBeenCalled();
	});

	// `email: false` already means "in-app only" - push inherits that gate rather than getting its
	// own, since push leaves the device even more than email does.
	it('does not send push when the event is explicitly in-app only (email: false)', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		await new PushToken({ userId: artist._id, token: 'tok-2', platform: 'ios' }).save();

		await notify({ ...moneyEvent(admin.id, artist.id), email: false });
		await new Promise((resolve) => setImmediate(resolve));

		expect(sendPushSpy).not.toHaveBeenCalled();
	});

	it('a push failure never fails notify() itself - the in-app row is the source of truth', async () => {
		sendPushSpy.mockRejectedValue(new Error('Expo is down'));
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		await new PushToken({ userId: artist._id, token: 'tok-3', platform: 'ios' }).save();

		const created = await notify(moneyEvent(admin.id, artist.id));

		expect(created).toHaveLength(1);
	});
});
