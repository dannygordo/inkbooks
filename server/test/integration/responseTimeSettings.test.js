// Feature 3 (unanswered-message nudges) - the min-clamp precedence rule between a shop's
// ResponseTimeSettings row and an artist's own (utils/response-time.js's clamp()), and the
// updateResponseTimeSettings write-time guard added on 2026-08-21 after a real bug: an artist
// could previously save a threshold ABOVE their shop's ceiling and have it echoed straight back
// on the settings screen, because the clamp only ever applied where the EFFECTIVE value gets
// computed (the nudge sweep, the inbox condition) - never on the write itself. See
// resolvers/responseTimeSettings.js and HANDOFF.md's 2026-08-21 entry for the full root cause.
//
// Two describe blocks, deliberately: the clamp MATH (resolveThresholdsForArtists, called directly
// - no GraphQL, no auth, just "does min(artist, shop) actually work") is its own thing from the
// mutation's AUTHORIZATION-ADJACENT write guard (does the write get rejected, does the DB stay
// unchanged when it should). A bug in either one produces the same user-visible symptom but needs
// a different test to catch it.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	connectArtistToShop,
} = require('../helpers/factories');
const ResponseTimeSettings = require('../../models/ResponseTimeSettings');
const {
	resolveThresholdsForArtists,
	resolveResponseTimeThresholds,
	DEFAULT_INITIAL_THRESHOLD_MINUTES,
	DEFAULT_REPEAT_INTERVAL_MINUTES,
} = require('../../utils/response-time');

const UPDATE_RESPONSE_TIME_SETTINGS = `
	mutation UpdateResponseTimeSettings($input: UpdateResponseTimeSettingsInput!) {
		updateResponseTimeSettings(input: $input) {
			id
			initialThresholdMinutes
			repeatIntervalMinutes
			shopCeiling {
				initialThresholdMinutes
				repeatIntervalMinutes
			}
		}
	}
`;

const GET_RESPONSE_TIME_SETTINGS = `
	query GetResponseTimeSettings($shopId: ID, $artistUserId: ID) {
		getResponseTimeSettings(shopId: $shopId, artistUserId: $artistUserId) {
			id
			initialThresholdMinutes
			repeatIntervalMinutes
			shopCeiling {
				initialThresholdMinutes
				repeatIntervalMinutes
			}
		}
	}
`;

describe('utils/response-time.js: resolveThresholdsForArtists (the clamp itself)', () => {
	it('an unconnected artist with no row of their own gets the plain defaults', async () => {
		const { user: artist } = await createArtistUser();

		const result = await resolveResponseTimeThresholds(artist._id);

		expect(result).toEqual({
			initialThresholdMinutes: DEFAULT_INITIAL_THRESHOLD_MINUTES,
			repeatIntervalMinutes: DEFAULT_REPEAT_INTERVAL_MINUTES,
			ceiling: null,
		});
	});

	it('an artist connected to a shop with no ResponseTimeSettings row of its own is unclamped - their own value (or the default) applies', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await new ResponseTimeSettings({
			artistUserId: artist._id,
			initialThresholdMinutes: 600,
			repeatIntervalMinutes: 240,
		}).save();

		const result = await resolveResponseTimeThresholds(artist._id);

		expect(result.initialThresholdMinutes).toBe(600);
		expect(result.repeatIntervalMinutes).toBe(240);
		expect(result.ceiling).toBeNull();
	});

	it('clamps DOWN to the shop ceiling when the artist row is looser (this is the specific direction that broke)', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await new ResponseTimeSettings({
			shopId: shop._id,
			initialThresholdMinutes: 120,
			repeatIntervalMinutes: 60,
		}).save();
		// Simulates a row that predates the shop connection, or predates the write-time guard - the
		// clamp has to hold regardless of HOW an over-ceiling row ends up stored, not just refuse new
		// writes above it.
		await new ResponseTimeSettings({
			artistUserId: artist._id,
			initialThresholdMinutes: 480,
			repeatIntervalMinutes: 180,
		}).save();

		const result = await resolveResponseTimeThresholds(artist._id);

		expect(result.initialThresholdMinutes).toBe(120);
		expect(result.repeatIntervalMinutes).toBe(60);
		expect(result.ceiling).toEqual({ initialThresholdMinutes: 120, repeatIntervalMinutes: 60 });
	});

	it('does NOT clamp UP - an artist tightening below the shop ceiling keeps their own, stricter value', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await new ResponseTimeSettings({
			shopId: shop._id,
			initialThresholdMinutes: 480,
			repeatIntervalMinutes: 180,
		}).save();
		await new ResponseTimeSettings({
			artistUserId: artist._id,
			initialThresholdMinutes: 60,
			repeatIntervalMinutes: 30,
		}).save();

		const result = await resolveResponseTimeThresholds(artist._id);

		expect(result.initialThresholdMinutes).toBe(60);
		expect(result.repeatIntervalMinutes).toBe(30);
	});

	it('the two thresholds clamp independently - one can be above the ceiling while the other is below it', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await new ResponseTimeSettings({
			shopId: shop._id,
			initialThresholdMinutes: 120,
			repeatIntervalMinutes: 180,
		}).save();
		await new ResponseTimeSettings({
			artistUserId: artist._id,
			initialThresholdMinutes: 480, // above the 120 ceiling - should clamp
			repeatIntervalMinutes: 60, // below the 180 ceiling - should pass through
		}).save();

		const result = await resolveResponseTimeThresholds(artist._id);

		expect(result.initialThresholdMinutes).toBe(120);
		expect(result.repeatIntervalMinutes).toBe(60);
	});

	it('the batch form answers multiple artists (some connected, some not) in one call, matching resolveResponseTimeThresholds per-artist', async () => {
		const { user: capped } = await createArtistUser();
		const { user: uncapped } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(capped._id, shop._id);
		await new ResponseTimeSettings({
			shopId: shop._id,
			initialThresholdMinutes: 90,
			repeatIntervalMinutes: 45,
		}).save();
		await new ResponseTimeSettings({
			artistUserId: capped._id,
			initialThresholdMinutes: 500,
			repeatIntervalMinutes: 200,
		}).save();

		const map = await resolveThresholdsForArtists([capped._id, uncapped._id]);

		expect(map.get(String(capped._id)).initialThresholdMinutes).toBe(90);
		expect(map.get(String(uncapped._id)).initialThresholdMinutes).toBe(
			DEFAULT_INITIAL_THRESHOLD_MINUTES,
		);
	});
});

describe('updateResponseTimeSettings: write-time ceiling enforcement (2026-08-21 fix)', () => {
	it('a shop admin can set the shop\'s own ceiling', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const token = signTestToken(shopAdmin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_RESPONSE_TIME_SETTINGS,
				variables: {
					input: { shopId: shop.id, initialThresholdMinutes: 120, repeatIntervalMinutes: 60 },
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateResponseTimeSettings.initialThresholdMinutes).toBe(120);
		expect(data.updateResponseTimeSettings.repeatIntervalMinutes).toBe(60);
	});

	it('a connected artist CAN save a value at or below the shop ceiling', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await new ResponseTimeSettings({
			shopId: shop._id,
			initialThresholdMinutes: 240,
			repeatIntervalMinutes: 120,
		}).save();
		const token = signTestToken(artist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_RESPONSE_TIME_SETTINGS,
				variables: { input: { initialThresholdMinutes: 240, repeatIntervalMinutes: 120 } },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateResponseTimeSettings.initialThresholdMinutes).toBe(240);
	});

	// The regression test for the actual bug report: "I can log into an artist account and change
	// the thresholds to be greater than the shop minimum." Before the fix, this mutation succeeded
	// and echoed 600 straight back - the write simply wasn't checked against anything.
	it('REGRESSION: a connected artist CANNOT save initialThresholdMinutes above the shop ceiling', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await new ResponseTimeSettings({
			shopId: shop._id,
			initialThresholdMinutes: 240,
			repeatIntervalMinutes: 120,
		}).save();
		const token = signTestToken(artist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_RESPONSE_TIME_SETTINGS,
				variables: { input: { initialThresholdMinutes: 600, repeatIntervalMinutes: 120 } },
			},
			{ contextValue: contextWithToken(token) },
		);

		// updateResponseTimeSettings(...): ResponseTimeSettings! is non-null in the schema, so a
		// thrown resolver error nulls out `data` itself - same rule noted throughout this suite
		// (see shopCutLedger.test.js's own comment on this).
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.initialThresholdMinutes).toMatch(/at most 240 minutes/);

		// The write must have been rejected outright, not silently clamped to 240 - a silent rewrite
		// is exactly as confusing as no enforcement (the artist didn't choose 240 either). No row
		// should exist yet at all, since this artist had never saved one before this call.
		const stored = await ResponseTimeSettings.findOne({ artistUserId: artist._id });
		expect(stored).toBeNull();
	});

	it('REGRESSION: same rejection for repeatIntervalMinutes, independently of initialThresholdMinutes', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await new ResponseTimeSettings({
			shopId: shop._id,
			initialThresholdMinutes: 480,
			repeatIntervalMinutes: 60,
		}).save();
		const token = signTestToken(artist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_RESPONSE_TIME_SETTINGS,
				// initialThresholdMinutes is fine on its own; repeatIntervalMinutes alone exceeds the
				// ceiling - both fields have to be checked independently, not just "is anything over".
				variables: { input: { initialThresholdMinutes: 300, repeatIntervalMinutes: 180 } },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.repeatIntervalMinutes).toMatch(/at most 60 minutes/);
		expect(errors[0].extensions.errors.initialThresholdMinutes).toBeUndefined();
	});

	it('a PRE-EXISTING artist row is left untouched by a rejected write, not partially applied', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		await new ResponseTimeSettings({
			shopId: shop._id,
			initialThresholdMinutes: 240,
			repeatIntervalMinutes: 120,
		}).save();
		await new ResponseTimeSettings({
			artistUserId: artist._id,
			initialThresholdMinutes: 200,
			repeatIntervalMinutes: 100,
		}).save();
		const token = signTestToken(artist);
		const server = createTestServer();

		await server.executeOperation(
			{
				query: UPDATE_RESPONSE_TIME_SETTINGS,
				variables: { input: { initialThresholdMinutes: 999, repeatIntervalMinutes: 100 } },
			},
			{ contextValue: contextWithToken(token) },
		);

		const stored = await ResponseTimeSettings.findOne({ artistUserId: artist._id });
		expect(stored.initialThresholdMinutes).toBe(200);
		expect(stored.repeatIntervalMinutes).toBe(100);
	});

	it('an UNCONNECTED artist (no shop, so no ceiling) may save any value within the schema\'s own 5min-30day bounds', async () => {
		const { user: artist } = await createArtistUser();
		const token = signTestToken(artist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_RESPONSE_TIME_SETTINGS,
				variables: { input: { initialThresholdMinutes: 43200, repeatIntervalMinutes: 43200 } },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateResponseTimeSettings.initialThresholdMinutes).toBe(43200);
	});

	it('getResponseTimeSettings.shopCeiling reflects the connected shop\'s row for an artist, and is null with no shop', async () => {
		const { user: connected } = await createArtistUser();
		const { user: unconnected } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(connected._id, shop._id);
		await new ResponseTimeSettings({
			shopId: shop._id,
			initialThresholdMinutes: 300,
			repeatIntervalMinutes: 90,
		}).save();
		const server = createTestServer();

		const connectedResponse = await server.executeOperation(
			{ query: GET_RESPONSE_TIME_SETTINGS, variables: { artistUserId: connected.id } },
			{ contextValue: contextWithToken(signTestToken(connected)) },
		);
		const unconnectedResponse = await server.executeOperation(
			{ query: GET_RESPONSE_TIME_SETTINGS, variables: { artistUserId: unconnected.id } },
			{ contextValue: contextWithToken(signTestToken(unconnected)) },
		);

		expect(connectedResponse.body.singleResult.data.getResponseTimeSettings.shopCeiling).toEqual({
			initialThresholdMinutes: 300,
			repeatIntervalMinutes: 90,
		});
		expect(
			unconnectedResponse.body.singleResult.data.getResponseTimeSettings.shopCeiling,
		).toBeNull();
	});
});
