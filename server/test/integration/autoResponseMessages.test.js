// The MESSAGE_RECEIVED Auto-Response trigger - an away-reply fired from createMessage
// (mutations/messages.js) whenever a client sends an incoming message, per HANDOFF.md's
// 2026-08-19 entry: once per message (not throttled per conversation/day, matching a real email
// out-of-office responder), posted into the conversation thread AND sent as a standalone
// email/SMS per the response's own toggles. Kept in its own file rather than folded into
// autoResponses.test.js - it needs Conversation/Message fixtures none of that file's other
// describe blocks do, and this trigger's routing rule (exactly one artist member, sender must be
// a client) is a distinct thing worth being able to find on its own.
//
// describe/it/expect come from Vitest's `globals: true` config.
const {
	createArtistUser,
	createClientUser,
	createShopAdminUser,
} = require('../helpers/factories');
const AutoResponse = require('../../models/AutoResponse');
const AutoResponseLog = require('../../models/AutoResponseLog');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const { sendAutoResponseForIncomingMessage } = require('../../utils/auto-responses');

// Same stand-in pattern as autoResponses.test.js's own recorder().
function recorder() {
	const sent = [];
	const send = async (message) => {
		sent.push(message);
		return { id: `msg-${sent.length}` };
	};
	return { sent, send };
}

async function conversationBetween(memberIds) {
	const now = new Date();
	return new Conversation({
		members: memberIds.map(String),
		createdAt: now,
		updatedAt: now,
	}).save();
}

async function clientMessage({ conversationId, senderId, text = 'Hey, are you around this week?' }) {
	const now = new Date();
	return new Message({
		conversationId,
		senderId,
		message: text,
		createdAt: now,
		updatedAt: now,
	}).save();
}

describe('sendAutoResponseForIncomingMessage (trigger: MESSAGE_RECEIVED)', () => {
	it('posts a reply into the thread and sends the standalone email, for a clean client/artist thread', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Out of studio',
			trigger: 'MESSAGE_RECEIVED',
			enabled: true,
			emailEnabled: true,
		}).save();
		const msg = await clientMessage({ conversationId: conversation._id, senderId: clientUser._id });

		const { sent, send } = recorder();
		const result = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: msg._id },
			{ sendEmailFn: send },
		);

		// One for the thread post, one for the email - see this trigger's own header comment in
		// utils/auto-responses.js on why both fire off a single toggle rather than the email/sms
		// flags also gating the thread post.
		expect(result.sent).toBe(2);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe(clientUser.email);

		const replies = await Message.find({ conversationId: conversation._id, senderId: artist._id });
		expect(replies).toHaveLength(1);
		expect(replies[0].message.length).toBeGreaterThan(0);

		const logs = await AutoResponseLog.find({ messageId: msg._id });
		expect(logs.map((l) => l.channel).sort()).toEqual(['email', 'thread']);
		expect(logs.every((l) => l.status === 'sent')).toBe(true);
	});

	it('replies to every message in a back-and-forth, not once per conversation - messageId is the dedup key, not conversationId', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Out of studio',
			trigger: 'MESSAGE_RECEIVED',
			enabled: true,
			emailEnabled: true,
		}).save();

		const first = await clientMessage({ conversationId: conversation._id, senderId: clientUser._id, text: 'Hi!' });
		const firstResult = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: first._id },
			{ sendEmailFn: recorder().send },
		);
		const second = await clientMessage({
			conversationId: conversation._id,
			senderId: clientUser._id,
			text: 'Following up on this?',
		});
		const secondResult = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: second._id },
			{ sendEmailFn: recorder().send },
		);

		expect(firstResult.sent).toBe(2);
		expect(secondResult.sent).toBe(2);
		// The two client messages plus the two auto-replies - four total, not three.
		expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(4);
	});

	it('never double-replies to the same message - a retried call is a no-op the second time', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Out of studio',
			trigger: 'MESSAGE_RECEIVED',
			enabled: true,
			emailEnabled: true,
		}).save();
		const msg = await clientMessage({ conversationId: conversation._id, senderId: clientUser._id });

		await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: msg._id },
			{ sendEmailFn: recorder().send },
		);
		const secondResult = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: msg._id },
			{ sendEmailFn: recorder().send },
		);

		expect(secondResult.sent).toBe(0);
		expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(2); // client's + the one reply
		expect(await AutoResponseLog.countDocuments({ messageId: msg._id })).toBe(2); // thread + email, each once
	});

	it('does not fire when the sender is not a client - an artist replying must never trigger an away-reply', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Out of studio',
			trigger: 'MESSAGE_RECEIVED',
			enabled: true,
		}).save();
		const reply = await clientMessage({
			conversationId: conversation._id,
			senderId: artist._id,
			text: "I'm actually here today!",
		});

		const result = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: artist._id, messageId: reply._id },
			{ sendEmailFn: recorder().send },
		);

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(1);
	});

	it('does not fire on a thread with no resolvable artist member (a staff-only or client-only thread)', async () => {
		const { user: shopAdmin } = await createShopAdminUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([shopAdmin._id, clientUser._id]);
		const msg = await clientMessage({ conversationId: conversation._id, senderId: clientUser._id });

		const result = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: msg._id },
			{ sendEmailFn: recorder().send },
		);

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(1);
	});

	it('does nothing when the artist has no enabled MESSAGE_RECEIVED response - the flag really has to be on', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		// A MANUAL response exists, and a disabled MESSAGE_RECEIVED one - neither should fire.
		await new AutoResponse({ artistUserId: artist._id, name: 'Out of studio', trigger: 'MANUAL' }).save();
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Away (turned off)',
			trigger: 'MESSAGE_RECEIVED',
			enabled: false,
		}).save();
		const msg = await clientMessage({ conversationId: conversation._id, senderId: clientUser._id });

		const result = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: msg._id },
			{ sendEmailFn: recorder().send },
		);

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(1);
	});

	it('does not fire on a thread with no resolvable artist member (more than one - a group thread)', async () => {
		// The other half of this trigger's own header comment: zero artist members (tested above,
		// a staff-only thread) OR more than one is left alone rather than guessing who should
		// answer - a group thread with two connected artists is the realistic way "more than one"
		// happens.
		const { user: artistOne } = await createArtistUser();
		const { user: artistTwo } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artistOne._id, artistTwo._id, clientUser._id]);
		await new AutoResponse({ artistUserId: artistOne._id, name: 'Away', trigger: 'MESSAGE_RECEIVED', enabled: true }).save();
		const msg = await clientMessage({ conversationId: conversation._id, senderId: clientUser._id });

		const result = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: msg._id },
			{ sendEmailFn: recorder().send },
		);

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(1);
	});

	it('does nothing, without throwing, when the conversation cannot be found', async () => {
		const { user: clientUser } = await createClientUser();

		const result = await sendAutoResponseForIncomingMessage(
			{ conversationId: '507f1f77bcf86cd799439011', senderId: clientUser._id, messageId: '507f1f77bcf86cd799439012' },
			{ sendEmailFn: recorder().send },
		);

		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
	});

	it('sends over SMS too, when smsEnabled and email is not', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser, client } = await createClientUser();
		client.phone = '+15095550100';
		await client.save();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Out of studio (text)',
			trigger: 'MESSAGE_RECEIVED',
			enabled: true,
			emailEnabled: false,
			smsEnabled: true,
		}).save();
		const msg = await clientMessage({ conversationId: conversation._id, senderId: clientUser._id });

		const texted = [];
		const result = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: msg._id },
			{ sendSmsFn: async (m) => { texted.push(m); return { id: 'sms-1' }; } },
		);

		// Thread post plus the standalone text - same "both fire off one toggle" shape as the email
		// case in this describe's first test.
		expect(result.sent).toBe(2);
		expect(texted).toHaveLength(1);
		expect(texted[0].to).toBe('+15095550100');
		const logs = await AutoResponseLog.find({ messageId: msg._id });
		expect(logs.map((l) => l.channel).sort()).toEqual(['sms', 'thread']);
	});

	// client.phone defaults to '' (unset) - the realistic way this branch is reached, since
	// Client.email is `required: true` and can't be blanked out the same way.
	it('reports the standalone channel as skipped, not sent, when smsEnabled but the client has no phone', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Out of studio (text)',
			trigger: 'MESSAGE_RECEIVED',
			enabled: true,
			emailEnabled: false,
			smsEnabled: true,
		}).save();
		const msg = await clientMessage({ conversationId: conversation._id, senderId: clientUser._id });

		const result = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: msg._id },
		);

		// The thread post still lands (it isn't gated by emailEnabled/smsEnabled) - only the
		// standalone sms channel is skipped for lack of a phone number.
		expect(result).toEqual({ sent: 1, skipped: 1, failed: 0 });
		const logs = await AutoResponseLog.find({ messageId: msg._id });
		expect(logs.find((l) => l.channel === 'sms').status).toBe('skipped');
		expect(logs.find((l) => l.channel === 'thread').status).toBe('sent');
	});

	it('reports failed and logs the error, without throwing, when the send provider itself throws', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Out of studio',
			trigger: 'MESSAGE_RECEIVED',
			enabled: true,
			emailEnabled: true,
		}).save();
		const msg = await clientMessage({ conversationId: conversation._id, senderId: clientUser._id });

		const result = await sendAutoResponseForIncomingMessage(
			{ conversationId: conversation._id, senderId: clientUser._id, messageId: msg._id },
			{ sendEmailFn: async () => { throw new Error('provider timed out'); } },
		);

		expect(result).toEqual({ sent: 1, skipped: 0, failed: 1 });
		const logs = await AutoResponseLog.find({ messageId: msg._id });
		expect(logs.find((l) => l.channel === 'email').status).toBe('failed');
		expect(logs.find((l) => l.channel === 'email').error).toBe('provider timed out');
	});
});
