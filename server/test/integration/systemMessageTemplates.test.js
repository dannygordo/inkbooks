// Feature 2 ("manageable system-generated text") - zero coverage before this file (confirmed by
// grep: nothing under test/ referenced SystemMessageTemplate or resolveSystemMessageTemplate).
// This is the direct extension of AutoResponse's own precedence pattern (see
// test/integration/autoResponses.test.js) applied to a second kind of owner-editable override, so
// this file follows that one's shape: call the precedence/render logic directly where the feature
// IS the logic (utils/system-message-templates.js, utils/message-templates.js), and go through the
// real GraphQL layer only for what's specifically about authorization (resolvers/
// systemMessageTemplates.js), matching test/integration/responseTimeSettings.test.js's own split
// between "the clamp math" and "the mutation's write-time guard."
//
// UNLIKE AutoResponse/ResponseTimeSettings, there is no lazy-create-with-defaults-on-read here and
// no per-field null-means-default convention - a row's mere EXISTENCE for (owner, key) means
// "overridden," and resetSystemMessageTemplate deletes the row outright rather than nulling its
// fields (see models/SystemMessageTemplate.js's own header comment). Several assertions below lean
// on that directly (e.g. asserting `resolved` is exactly `null`, not a row with null fields).
//
// describe/it/expect come from Vitest's `globals: true` config.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	connectArtistToShop,
} = require('../helpers/factories');
const SystemMessageTemplate = require('../../models/SystemMessageTemplate');
const {
	DEFAULT_TEMPLATES,
	resolveSystemMessageTemplate,
	renderSystemMessage,
} = require('../../utils/system-message-templates');
const { renderTemplate } = require('../../utils/message-templates');
const { sendAccountInviteEmail, sendPasswordResetEmail } = require('../../utils/email');
const { validate, updateSystemMessageTemplateInputSchema } = require('../../utils/validation');

const UPDATE_SYSTEM_MESSAGE_TEMPLATE = `
	mutation UpdateSystemMessageTemplate($input: UpdateSystemMessageTemplateInput!) {
		updateSystemMessageTemplate(input: $input) {
			id
			shopId
			artistUserId
			key
			emailSubjectTemplate
			emailBodyTemplate
			extraNoteTemplate
		}
	}
`;

const RESET_SYSTEM_MESSAGE_TEMPLATE = `
	mutation ResetSystemMessageTemplate($shopId: ID, $key: String!) {
		resetSystemMessageTemplate(shopId: $shopId, key: $key)
	}
`;

describe('resolveSystemMessageTemplate: precedence (artist wins, else shop, else the built-in default)', () => {
	it('walks all three tiers for one key: the artist row wins outright, then the shop row, then the built-in default', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		const key = 'NEW_MESSAGE_TO_ARTIST';

		// All three tiers exist at once: an artist override, a shop override, AND (implicitly) the
		// built-in default in utils/system-message-templates.js's DEFAULT_TEMPLATES.
		const shopRow = await new SystemMessageTemplate({
			shopId: shop._id,
			key,
			emailSubjectTemplate: 'Shop override subject',
			emailBodyTemplate: 'Shop override body',
		}).save();
		const artistRow = await new SystemMessageTemplate({
			artistUserId: artist._id,
			key,
			emailSubjectTemplate: 'Artist override subject',
			emailBodyTemplate: 'Artist override body',
		}).save();

		// Tier 1: the artist's own row wins outright, even with a shop row present for the same key.
		let resolved = await resolveSystemMessageTemplate({ artistUserId: artist._id, shopId: shop._id, key });
		expect(String(resolved._id)).toBe(String(artistRow._id));
		expect(resolved.emailSubjectTemplate).toBe('Artist override subject');

		// Tier 2: with the artist's row gone, the shop's applies.
		await SystemMessageTemplate.deleteOne({ _id: artistRow._id });
		resolved = await resolveSystemMessageTemplate({ artistUserId: artist._id, shopId: shop._id, key });
		expect(String(resolved._id)).toBe(String(shopRow._id));
		expect(resolved.emailSubjectTemplate).toBe('Shop override subject');

		// Tier 3: with the shop's row gone too, there is no override left at all - resolution returns
		// null (per the function's own doc comment: "the caller already has the defaults"), and
		// rendering against that null falls through to DEFAULT_TEMPLATES.
		await SystemMessageTemplate.deleteOne({ _id: shopRow._id });
		resolved = await resolveSystemMessageTemplate({ artistUserId: artist._id, shopId: shop._id, key });
		expect(resolved).toBeNull();

		const { subject, body } = renderSystemMessage(key, resolved, {
			artistFirstName: 'A',
			clientName: 'B',
			link: 'https://example.test/x',
		});
		expect(subject).toBe('New message from B');
		expect(body).toBe('Hi A,\n\nB sent you a new message. Read it and reply here:\n\nhttps://example.test/x');
	});

	it('an independent artist (no shop at all) still resolves their own override over the built-in default', async () => {
		const { user: artist } = await createArtistUser();
		const key = 'SHOP_CUT_CONFIRMED';
		const mine = await new SystemMessageTemplate({
			artistUserId: artist._id,
			key,
			emailSubjectTemplate: 'My own subject',
		}).save();

		const resolved = await resolveSystemMessageTemplate({ artistUserId: artist._id, shopId: null, key });
		expect(String(resolved._id)).toBe(String(mine._id));
	});
});

describe('DEFAULT_TEMPLATES: every one of the 7 manageable keys has a real built-in default', () => {
	it('DEFAULT_TEMPLATES and the model\'s own KEYS list agree, and there are exactly 7', () => {
		expect(SystemMessageTemplate.KEYS).toHaveLength(7);
		expect(Object.keys(DEFAULT_TEMPLATES).sort()).toEqual([...SystemMessageTemplate.KEYS].sort());
	});

	it('resolving any of the 7 keys with no override anywhere returns null - nothing is lazily created', async () => {
		const { user: artist } = await createArtistUser();
		for (const key of SystemMessageTemplate.KEYS) {
			// eslint-disable-next-line no-await-in-loop
			const resolved = await resolveSystemMessageTemplate({ artistUserId: artist._id, shopId: null, key });
			expect(resolved).toBeNull();
		}
	});

	it('the six "generic" keys each render a real, non-empty, fully-substituted subject and body with no override present', () => {
		const genericKeys = SystemMessageTemplate.KEYS.filter((key) => key !== 'BOOKING_CONFIRMATION');
		// A generous vars set covering every merge field any of the six default templates uses, so a
		// leftover, unsubstituted {{field}} in either the subject or the body would show up here.
		const vars = {
			firstName: 'Ash',
			artistName: 'Riley Tattoo',
			clientName: 'Casey',
			artistFirstName: 'Riley',
			shopName: 'Ink & Iron',
			formattedAmount: '$95.00',
			link: 'https://inkbooks.example/x',
		};
		for (const key of genericKeys) {
			const { subject, body } = renderSystemMessage(key, null, vars);
			expect(typeof subject).toBe('string');
			expect(subject.trim().length).toBeGreaterThan(0);
			expect(typeof body).toBe('string');
			expect(body.trim().length).toBeGreaterThan(0);
			expect(subject).not.toMatch(/{{/);
			expect(body).not.toMatch(/{{/);
		}
	});

	it('BOOKING_CONFIRMATION is narrower by design (see utils/client-booking-emails.js): no default subject override, and an empty extra note is the intended default, not an unfinished placeholder', () => {
		const defaults = DEFAULT_TEMPLATES.BOOKING_CONFIRMATION;
		expect(defaults.emailSubject).toBeNull();
		expect(defaults.extraNote).toBe('');
		expect(defaults.emailBody).toBeUndefined();
	});
});

describe('renderTemplate: {{mergeField}} substitution', () => {
	it('substitutes every merge field the caller provides', () => {
		const rendered = renderTemplate('Hi {{firstName}}, {{artistName}} sent you a note: {{link}}', {
			firstName: 'Jamie',
			artistName: 'Sam',
			link: 'https://inkbooks.example/x',
		});
		expect(rendered).toBe('Hi Jamie, Sam sent you a note: https://inkbooks.example/x');
	});

	it('leaves a merge field the caller did NOT provide as the literal, unsubstituted placeholder', () => {
		// Matches the real implementation exactly: `hasOwnProperty.call(vars, key) ? ... : match` -
		// a missing key returns the original {{...}} match, it does not render as an empty string.
		const rendered = renderTemplate('Hi {{firstName}}, your code is {{code}}', { firstName: 'Jamie' });
		expect(rendered).toBe('Hi Jamie, your code is {{code}}');
	});

	it('renderSystemMessage substitutes an override template with the real send-time vars for that key', () => {
		const custom = {
			emailSubjectTemplate: 'Yo {{artistFirstName}}, new one from {{clientName}}',
			emailBodyTemplate: 'Body for {{artistFirstName}} re {{clientName}}',
		};
		const { subject, body } = renderSystemMessage('NEW_BOOKING_REQUEST_TO_ARTIST', custom, {
			artistFirstName: 'Sam',
			clientName: 'Jamie',
		});
		expect(subject).toBe('Yo Sam, new one from Jamie');
		expect(body).toBe('Body for Sam re Jamie');
	});
});

describe('updateSystemMessageTemplate: authorization floor (same as createAutoResponse)', () => {
	it('a shop admin can set a shop-owned override', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_SYSTEM_MESSAGE_TEMPLATE,
				variables: {
					input: {
						shopId: shop.id,
						key: 'SHOP_CUT_MARKED_PAID',
						emailSubjectTemplate: 'Custom shop subject',
					},
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateSystemMessageTemplate.shopId).toBe(shop.id);
		expect(data.updateSystemMessageTemplate.artistUserId).toBeNull();
		expect(data.updateSystemMessageTemplate.emailSubjectTemplate).toBe('Custom shop subject');

		const stored = await SystemMessageTemplate.findOne({ shopId: shop._id, key: 'SHOP_CUT_MARKED_PAID' });
		expect(stored).not.toBeNull();
		expect(String(stored.setByUserId)).toBe(String(shopAdmin._id));
	});

	it('an independent artist can set an artist-owned override (shopId omitted)', async () => {
		const { user: artist } = await createArtistUser();
		const token = signTestToken(artist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_SYSTEM_MESSAGE_TEMPLATE,
				variables: {
					input: { key: 'NEW_MESSAGE_TO_ARTIST', emailSubjectTemplate: 'My own subject' },
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateSystemMessageTemplate.artistUserId).toBe(artist.id);
		expect(data.updateSystemMessageTemplate.shopId).toBeNull();

		const stored = await SystemMessageTemplate.findOne({ artistUserId: artist._id, key: 'NEW_MESSAGE_TO_ARTIST' });
		expect(stored.emailSubjectTemplate).toBe('My own subject');
	});

	it('plain shop staff (below the shop-admin floor) cannot set the shop\'s override', async () => {
		const { shop } = await createShopAdminUser();
		const { user: staff } = await createStaffUser(shop._id);
		const token = signTestToken(staff);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_SYSTEM_MESSAGE_TEMPLATE,
				variables: {
					input: { shopId: shop.id, key: 'SHOP_CUT_MARKED_PAID', emailSubjectTemplate: 'Nope' },
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		// updateSystemMessageTemplate(...): SystemMessageTemplate! is non-null in the schema, so a
		// thrown resolver error nulls the top-level data - same rule noted in
		// responseTimeSettings.test.js and shopCutLedger.test.js.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.code).toBe('UNAUTHENTICATED');
		expect(await SystemMessageTemplate.countDocuments({ shopId: shop._id })).toBe(0);
	});

	it('a shop admin at a DIFFERENT shop cannot set this shop\'s override', async () => {
		const { shop } = await createShopAdminUser();
		const { user: otherAdmin } = await createShopAdminUser();
		const token = signTestToken(otherAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_SYSTEM_MESSAGE_TEMPLATE,
				variables: {
					input: { shopId: shop.id, key: 'SHOP_CUT_MARKED_PAID', emailSubjectTemplate: 'Nope' },
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.code).toBe('UNAUTHENTICATED');
		expect(await SystemMessageTemplate.countDocuments({ shopId: shop._id })).toBe(0);
	});
});

describe('resetSystemMessageTemplate: deletes the override row outright, and resolution falls back correctly', () => {
	it('an artist reset falls back to the shop\'s override', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		const key = 'BOOKING_REQUEST_RECEIVED';
		await new SystemMessageTemplate({ shopId: shop._id, key, emailSubjectTemplate: 'Shop subject' }).save();
		await new SystemMessageTemplate({ artistUserId: artist._id, key, emailSubjectTemplate: 'Artist subject' }).save();

		const token = signTestToken(artist);
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: RESET_SYSTEM_MESSAGE_TEMPLATE, variables: { key } },
			{ contextValue: contextWithToken(token) },
		);

		expect(response.body.singleResult.errors).toBeUndefined();
		expect(response.body.singleResult.data.resetSystemMessageTemplate).toBe(true);
		// The row is gone entirely - not left behind with nulled fields.
		expect(await SystemMessageTemplate.findOne({ artistUserId: artist._id, key })).toBeNull();

		const resolved = await resolveSystemMessageTemplate({ artistUserId: artist._id, shopId: shop._id, key });
		expect(resolved.emailSubjectTemplate).toBe('Shop subject');
	});

	it('a shop reset with no artist row falls all the way back to the built-in default', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const key = 'SHOP_CUT_CONFIRMED';
		await new SystemMessageTemplate({ shopId: shop._id, key, emailSubjectTemplate: 'Shop subject' }).save();

		const token = signTestToken(shopAdmin);
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: RESET_SYSTEM_MESSAGE_TEMPLATE, variables: { shopId: shop.id, key } },
			{ contextValue: contextWithToken(token) },
		);

		expect(response.body.singleResult.errors).toBeUndefined();
		expect(response.body.singleResult.data.resetSystemMessageTemplate).toBe(true);
		expect(await SystemMessageTemplate.findOne({ shopId: shop._id, key })).toBeNull();

		const resolved = await resolveSystemMessageTemplate({ artistUserId: null, shopId: shop._id, key });
		expect(resolved).toBeNull();
	});

	it('returns false, without throwing, when there is no override to reset', async () => {
		const { user: artist } = await createArtistUser();
		const token = signTestToken(artist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: RESET_SYSTEM_MESSAGE_TEMPLATE, variables: { key: 'NEW_MESSAGE_TO_GUEST' } },
			{ contextValue: contextWithToken(token) },
		);

		expect(response.body.singleResult.errors).toBeUndefined();
		expect(response.body.singleResult.data.resetSystemMessageTemplate).toBe(false);
	});
});

describe('sendAccountInviteEmail / sendPasswordResetEmail: deliberately excluded (identity/security mail)', () => {
	it('the 7 manageable keys do not include account-invite or password-reset in any spelling', () => {
		const keys = SystemMessageTemplate.KEYS;
		expect(keys).toHaveLength(7);
		expect(keys).not.toContain('sendAccountInviteEmail');
		expect(keys).not.toContain('sendPasswordResetEmail');
		expect(keys).not.toContain('ACCOUNT_INVITE');
		expect(keys).not.toContain('PASSWORD_RESET');
		expect(Object.keys(DEFAULT_TEMPLATES)).not.toContain('ACCOUNT_INVITE');
		expect(Object.keys(DEFAULT_TEMPLATES)).not.toContain('PASSWORD_RESET');
	});

	it('updateSystemMessageTemplateInputSchema rejects a key outside the 7 manageable ones', () => {
		const { valid, errors } = validate(updateSystemMessageTemplateInputSchema, {
			key: 'PASSWORD_RESET',
			emailSubjectTemplate: 'Nope',
		});
		expect(valid).toBe(false);
		expect(errors.key).toBeTruthy();
	});

	it('the GraphQL mutation itself rejects an attempt to override account-invite/password-reset wording', async () => {
		const { user: artist } = await createArtistUser();
		const token = signTestToken(artist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_SYSTEM_MESSAGE_TEMPLATE,
				variables: { input: { key: 'ACCOUNT_INVITE', emailSubjectTemplate: 'Nope' } },
			},
			{ contextValue: contextWithToken(token) },
		);

		expect(response.body.singleResult.data).toBeNull();
		expect(response.body.singleResult.errors[0].extensions.code).toBe('BAD_USER_INPUT');
	});

	it('sendAccountInviteEmail and sendPasswordResetEmail never consult resolveSystemMessageTemplate - their wording stays hardcoded, unreachable from this system', () => {
		expect(sendAccountInviteEmail.toString()).not.toMatch(/resolveSystemMessageTemplate/);
		expect(sendPasswordResetEmail.toString()).not.toMatch(/resolveSystemMessageTemplate/);
	});
});

describe('a real call site (utils/email.js) actually uses the override, not the hardcoded default', () => {
	// sendNewBookingRequestNotificationToArtist has no injectable sendEmailFn (unlike
	// utils/auto-responses.js's send functions), and actually calling it would go through the real
	// sendEmail()/Resend client, which isn't configured in this test environment. So this tests the
	// exact same two calls that function makes internally - resolveSystemMessageTemplate followed by
	// renderSystemMessage, with the same key and the same vars - rather than the full send.
	it('NEW_BOOKING_REQUEST_TO_ARTIST: with an override set, the resolve+render path used by the real send site produces the override\'s wording', async () => {
		const { user: artist } = await createArtistUser();
		const key = 'NEW_BOOKING_REQUEST_TO_ARTIST';
		await new SystemMessageTemplate({
			artistUserId: artist._id,
			key,
			emailSubjectTemplate: 'Yo {{artistFirstName}}! {{clientName}} wants ink',
			emailBodyTemplate: 'Custom body for {{artistFirstName}} about {{clientName}}',
		}).save();

		const custom = await resolveSystemMessageTemplate({ artistUserId: artist._id, shopId: null, key });
		const { subject, body } = renderSystemMessage(key, custom, {
			artistFirstName: 'Sam',
			clientName: 'Jamie',
		});

		expect(subject).toBe('Yo Sam! Jamie wants ink');
		expect(body).toBe('Custom body for Sam about Jamie');
		// And explicitly NOT the built-in default wording, to rule out the override being silently
		// ignored while some other coincidental text happened to match.
		expect(subject).not.toBe('New booking request from Jamie');
	});

	it('NEW_BOOKING_REQUEST_TO_ARTIST: with no override at all, the same path renders the built-in default', async () => {
		const { user: artist } = await createArtistUser();
		const key = 'NEW_BOOKING_REQUEST_TO_ARTIST';

		const custom = await resolveSystemMessageTemplate({ artistUserId: artist._id, shopId: null, key });
		const { subject, body } = renderSystemMessage(key, custom, {
			artistFirstName: 'Sam',
			clientName: 'Jamie',
		});

		expect(custom).toBeNull();
		expect(subject).toBe('New booking request from Jamie');
		expect(body).toBe(
			'Hi Sam,\n\nYou have a new booking request from Jamie. Log in to InkBooks to view it and respond.',
		);
	});
});
