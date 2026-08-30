// utils/push.js in isolation - PushToken.find/deleteOne are stubbed directly rather than going
// through a real Mongo connection (this module never touches anything else Mongoose-side), and
// the Expo client is always injected via sendPushForRecipients's expoClient option, matching
// utils/email.js's sendEmail `send` param. Nothing here makes a real HTTP call to Expo.
const PushToken = require('../../models/PushToken');
const { sendPushForRecipients } = require('../../utils/push');

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

function stubTokens(tokens) {
	PushToken.find = () => ({ select: async () => tokens.map((token) => ({ token })) });
}

describe('sendPushForRecipients', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('sends one message per registered token and reports how many succeeded', async () => {
		stubTokens([TOKEN_A, TOKEN_B]);
		const expoClient = {
			chunkPushNotifications: (messages) => [messages],
			sendPushNotificationsAsync: async (chunk) => chunk.map(() => ({ status: 'ok', id: 'x' })),
		};

		const result = await sendPushForRecipients(
			['user-1'],
			{ title: 'Deposit collected', body: '$100 from Ada Lovelace' },
			{ expoClient },
		);

		expect(result).toEqual({ sent: 2, pruned: 0 });
	});

	it('prunes the token on DeviceNotRegistered - the app was uninstalled or the token revoked', async () => {
		stubTokens([TOKEN_A]);
		let deletedToken = null;
		PushToken.deleteOne = async ({ token }) => {
			deletedToken = token;
			return { deletedCount: 1 };
		};
		const expoClient = {
			chunkPushNotifications: (messages) => [messages],
			sendPushNotificationsAsync: async () => [
				{ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
			],
		};

		const result = await sendPushForRecipients(['user-1'], { title: 't', body: 'b' }, { expoClient });

		expect(result).toEqual({ sent: 0, pruned: 1 });
		expect(deletedToken).toBe(TOKEN_A);
	});

	it('reports a non-permanent ticket error but leaves the token in place', async () => {
		stubTokens([TOKEN_A]);
		let deleteCalled = false;
		PushToken.deleteOne = async () => {
			deleteCalled = true;
			return { deletedCount: 1 };
		};
		const expoClient = {
			chunkPushNotifications: (messages) => [messages],
			sendPushNotificationsAsync: async () => [
				{ status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
			],
		};

		const result = await sendPushForRecipients(['user-1'], { title: 't', body: 'b' }, { expoClient });

		expect(result).toEqual({ sent: 0, pruned: 0 });
		expect(deleteCalled).toBe(false);
	});

	it('never calls Expo for a recipient with no registered device', async () => {
		stubTokens([]);
		let sendCalled = false;
		const expoClient = {
			chunkPushNotifications: (m) => [m],
			sendPushNotificationsAsync: async () => {
				sendCalled = true;
				return [];
			},
		};

		const result = await sendPushForRecipients(['user-1'], { title: 't', body: 'b' }, { expoClient });

		expect(result).toEqual({ sent: 0, pruned: 0 });
		expect(sendCalled).toBe(false);
	});

	it('short-circuits on an empty recipient list without querying PushToken at all', async () => {
		let findCalled = false;
		PushToken.find = () => {
			findCalled = true;
			return { select: async () => [] };
		};

		const result = await sendPushForRecipients([], { title: 't', body: 'b' });

		expect(result).toEqual({ sent: 0, pruned: 0 });
		expect(findCalled).toBe(false);
	});

	it('filters out a token that no longer matches Expo\'s push-token format before ever building a message', async () => {
		stubTokens(['not-a-real-token']);
		let sendCalled = false;
		const expoClient = {
			chunkPushNotifications: (m) => [m],
			sendPushNotificationsAsync: async () => {
				sendCalled = true;
				return [];
			},
		};

		const result = await sendPushForRecipients(['user-1'], { title: 't', body: 'b' }, { expoClient });

		expect(result).toEqual({ sent: 0, pruned: 0 });
		expect(sendCalled).toBe(false);
	});

	it('never throws when the lookup itself fails', async () => {
		PushToken.find = () => {
			throw new Error('connection reset');
		};

		await expect(
			sendPushForRecipients(['user-1'], { title: 't', body: 'b' }),
		).resolves.toEqual({ sent: 0, pruned: 0 });
	});
});
