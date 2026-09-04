// utils/shared-images.js - indexes a message's imageUrls into the client-dashboard shared-images
// triage list (SharedImage) as a best-effort side effect of createMessage. Had ZERO test coverage
// anywhere in the suite (no direct requires, and no resolver/mutation-level test of createMessage
// ever asserted on the resulting SharedImage rows either) despite the model's own header comment
// pointing back here as "how these get created."
//
// describe/it/expect/vi come from Vitest's `globals: true` config.
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const SharedImage = require('../../models/SharedImage');
const { recordSharedImagesForMessage } = require('../../utils/shared-images');
const {
	createArtistUser,
	createClientUser,
	createShopAdminUser,
} = require('../helpers/factories');

async function conversationBetween(memberIds) {
	const now = new Date();
	return new Conversation({
		members: memberIds.map(String),
		createdAt: now,
		updatedAt: now,
	}).save();
}

async function messageWithImages({ conversationId, senderId, imageUrls }) {
	const now = new Date();
	return new Message({
		conversationId,
		senderId,
		message: '',
		imageUrls,
		createdAt: now,
		updatedAt: now,
	}).save();
}

describe('recordSharedImagesForMessage', () => {
	it('does nothing when the conversation is missing', async () => {
		const { user: clientUser } = await createClientUser();
		const message = await messageWithImages({
			conversationId: '507f1f77bcf86cd799439011',
			senderId: clientUser._id,
			imageUrls: ['https://example.com/a.png'],
		});

		await recordSharedImagesForMessage({ conversation: null, message });

		expect(await SharedImage.countDocuments({})).toBe(0);
	});

	it('does nothing when the message carries no images', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		const message = await messageWithImages({
			conversationId: conversation._id,
			senderId: clientUser._id,
			imageUrls: [],
		});

		await recordSharedImagesForMessage({ conversation, message });

		expect(await SharedImage.countDocuments({})).toBe(0);
	});

	it('records one SharedImage row per URL for a genuine one-client-one-artist thread', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser, client } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		const message = await messageWithImages({
			conversationId: conversation._id,
			senderId: clientUser._id,
			imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
		});

		await recordSharedImagesForMessage({ conversation, message });

		const rows = await SharedImage.find({ messageId: message._id }).sort({ url: 1 });
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.url)).toEqual(['https://example.com/a.png', 'https://example.com/b.png']);
		for (const row of rows) {
			expect(String(row.conversationId)).toBe(String(conversation._id));
			// clientId is the Client document's own _id, not the User._id - matches
			// Project.clientId's own convention per this file's header comment.
			expect(String(row.clientId)).toBe(String(client._id));
			// artistId is the artist's User._id (Artist.userId), the other half of that convention.
			expect(String(row.artistId)).toBe(String(artist._id));
			expect(String(row.senderId)).toBe(String(clientUser._id));
		}
	});

	it('records images the same way when the artist is the sender, not just the client', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser, client } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		const message = await messageWithImages({
			conversationId: conversation._id,
			senderId: artist._id,
			imageUrls: ['https://example.com/reference.png'],
		});

		await recordSharedImagesForMessage({ conversation, message });

		const row = await SharedImage.findOne({ messageId: message._id });
		expect(row).not.toBeNull();
		expect(String(row.senderId)).toBe(String(artist._id));
		expect(String(row.clientId)).toBe(String(client._id));
		expect(String(row.artistId)).toBe(String(artist._id));
	});

	// Mirrors sendAutoResponseForIncomingMessage's own "artistMembers.length !== 1" guard in
	// utils/auto-responses.js, per this file's header comment - there is no single client/artist
	// pair to attribute the images to in a group thread.
	it('is a no-op for a group thread with more than one artist member', async () => {
		const { user: artistOne } = await createArtistUser();
		const { user: artistTwo } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artistOne._id, artistTwo._id, clientUser._id]);
		const message = await messageWithImages({
			conversationId: conversation._id,
			senderId: clientUser._id,
			imageUrls: ['https://example.com/a.png'],
		});

		await recordSharedImagesForMessage({ conversation, message });

		expect(await SharedImage.countDocuments({})).toBe(0);
	});

	it('is a no-op for a staff-only thread with no client member', async () => {
		const { user: artist } = await createArtistUser();
		const { user: shopAdmin } = await createShopAdminUser();
		const conversation = await conversationBetween([artist._id, shopAdmin._id]);
		const message = await messageWithImages({
			conversationId: conversation._id,
			senderId: artist._id,
			imageUrls: ['https://example.com/a.png'],
		});

		await recordSharedImagesForMessage({ conversation, message });

		expect(await SharedImage.countDocuments({})).toBe(0);
	});

	// The model's own {messageId, url} unique index (see models/SharedImage.js) is what makes this
	// safe to run twice for the same message - insertMany with ordered:false still inserts every
	// non-duplicate document even though the call itself rejects on the dupe, and the catch block
	// swallows that rejection rather than losing the message it was attached to.
	it('is safe to call twice for the same message - the second call inserts nothing new and does not throw', async () => {
		const { user: artist } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artist._id, clientUser._id]);
		const message = await messageWithImages({
			conversationId: conversation._id,
			senderId: clientUser._id,
			imageUrls: ['https://example.com/a.png'],
		});

		await recordSharedImagesForMessage({ conversation, message });
		await expect(
			recordSharedImagesForMessage({ conversation, message }),
		).resolves.toBeUndefined();

		expect(await SharedImage.countDocuments({ messageId: message._id })).toBe(1);
	});
});
