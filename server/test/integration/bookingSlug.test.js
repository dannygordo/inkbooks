// Integration coverage for the public booking handle - the resolver paths, the uniqueness rule,
// and the "no slug" state that the sparse index exists to allow.
//
// The rule worth guarding hardest is the last one: bookingSlug is unique, and an artist without
// one must stay a legal state for ANY number of artists. A plain unique index treats every
// missing value as the same null, so the second slug-less artist would collide with the first -
// which is the exact shape of the stale-index problem the deleted User.username left behind.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createShopAdminUser, createClientUser } = require('../helpers/factories');
const Artist = require('../../models/Artist');

const PUBLIC_PROFILE = `
	query GetPublicArtistProfile($artistHandle: ID!) {
		getPublicArtistProfile(artistId: $artistHandle) {
			id
			firstName
			bookingSlug
		}
	}
`;

const CHECK_SLUG = `
	query CheckBookingSlugAvailable($slug: String!) {
		checkBookingSlugAvailable(slug: $slug) {
			slug
			available
			reason
		}
	}
`;

const UPDATE_MY_SLUG = `
	mutation UpdateMyBookingSlug($slug: String!) {
		updateMyBookingSlug(slug: $slug) {
			id
			bookingSlug
		}
	}
`;

// These two queries are public - no token to sign.
const publicContext = () => ({ contextValue: { req: { headers: {}, ip: '10.2.0.1' } } });
const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

describe('getPublicArtistProfile', () => {
	it('resolves an artist by their booking slug', async () => {
		const { user, artist } = await createArtistUser({ artist: { bookingSlug: 'maya-chen' } });
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: PUBLIC_PROFILE, variables: { artistHandle: 'maya-chen' } },
			publicContext(),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.getPublicArtistProfile.id).toBe(String(user.id));
		expect(res.body.singleResult.data.getPublicArtistProfile.bookingSlug).toBe('maya-chen');
		expect(artist.bookingSlug).toBe('maya-chen');
	});

	it('still resolves by raw artist id, so older links keep working', async () => {
		// The slug is the point, but /book/<objectId> links were handed out before slugs existed
		// and an artist who hasn't chosen one still needs a reachable booking page.
		const { user } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: PUBLIC_PROFILE, variables: { artistHandle: String(user.id) } },
			publicContext(),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.getPublicArtistProfile.id).toBe(String(user.id));
	});

	it('returns null for an unknown handle without erroring', async () => {
		// Null rather than a thrown error, and the same null for "no such slug" as for "not an
		// artist" - so this can't be used to probe which handles exist.
		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: PUBLIC_PROFILE, variables: { artistHandle: 'nobody-has-this' } },
			publicContext(),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.getPublicArtistProfile).toBeNull();
	});

	it('does not throw a CastError on a non-ObjectId handle that matches nothing', async () => {
		// findById on a string that isn't an ObjectId throws rather than returning null, and every
		// slug is a non-ObjectId string - so this is the COMMON path, not an edge case.
		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: PUBLIC_PROFILE, variables: { artistHandle: 'not-an-object-id-at-all' } },
			publicContext(),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.getPublicArtistProfile).toBeNull();
	});

	it('does not expose a client account through a booking link', async () => {
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: PUBLIC_PROFILE, variables: { artistHandle: String(clientUser.id) } },
			publicContext(),
		);

		expect(res.body.singleResult.data.getPublicArtistProfile).toBeNull();
	});
});

describe('checkBookingSlugAvailable', () => {
	it('reports a free slug as available', async () => {
		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: CHECK_SLUG, variables: { slug: 'totally-unclaimed' } },
			publicContext(),
		);

		expect(res.body.singleResult.data.checkBookingSlugAvailable.available).toBe(true);
		expect(res.body.singleResult.data.checkBookingSlugAvailable.reason).toBeNull();
	});

	it('reports a taken slug with a reason', async () => {
		await createArtistUser({ artist: { bookingSlug: 'already-mine' } });
		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: CHECK_SLUG, variables: { slug: 'already-mine' } },
			publicContext(),
		);

		const result = res.body.singleResult.data.checkBookingSlugAvailable;
		expect(result.available).toBe(false);
		expect(result.reason).toMatch(/already taken/i);
	});

	it('distinguishes reserved and malformed from taken', async () => {
		// Three different things for the person typing to do next. A bare boolean would make them
		// guess which one they hit.
		const server = createTestServer();
		const reasons = [];
		for (const slug of ['admin', 'ab', 'has spaces']) {
			const res = await server.executeOperation(
				{ query: CHECK_SLUG, variables: { slug } },
				publicContext(),
			);
			const result = res.body.singleResult.data.checkBookingSlugAvailable;
			expect(result.available).toBe(false);
			reasons.push(result.reason);
		}
		expect(new Set(reasons).size).toBe(3);
	});

	it('normalises before answering, so case is not a different slug', async () => {
		await createArtistUser({ artist: { bookingSlug: 'case-test' } });
		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: CHECK_SLUG, variables: { slug: '  CASE-TEST ' } },
			publicContext(),
		);

		expect(res.body.singleResult.data.checkBookingSlugAvailable.available).toBe(false);
		expect(res.body.singleResult.data.checkBookingSlugAvailable.slug).toBe('case-test');
	});
});

describe('updateMyBookingSlug', () => {
	it('lets an artist set their own link', async () => {
		// The reason this mutation exists at all: updateArtist is SHOP_ADMIN-gated, so an artist
		// could not change their own public booking link without asking an admin.
		const { user } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: UPDATE_MY_SLUG, variables: { slug: 'my-own-link' } },
			asUser(user),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.updateMyBookingSlug.bookingSlug).toBe('my-own-link');
	});

	it('normalises on the way in', async () => {
		const { user } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: UPDATE_MY_SLUG, variables: { slug: '  My-Own-Link ' } },
			asUser(user),
		);

		expect(res.body.singleResult.data.updateMyBookingSlug.bookingSlug).toBe('my-own-link');
	});

	it('lets an artist keep their own slug when re-saving', async () => {
		// exceptArtistId - without it, saving your profile unchanged reports your own link as taken.
		const { user } = await createArtistUser({ artist: { bookingSlug: 'stays-mine' } });
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: UPDATE_MY_SLUG, variables: { slug: 'stays-mine' } },
			asUser(user),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.updateMyBookingSlug.bookingSlug).toBe('stays-mine');
	});

	it('refuses a slug another artist already holds', async () => {
		await createArtistUser({ artist: { bookingSlug: 'taken-already' } });
		const { user: second } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: UPDATE_MY_SLUG, variables: { slug: 'taken-already' } },
			asUser(second),
		);

		expect(res.body.singleResult.errors).toBeDefined();
		expect(res.body.singleResult.errors[0].extensions.errors.bookingSlug).toMatch(/taken/i);
	});

	it('refuses a reserved word', async () => {
		const { user } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: UPDATE_MY_SLUG, variables: { slug: 'support' } },
			asUser(user),
		);

		expect(res.body.singleResult.errors).toBeDefined();
		expect(res.body.singleResult.errors[0].extensions.errors.bookingSlug).toMatch(/reserved/i);
	});

	it('removes the link on an empty string, without storing one', async () => {
		// "No booking link" has to be an absent field, not ''. An empty string is a real value as
		// far as the unique index is concerned, so storing it would make the SECOND artist who
		// cleared theirs collide with the first.
		const { user, artist } = await createArtistUser({ artist: { bookingSlug: 'about-to-go' } });
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: UPDATE_MY_SLUG, variables: { slug: '' } },
			asUser(user),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		const stored = await Artist.findById(artist._id);
		expect(stored.bookingSlug).toBeUndefined();
	});

	it('refuses a non-artist', async () => {
		const { user: admin } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: UPDATE_MY_SLUG, variables: { slug: 'not-my-thing' } },
			asUser(admin),
		);

		expect(res.body.singleResult.errors).toBeDefined();
		expect(res.body.singleResult.errors[0].message).toMatch(/not allowed/i);
	});
});

describe('the no-slug state', () => {
	it('allows any number of artists without a booking link', async () => {
		// THE test for the sparse index. Under a plain unique index the second of these throws a
		// duplicate key error on a shared null, and every artist created after the first would
		// fail for a reason nothing in the calling code explains.
		const first = await createArtistUser();
		const second = await createArtistUser();
		const third = await createArtistUser();

		expect(first.artist.bookingSlug).toBeUndefined();
		expect(second.artist.bookingSlug).toBeUndefined();
		expect(third.artist.bookingSlug).toBeUndefined();
		expect(await Artist.countDocuments({ bookingSlug: { $exists: false } })).toBe(3);
	});

	it('reports a null slug on the public profile rather than failing', async () => {
		const { user } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: PUBLIC_PROFILE, variables: { artistHandle: String(user.id) } },
			publicContext(),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.getPublicArtistProfile.bookingSlug).toBeNull();
	});
});
