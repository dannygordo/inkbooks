// Auto-Responses: the precedence rule (decision #4 in the plan this shipped from), the
// claim-before-send dedup on the automatic path, and the manual send path. Authorization/GraphQL
// shape is already the same tested pattern as resolvers/expenses.js's own suite (see
// test/integration/crud.test.js and test/integration/resourceScoping.test.js) - what's specific to
// this feature is the precedence and send logic, so that's what this file tests, calling
// utils/auto-responses.js directly rather than through the GraphQL layer (same approach as
// test/integration/clientBookingEmails.test.js).
//
// describe/it/expect come from Vitest's `globals: true` config.
//
// Run for real on 2026-08-18: surfaced a genuine bug (all 11 tests in this file failed with
// `TypeError: next is not a function` from models/AutoResponse.js's forceManualDisabled pre-
// validate hook, which was written in the callback style but never actually received a callback
// in this Mongoose version). Fixed in the model by dropping the `next` param entirely; re-run
// after pulling that fix. See HANDOFF.md's Auto-Responses entry for the full account.
const {
	createArtistUser,
	createClientUser,
	createShopAdminUser,
	connectArtistToShop,
	createProject,
	createAppointment,
} = require('../helpers/factories');
const AutoResponse = require('../../models/AutoResponse');
const AutoResponseLog = require('../../models/AutoResponseLog');
const {
	resolveAutoResponseForTrigger,
	sendAutoResponsesForTrigger,
	sendManualAutoResponse,
} = require('../../utils/auto-responses');

/** Same stand-in pattern as clientBookingEmails.test.js's recorder() - sendEmail()/sendSms() both
 * signal failure by returning null rather than throwing, so this returns a truthy stand-in. */
function recorder() {
	const sent = [];
	const send = async (message) => {
		sent.push(message);
		return { id: `msg-${sent.length}` };
	};
	return { sent, send };
}

async function shopWithConnectedArtist() {
	const { user: shopAdmin, shop } = await createShopAdminUser();
	const { user: artist } = await createArtistUser({ artist: { shopId: shop._id } });
	const { user: clientUser, client } = await createClientUser();
	const project = await createProject(artist._id, client._id);
	return { shopAdmin, shop, artist, clientUser, client, project };
}

describe('resolveAutoResponseForTrigger (decision #4 - the precedence rule)', () => {
	it("prefers the artist's own enabled response over the shop's", async () => {
		const { shop, artist } = await shopWithConnectedArtist();
		await new AutoResponse({
			shopId: shop._id,
			name: 'Shop aftercare',
			trigger: 'SESSION_COMPLETED',
			enabled: true,
		}).save();
		const mine = await new AutoResponse({
			artistUserId: artist._id,
			name: "Artist's own aftercare",
			trigger: 'SESSION_COMPLETED',
			enabled: true,
		}).save();

		const resolved = await resolveAutoResponseForTrigger({
			artistUserId: artist._id,
			shopId: shop._id,
			trigger: 'SESSION_COMPLETED',
		});

		expect(resolved.ownerType).toBe('ARTIST');
		expect(String(resolved.autoResponse._id)).toBe(String(mine._id));
	});

	it("falls back to the shop's response when the artist has none enabled for this trigger", async () => {
		const { shop, artist } = await shopWithConnectedArtist();
		const shopResponse = await new AutoResponse({
			shopId: shop._id,
			name: 'Shop aftercare',
			trigger: 'SESSION_COMPLETED',
			enabled: true,
		}).save();
		// An artist row exists, but disabled - must not be picked over the shop's enabled one.
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Disabled personal aftercare',
			trigger: 'SESSION_COMPLETED',
			enabled: false,
		}).save();

		const resolved = await resolveAutoResponseForTrigger({
			artistUserId: artist._id,
			shopId: shop._id,
			trigger: 'SESSION_COMPLETED',
		});

		expect(resolved.ownerType).toBe('SHOP');
		expect(String(resolved.autoResponse._id)).toBe(String(shopResponse._id));
	});

	it('returns null when neither owner has an enabled response for this trigger', async () => {
		const { shop, artist } = await shopWithConnectedArtist();
		const resolved = await resolveAutoResponseForTrigger({
			artistUserId: artist._id,
			shopId: shop._id,
			trigger: 'SESSION_COMPLETED',
		});
		expect(resolved).toBeNull();
	});

	it('an independent artist with no shop still resolves their own response', async () => {
		const { user: artist } = await createArtistUser();
		const mine = await new AutoResponse({
			artistUserId: artist._id,
			name: 'My aftercare',
			trigger: 'SESSION_COMPLETED',
			enabled: true,
		}).save();

		const resolved = await resolveAutoResponseForTrigger({
			artistUserId: artist._id,
			shopId: null,
			trigger: 'SESSION_COMPLETED',
		});
		expect(String(resolved.autoResponse._id)).toBe(String(mine._id));
	});
});

describe('AutoResponse model (decisions #5 and #6)', () => {
	it('forces enabled back to false for a MANUAL trigger, even if the caller sent true', async () => {
		// See models/AutoResponse.js's own header comment: this is what lets the uniqueness index
		// below rely on a plain `enabled: true` filter without needing $ne (unsupported in a
		// partial filter expression).
		const { user: artist } = await createArtistUser();
		const manual = await new AutoResponse({
			artistUserId: artist._id,
			name: 'Out of studio',
			trigger: 'MANUAL',
			enabled: true,
		}).save();
		expect(manual.enabled).toBe(false);
	});

	it('rejects a second ENABLED response for the same owner and trigger', async () => {
		const { user: artist } = await createArtistUser();
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'First',
			trigger: 'SESSION_COMPLETED',
			enabled: true,
		}).save();

		await expect(
			new AutoResponse({
				artistUserId: artist._id,
				name: 'Second',
				trigger: 'SESSION_COMPLETED',
				enabled: true,
			}).save(),
		).rejects.toMatchObject({ code: 11000 });
	});

	it('allows any number of MANUAL rows for the same owner - no limit like the enabled one', async () => {
		const { user: artist } = await createArtistUser();
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Out of studio',
			trigger: 'MANUAL',
		}).save();
		await expect(
			new AutoResponse({
				artistUserId: artist._id,
				name: 'Another manual template',
				trigger: 'MANUAL',
			}).save(),
		).resolves.toBeTruthy();
	});
});

describe('sendAutoResponsesForTrigger (the automatic path)', () => {
	it('sends through the resolved response and logs it as sent', async () => {
		const { artist, clientUser, client, project } = await shopWithConnectedArtist();
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Aftercare',
			trigger: 'SESSION_COMPLETED',
			enabled: true,
			emailEnabled: true,
			smsEnabled: false,
		}).save();
		const appointment = await createAppointment(artist._id, {
			projectId: project._id,
			appointmentType: 'session',
			appointmentStatus: 'completed',
		});

		const { sent, send } = recorder();
		const result = await sendAutoResponsesForTrigger(
			{ trigger: 'SESSION_COMPLETED', appointment },
			{ sendEmailFn: send },
		);

		expect(result.sent).toBe(1);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe(clientUser.email);
		expect(sent[0].subject).toContain('Aftercare');

		const logs = await AutoResponseLog.find({ appointmentId: appointment._id });
		expect(logs).toHaveLength(1);
		expect(logs[0].status).toBe('sent');
		expect(logs[0].ownerType).toBe('ARTIST');
		void client; // referenced for readability of the fixture set, not asserted on directly
	});

	it('never sends twice for the same appointment - the claim is the dedup', async () => {
		// The scenario the model's own comment calls out: a retried webhook or an overlapping
		// request re-running the same trigger for the same appointment. The SECOND call must not
		// insert a second AutoResponseLog row or send a second message.
		const { artist, project } = await shopWithConnectedArtist();
		await new AutoResponse({
			artistUserId: artist._id,
			name: 'Aftercare',
			trigger: 'SESSION_COMPLETED',
			enabled: true,
		}).save();
		const appointment = await createAppointment(artist._id, {
			projectId: project._id,
			appointmentType: 'session',
			appointmentStatus: 'completed',
		});

		const first = recorder();
		await sendAutoResponsesForTrigger(
			{ trigger: 'SESSION_COMPLETED', appointment },
			{ sendEmailFn: first.send },
		);

		const second = recorder();
		const secondResult = await sendAutoResponsesForTrigger(
			{ trigger: 'SESSION_COMPLETED', appointment },
			{ sendEmailFn: second.send },
		);

		expect(secondResult.sent).toBe(0);
		expect(second.sent).toHaveLength(0);
		expect(await AutoResponseLog.countDocuments({ appointmentId: appointment._id })).toBe(1);
	});

	it('sends nothing, without throwing, when nobody has an enabled response for this trigger', async () => {
		const { artist, project } = await shopWithConnectedArtist();
		const appointment = await createAppointment(artist._id, {
			projectId: project._id,
			appointmentType: 'session',
			appointmentStatus: 'completed',
		});
		const result = await sendAutoResponsesForTrigger({ trigger: 'SESSION_COMPLETED', appointment });
		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(await AutoResponseLog.countDocuments({ appointmentId: appointment._id })).toBe(0);
	});
});

describe('sendManualAutoResponse (the manual "Send a message" path - decisions #7/#8)', () => {
	it('sends a DISABLED response, since enabled only governs automatic firing', async () => {
		const { artist, clientUser, client } = await shopWithConnectedArtist();
		const response = await new AutoResponse({
			artistUserId: artist._id,
			name: 'Aftercare (turned off for auto-fire)',
			trigger: 'SESSION_COMPLETED',
			enabled: false,
			emailEnabled: true,
		}).save();

		const { sent, send } = recorder();
		const result = await sendManualAutoResponse(
			{ autoResponseId: response._id, clientId: client._id, triggeredByUserId: artist._id },
			{ sendEmailFn: send },
		);

		expect(result.ok).toBe(true);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe(clientUser.email);
	});

	it('has no dedup constraint - two manual sends for the same appointment both succeed', async () => {
		const { artist, client, project } = await shopWithConnectedArtist();
		const response = await new AutoResponse({
			artistUserId: artist._id,
			name: 'Out of studio',
			trigger: 'MANUAL',
			emailEnabled: true,
		}).save();
		const appointment = await createAppointment(artist._id, {
			projectId: project._id,
			appointmentType: 'session',
		});

		const first = recorder();
		await sendManualAutoResponse(
			{
				autoResponseId: response._id,
				clientId: client._id,
				appointmentId: appointment._id,
				triggeredByUserId: artist._id,
			},
			{ sendEmailFn: first.send },
		);
		const second = recorder();
		await sendManualAutoResponse(
			{
				autoResponseId: response._id,
				clientId: client._id,
				appointmentId: appointment._id,
				triggeredByUserId: artist._id,
			},
			{ sendEmailFn: second.send },
		);

		expect(first.sent).toHaveLength(1);
		expect(second.sent).toHaveLength(1);
		expect(await AutoResponseLog.countDocuments({ autoResponseId: response._id })).toBe(2);
	});

	it('rejects sending a deactivated response', async () => {
		const { artist, client } = await shopWithConnectedArtist();
		const response = await new AutoResponse({
			artistUserId: artist._id,
			name: 'Retired template',
			trigger: 'MANUAL',
			active: false,
		}).save();

		await expect(
			sendManualAutoResponse({
				autoResponseId: response._id,
				clientId: client._id,
				triggeredByUserId: artist._id,
			}),
		).rejects.toThrow(/no longer exists|deactivated/);
	});
});
