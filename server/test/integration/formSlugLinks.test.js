// Integration tests for the Forms slug/default-forms layer shipped alongside default Booking
// Request/Consent forms, slug-based public links, and the restricted booking-fields editor - see
// HANDOFF.md, which flags this whole layer as untested. Nothing in test/ referenced form-slug.js,
// shop-slug.js, public-form-lookup.js or seed-default-forms.js before this file.
//
// Follows test/integration/bookingRequests.test.js's own conventions: describe/it/expect come
// from Vitest's `globals: true` config, createTestServer()/contextWithToken() build a fresh Apollo
// instance per test, and factories.js's direct-to-Mongoose builders stand in for
// register/login so tests aren't paying bcrypt's cost for fixtures that don't care about it.
//
// Mixes two levels on purpose: utils/form-slug.js, utils/shop-slug.js, utils/public-form-lookup.js
// and utils/seed-default-forms.js are exercised DIRECTLY (they're plain async functions with no
// GraphQL wrapping needed to reach), while updateBookingRequestFields/getMyFormLinks/
// getPublicFormBySlug/getPublicArtistProfile go through real GraphQL operations the way a client
// actually calls them - that's the only way to prove the input-type shape itself refuses what the
// resolver's own comments claim it refuses (see the "type is not even acceptable input" test
// below).
const mongoose = require('mongoose');
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	connectArtistToShop,
} = require('../helpers/factories');
const { Constants } = require('../../utils/constants');
const Form = require('../../models/Form');

const {
	normalizeSlug: normalizeFormSlug,
	slugFormatError: formSlugFormatError,
	isSlugAvailable: isFormSlugAvailable,
	assertSlugAvailable: assertFormSlugAvailable,
	RESERVED_SLUGS: FORM_RESERVED_SLUGS,
} = require('../../utils/form-slug');
const {
	normalizeSlug: normalizeShopSlug,
	slugFormatError: shopSlugFormatError,
	isSlugAvailable: isShopSlugAvailable,
	assertSlugAvailable: assertShopSlugAvailable,
	RESERVED_SLUGS: SHOP_RESERVED_SLUGS,
} = require('../../utils/shop-slug');
const { STATES: PUBLIC_FORM_STATES, resolvePublicFormBySlug } = require('../../utils/public-form-lookup');
const { seedDefaultForms, DEFAULT_FORM_DEFS } = require('../../utils/seed-default-forms');

// A bare Form document, owned by whoever the caller passes in - most of the public-form-lookup
// tests below build their own fixture forms directly rather than through createForm/updateForm,
// since the thing under test is the LOOKUP, not the write path createForm.test.js (once written)
// already owns.
async function makeForm(overrides = {}) {
	return new Form({
		title: 'Test Form',
		status: 'published',
		fields: [],
		createdByUserId: new mongoose.Types.ObjectId(),
		...overrides,
	}).save();
}

const GET_PUBLIC_FORM_BY_SLUG = `
	query GetPublicFormBySlug($formSlug: String!, $ownerHandle: String!) {
		getPublicFormBySlug(formSlug: $formSlug, ownerHandle: $ownerHandle) {
			state
			form {
				id
				title
				fields { key type label required hidden }
			}
		}
	}
`;

const GET_PUBLIC_ARTIST_PROFILE = `
	query GetPublicArtistProfile($artistId: ID!) {
		getPublicArtistProfile(artistId: $artistId) {
			id
			firstName
			lastName
			bookingSlug
			archived
		}
	}
`;

const GET_MY_FORM_LINKS = `
	query GetMyFormLinks {
		getMyFormLinks { title slug }
	}
`;

const GET_FORMS = `
	query GetForms($shopId: ID, $artistUserId: ID) {
		getForms(shopId: $shopId, artistUserId: $artistUserId) {
			items { id title }
		}
	}
`;

const UPDATE_BOOKING_REQUEST_FIELDS = `
	mutation UpdateBookingRequestFields($formId: ID!, $fields: [BookingRequestFieldInput!]!) {
		updateBookingRequestFields(formId: $formId, fields: $fields) {
			id
			fields { key type label required hidden options }
		}
	}
`;

// ---------------------------------------------------------------------------------------------
// 1. utils/form-slug.js
// ---------------------------------------------------------------------------------------------
describe('utils/form-slug.js', () => {
	describe('normalizeSlug', () => {
		it('trims and lowercases', () => {
			expect(normalizeFormSlug('  Consent-Form  ')).toBe('consent-form');
		});

		it('returns an empty string for anything that is not a real string', () => {
			expect(normalizeFormSlug(null)).toBe('');
			expect(normalizeFormSlug(undefined)).toBe('');
			expect(normalizeFormSlug(42)).toBe('');
		});
	});

	describe('slugFormatError', () => {
		it('accepts a well-formed slug', () => {
			expect(formSlugFormatError('new-client-intake')).toBeNull();
		});

		it('rejects a blank slug', () => {
			expect(formSlugFormatError('')).toMatch(/pick a link/i);
		});

		it('rejects a slug shorter than the minimum length', () => {
			expect(formSlugFormatError('a')).toMatch(/at least 2/);
		});

		it('rejects a slug longer than the maximum length', () => {
			expect(formSlugFormatError('a'.repeat(41))).toMatch(/at most 40/);
		});

		it('rejects uppercase, spaces, and leading/trailing hyphens', () => {
			expect(formSlugFormatError('Consent Form')).toMatch(/lowercase letters/i);
			expect(formSlugFormatError('-consent')).toMatch(/lowercase letters/i);
			expect(formSlugFormatError('consent-')).toMatch(/lowercase letters/i);
		});

		it('rejects every reserved word, "book" included', () => {
			expect(FORM_RESERVED_SLUGS.has('book')).toBe(true);
			expect(formSlugFormatError('book')).toMatch(/reserved/i);
			expect(formSlugFormatError('settings')).toMatch(/reserved/i);
		});
	});

	describe('isSlugAvailable / assertSlugAvailable - scoped by owner, not global', () => {
		it('lets two different owners both use the same form slug', async () => {
			const { user: artistA } = await createArtistUser();
			const { user: artistB } = await createArtistUser();
			await makeForm({ artistUserId: artistA.id, slug: 'aftercare' });

			// artistB has never used "aftercare" - the fact that artistA has is irrelevant to them,
			// because uniqueness is scoped per-owner (see the file's own header comment).
			expect(await isFormSlugAvailable('aftercare', { artistUserId: artistB.id })).toBe(true);
			await expect(
				assertFormSlugAvailable('aftercare', { artistUserId: artistB.id }),
			).resolves.toBe('aftercare');
		});

		it('lets a shop and an unrelated artist both use the same form slug', async () => {
			const { shop } = await createShopAdminUser();
			const { user: artist } = await createArtistUser();
			await makeForm({ shopId: shop._id, slug: 'aftercare' });

			expect(await isFormSlugAvailable('aftercare', { artistUserId: artist.id })).toBe(true);
		});

		it('refuses the SAME owner reusing a slug they already have on another form', async () => {
			const { user: artist } = await createArtistUser();
			await makeForm({ artistUserId: artist.id, slug: 'aftercare' });

			expect(await isFormSlugAvailable('aftercare', { artistUserId: artist.id })).toBe(false);
			let caught;
			try {
				await assertFormSlugAvailable('aftercare', { artistUserId: artist.id });
			} catch (err) {
				caught = err;
			}
			expect(caught).toBeDefined();
			expect(caught.extensions.errors.slug).toMatch(/already has a form/i);
		});

		it('exceptFormId lets a form keep its own slug when it is re-saved', async () => {
			const { user: artist } = await createArtistUser();
			const form = await makeForm({ artistUserId: artist.id, slug: 'aftercare' });

			expect(
				await isFormSlugAvailable('aftercare', { artistUserId: artist.id, exceptFormId: form._id }),
			).toBe(true);
		});

		it('a malformed or reserved slug is never "available", regardless of owner', async () => {
			const { user: artist } = await createArtistUser();
			expect(await isFormSlugAvailable('book', { artistUserId: artist.id })).toBe(false);
			expect(await isFormSlugAvailable('a', { artistUserId: artist.id })).toBe(false);
		});
	});
});

// ---------------------------------------------------------------------------------------------
// 2. utils/shop-slug.js
// ---------------------------------------------------------------------------------------------
describe('utils/shop-slug.js', () => {
	describe('normalizeSlug / slugFormatError', () => {
		it('trims and lowercases', () => {
			expect(normalizeShopSlug('  Ink-Haus  ')).toBe('ink-haus');
		});

		it('enforces its own (longer) minimum length of 3', () => {
			expect(shopSlugFormatError('ab')).toMatch(/at least 3/);
			expect(shopSlugFormatError('abc')).toBeNull();
		});

		it('reserves "book" here too, for the same second-path-segment reason', () => {
			expect(SHOP_RESERVED_SLUGS.has('book')).toBe(true);
			expect(shopSlugFormatError('book')).toMatch(/reserved/i);
		});
	});

	describe('isSlugAvailable / assertSlugAvailable - cross-checks Shop.formSlug AND Artist.bookingSlug', () => {
		it('a slug already used as an artist bookingSlug reads as taken for a shop', async () => {
			await createArtistUser({ artist: { bookingSlug: 'studio-nine' } });

			expect(await isShopSlugAvailable('studio-nine')).toBe(false);
			let caught;
			try {
				await assertShopSlugAvailable('studio-nine');
			} catch (err) {
				caught = err;
			}
			expect(caught).toBeDefined();
			expect(caught.extensions.errors.formSlug).toMatch(/already taken/i);
		});

		it('a slug already used as another shop\'s formSlug reads as taken', async () => {
			await createShopAdminUser({ shop: { formSlug: 'ink-haus' } });
			expect(await isShopSlugAvailable('ink-haus')).toBe(false);
		});

		it('exceptShopId lets a shop keep its own formSlug when it is re-saved', async () => {
			const { shop } = await createShopAdminUser({ shop: { formSlug: 'ink-haus' } });
			expect(await isShopSlugAvailable('ink-haus', shop._id)).toBe(true);
			await expect(assertShopSlugAvailable('ink-haus', shop._id)).resolves.toBe('ink-haus');
		});

		it('a genuinely free slug is available', async () => {
			expect(await isShopSlugAvailable('brand-new-studio')).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------------------------
// 3. utils/public-form-lookup.js: resolvePublicFormBySlug's 4-state resolution
// ---------------------------------------------------------------------------------------------
describe('resolvePublicFormBySlug', () => {
	describe('state: ok', () => {
		it('resolves a real, published form under its artist\'s own handle', async () => {
			const { user: artist } = await createArtistUser({ artist: { bookingSlug: 'inkbyzoe' } });
			const form = await makeForm({ artistUserId: artist.id, slug: 'consent', status: 'published', title: 'Consent' });

			const result = await resolvePublicFormBySlug('consent', 'inkbyzoe');
			expect(result.state).toBe(PUBLIC_FORM_STATES.OK);
			expect(String(result.form._id)).toBe(String(form._id));
		});

		it('normalizes both slug and handle before resolving (case/whitespace-insensitive)', async () => {
			const { user: artist } = await createArtistUser({ artist: { bookingSlug: 'inkbyzoe' } });
			await makeForm({ artistUserId: artist.id, slug: 'consent', status: 'published' });

			const result = await resolvePublicFormBySlug('  CONSENT ', ' InkByZoe ');
			expect(result.state).toBe(PUBLIC_FORM_STATES.OK);
		});
	});

	describe('state: not_found', () => {
		it('a formSlug/ownerHandle that maps to no artist or shop at all', async () => {
			const result = await resolvePublicFormBySlug('consent', 'nobody-with-this-handle');
			expect(result.state).toBe(PUBLIC_FORM_STATES.NOT_FOUND);
			expect(result.form).toBeNull();
		});

		it('a real, active artist handle with no form at that slug (own or shop\'s)', async () => {
			await createArtistUser({ artist: { bookingSlug: 'inkbyzoe' } });
			const result = await resolvePublicFormBySlug('nonexistent-slug', 'inkbyzoe');
			expect(result.state).toBe(PUBLIC_FORM_STATES.NOT_FOUND);
		});

		it('blank slug or handle inputs resolve to not_found rather than throwing', async () => {
			expect((await resolvePublicFormBySlug('', 'inkbyzoe')).state).toBe(PUBLIC_FORM_STATES.NOT_FOUND);
			expect((await resolvePublicFormBySlug('consent', '')).state).toBe(PUBLIC_FORM_STATES.NOT_FOUND);
		});
	});

	describe('state: inactive', () => {
		it('a real form at that slug/handle that is still a draft', async () => {
			const { user: artist } = await createArtistUser({ artist: { bookingSlug: 'inkbyzoe' } });
			await makeForm({ artistUserId: artist.id, slug: 'consent', status: 'draft' });

			const result = await resolvePublicFormBySlug('consent', 'inkbyzoe');
			expect(result.state).toBe(PUBLIC_FORM_STATES.INACTIVE);
			expect(result.form).toBeNull();
		});

		it('a real form at that slug/handle that has been archived (not the artist - the FORM)', async () => {
			const { user: artist } = await createArtistUser({ artist: { bookingSlug: 'inkbyzoe' } });
			await makeForm({ artistUserId: artist.id, slug: 'consent', status: 'archived' });

			const result = await resolvePublicFormBySlug('consent', 'inkbyzoe');
			expect(result.state).toBe(PUBLIC_FORM_STATES.INACTIVE);
		});
	});

	describe('state: artist_gone - ARCHIVED only, never INACTIVE/BOOKS_CLOSED', () => {
		it('an ARCHIVED artist\'s handle resolves to artist_gone even if a published form exists', async () => {
			const { user: artist } = await createArtistUser({
				artist: { bookingSlug: 'inkbyzoe', status: Constants.ARTIST_STATUS.ARCHIVED },
			});
			await makeForm({ artistUserId: artist.id, slug: 'consent', status: 'published' });

			const result = await resolvePublicFormBySlug('consent', 'inkbyzoe');
			expect(result.state).toBe(PUBLIC_FORM_STATES.ARTIST_GONE);
			expect(result.form).toBeNull();
		});

		it('an INACTIVE artist is NOT "gone" - their real published form still resolves ok', async () => {
			const { user: artist } = await createArtistUser({
				artist: { bookingSlug: 'inkbyzoe', status: Constants.ARTIST_STATUS.INACTIVE },
			});
			await makeForm({ artistUserId: artist.id, slug: 'consent', status: 'published' });

			const result = await resolvePublicFormBySlug('consent', 'inkbyzoe');
			expect(result.state).toBe(PUBLIC_FORM_STATES.OK);
		});

		it('a BOOKS_CLOSED artist is NOT "gone" either - same "still here, ask directly" treatment', async () => {
			const { user: artist } = await createArtistUser({
				artist: { bookingSlug: 'inkbyzoe', status: Constants.ARTIST_STATUS.BOOKS_CLOSED },
			});
			await makeForm({ artistUserId: artist.id, slug: 'consent', status: 'published' });

			const result = await resolvePublicFormBySlug('consent', 'inkbyzoe');
			expect(result.state).toBe(PUBLIC_FORM_STATES.OK);
		});
	});

	describe('resolution priority: artist bookingSlug > artist\'s own form > shop\'s non-shopUseOnly form; Shop.formSlug is the fallback, matched only against shopUseOnly forms', () => {
		it('the artist\'s OWN form wins over their shop\'s form of the exact same slug', async () => {
			const { shop } = await createShopAdminUser();
			const { user: artist } = await createArtistUser({ artist: { bookingSlug: 'zoeink' } });
			await connectArtistToShop(artist.id, shop._id);
			await makeForm({ shopId: shop._id, slug: 'waiver', shopUseOnly: false, status: 'published', title: 'Shop Waiver' });
			const ownForm = await makeForm({ artistUserId: artist.id, slug: 'waiver', status: 'published', title: 'Zoe Waiver' });

			const result = await resolvePublicFormBySlug('waiver', 'zoeink');
			expect(result.state).toBe(PUBLIC_FORM_STATES.OK);
			expect(String(result.form._id)).toBe(String(ownForm._id));
			expect(result.form.title).toBe('Zoe Waiver');
		});

		it('falls back to the shop\'s own non-shopUseOnly form when the artist has none of that slug', async () => {
			const { shop } = await createShopAdminUser();
			const { user: artist } = await createArtistUser({ artist: { bookingSlug: 'zoeink' } });
			await connectArtistToShop(artist.id, shop._id);
			const shopForm = await makeForm({ shopId: shop._id, slug: 'intake', shopUseOnly: false, status: 'published', title: 'Shop Intake' });

			const result = await resolvePublicFormBySlug('intake', 'zoeink');
			expect(result.state).toBe(PUBLIC_FORM_STATES.OK);
			expect(String(result.form._id)).toBe(String(shopForm._id));
		});

		it('a shopUseOnly form is invisible through an affiliated artist\'s own handle', async () => {
			const { shop } = await createShopAdminUser();
			const { user: artist } = await createArtistUser({ artist: { bookingSlug: 'zoeink' } });
			await connectArtistToShop(artist.id, shop._id);
			await makeForm({ shopId: shop._id, slug: 'frontdesk', shopUseOnly: true, status: 'published' });

			// The shop's shopUseOnly form has ONE link - the shop's own handle (below) - never a
			// per-artist one, per models/Form.js's own comment on shopUseOnly.
			const result = await resolvePublicFormBySlug('frontdesk', 'zoeink');
			expect(result.state).toBe(PUBLIC_FORM_STATES.NOT_FOUND);
		});

		it('Shop.formSlug resolves ONLY the shopUseOnly form of that slug', async () => {
			const { shop } = await createShopAdminUser({ shop: { formSlug: 'inkstudio' } });
			const shopUseOnlyForm = await makeForm({ shopId: shop._id, slug: 'waiver', shopUseOnly: true, status: 'published', title: 'Studio Waiver' });

			const result = await resolvePublicFormBySlug('waiver', 'inkstudio');
			expect(result.state).toBe(PUBLIC_FORM_STATES.OK);
			expect(String(result.form._id)).toBe(String(shopUseOnlyForm._id));
		});

		it('Shop.formSlug does NOT resolve a non-shopUseOnly form of the same slug', async () => {
			const { shop } = await createShopAdminUser({ shop: { formSlug: 'inkstudio' } });
			await makeForm({ shopId: shop._id, slug: 'waiver', shopUseOnly: false, status: 'published' });

			const result = await resolvePublicFormBySlug('waiver', 'inkstudio');
			expect(result.state).toBe(PUBLIC_FORM_STATES.NOT_FOUND);
		});
	});
});

// ---------------------------------------------------------------------------------------------
// 4. utils/seed-default-forms.js
// ---------------------------------------------------------------------------------------------
describe('seedDefaultForms', () => {
	it('requires exactly one of shopId/artistUserId - neither is an error', async () => {
		const { user } = await createArtistUser();
		await expect(seedDefaultForms({}, user.id)).rejects.toThrow(/shopId or an artistUserId/);
	});

	it('requires exactly one of shopId/artistUserId - both is also an error', async () => {
		const { shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await expect(
			seedDefaultForms({ shopId: shop._id, artistUserId: artist.id }, artist.id),
		).rejects.toThrow(/only one of shopId or artistUserId/);
	});

	it('creates both defaults for a shop that has neither yet', async () => {
		const { user, shop } = await createShopAdminUser();
		const created = await seedDefaultForms({ shopId: shop._id }, user.id);

		expect(created).toHaveLength(2);
		expect(created.map((f) => f.systemKey).sort()).toEqual(['booking_request', 'consent']);
		expect(await Form.countDocuments({ shopId: shop._id, systemKey: { $ne: null } })).toBe(2);
	});

	it('creates both defaults for a genuinely independent artist', async () => {
		const { user } = await createArtistUser();
		const created = await seedDefaultForms({ artistUserId: user.id }, user.id);

		expect(created).toHaveLength(2);
		expect(await Form.countDocuments({ artistUserId: user.id, systemKey: { $ne: null } })).toBe(2);
	});

	it('is idempotent: calling it twice for the same owner never doubles up', async () => {
		const { user, shop } = await createShopAdminUser();
		await seedDefaultForms({ shopId: shop._id }, user.id);

		const secondCall = await seedDefaultForms({ shopId: shop._id }, user.id);

		expect(secondCall).toEqual([]);
		expect(await Form.countDocuments({ shopId: shop._id, systemKey: 'booking_request' })).toBe(1);
		expect(await Form.countDocuments({ shopId: shop._id, systemKey: 'consent' })).toBe(1);
	});

	it('only backfills whichever default is missing when one already exists', async () => {
		const { user, shop } = await createShopAdminUser();
		// Simulates an owner who somehow already has a hand-made 'consent' systemKey form (e.g. a
		// migration run partway) - only 'booking_request' should be created.
		await makeForm({ shopId: shop._id, systemKey: 'consent', slug: 'consent', title: 'Already here' });

		const created = await seedDefaultForms({ shopId: shop._id }, user.id);
		expect(created.map((f) => f.systemKey)).toEqual(['booking_request']);
	});

	describe('the Consent Form default - fixed bug: guest access is on from the moment it is seeded', () => {
		it('allowGuestSubmissions is true, not the FormBuilder default of false', async () => {
			const { user, shop } = await createShopAdminUser();
			await seedDefaultForms({ shopId: shop._id }, user.id);

			const consent = await Form.findOne({ shopId: shop._id, systemKey: 'consent' });
			expect(consent.allowGuestSubmissions).toBe(true);
		});

		it('a publicToken is minted immediately - no separate setFormGuestAccess call needed', async () => {
			const { user, shop } = await createShopAdminUser();
			await seedDefaultForms({ shopId: shop._id }, user.id);

			const consent = await Form.findOne({ shopId: shop._id, systemKey: 'consent' });
			expect(typeof consent.publicToken).toBe('string');
			expect(consent.publicToken.length).toBeGreaterThan(0);
		});

		it('is published and carries the ID-upload + signature fields', async () => {
			const { user, shop } = await createShopAdminUser();
			await seedDefaultForms({ shopId: shop._id }, user.id);

			const consent = await Form.findOne({ shopId: shop._id, systemKey: 'consent' });
			expect(consent.status).toBe('published');
			expect(consent.fields.map((f) => f.type).sort()).toEqual(['file_upload', 'signature']);
		});
	});

	describe('the Booking Request default', () => {
		it('is seeded at the deliberately-reserved "book" slug, published, with no guest access of its own', async () => {
			const { user, shop } = await createShopAdminUser();
			await seedDefaultForms({ shopId: shop._id }, user.id);

			const bookingForm = await Form.findOne({ shopId: shop._id, systemKey: 'booking_request' });
			expect(bookingForm.slug).toBe('book');
			expect(bookingForm.status).toBe('published');
			expect(bookingForm.allowGuestSubmissions).toBe(false);
			expect(bookingForm.publicToken).toBeNull();
		});

		it('bypasses form-slug.js\'s own reserved-word check - "book" would be refused for anyone else', async () => {
			// Confirms the seed writes 'book' directly rather than through assertSlugAvailable: that
			// helper would refuse "book" to any ordinary caller (see form-slug.js's reserved-word
			// test above), yet the seed succeeds every time.
			expect(formSlugFormatError('book')).not.toBeNull();
			const { user, shop } = await createShopAdminUser();
			await expect(seedDefaultForms({ shopId: shop._id }, user.id)).resolves.toBeDefined();
		});

		it('carries exactly the 7 fixed BookingRequestInput intake slots, all optional by default', async () => {
			const { user, shop } = await createShopAdminUser();
			await seedDefaultForms({ shopId: shop._id }, user.id);

			const bookingForm = await Form.findOne({ shopId: shop._id, systemKey: 'booking_request' });
			const def = DEFAULT_FORM_DEFS.find((d) => d.systemKey === 'booking_request');
			expect(bookingForm.fields).toHaveLength(7);
			expect(bookingForm.fields.map((f) => f.key)).toEqual(def.fields.map((f) => f.key));
			expect(bookingForm.fields.every((f) => f.required === false)).toBe(true);
			expect(bookingForm.fields.every((f) => f.hidden === false)).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------------------------
// 5. GraphQL: updateBookingRequestFields - the restricted booking_request editor
// ---------------------------------------------------------------------------------------------
describe('updateBookingRequestFields', () => {
	async function seededBookingForm() {
		const { user: artist } = await createArtistUser();
		await seedDefaultForms({ artistUserId: artist.id }, artist.id);
		const form = await Form.findOne({ artistUserId: artist.id, systemKey: 'booking_request' });
		return { artist, form };
	}

	it('updates label/required/hidden on the existing 7 slots, and persists the new order', async () => {
		const { artist, form } = await seededBookingForm();
		const server = createTestServer();
		// Reversed order, one relabeled, one required, one hidden - exercises all three levers at
		// once plus the "array order is the stored order" reorder behavior (see the resolver's own
		// comment: the INCOMING array's order becomes the stored order).
		const reversedKeys = [...form.fields].reverse().map((f) => f.key);
		const reordered = reversedKeys.map((key) => {
			const field = { key, label: form.fields.find((f) => f.key === key).label };
			if (key === 'size') {
				return { ...field, label: 'Approximate size (inches)', required: true };
			}
			if (key === 'budget') {
				return { ...field, hidden: true };
			}
			return field;
		});

		const response = await server.executeOperation(
			{ query: UPDATE_BOOKING_REQUEST_FIELDS, variables: { formId: form.id, fields: reordered } },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		const savedFields = data.updateBookingRequestFields.fields;
		expect(savedFields.map((f) => f.key)).toEqual(reversedKeys);
		const savedSize = savedFields.find((f) => f.key === 'size');
		expect(savedSize.label).toBe('Approximate size (inches)');
		expect(savedSize.required).toBe(true);
		expect(savedFields.find((f) => f.key === 'budget').hidden).toBe(true);
	});

	it('never changes a field\'s type or options, even when unrelated fields are edited', async () => {
		const { artist, form } = await seededBookingForm();
		const server = createTestServer();
		const isCoverUpField = form.fields.find((f) => f.key === 'isCoverUp');
		expect(isCoverUpField.type).toBe('single_choice');
		expect(isCoverUpField.options).toEqual(['Yes', 'No']);

		const response = await server.executeOperation(
			{
				query: UPDATE_BOOKING_REQUEST_FIELDS,
				variables: {
					formId: form.id,
					fields: form.fields.map((f) => ({ key: f.key, label: f.label })),
				},
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		const savedIsCoverUp = data.updateBookingRequestFields.fields.find((f) => f.key === 'isCoverUp');
		expect(savedIsCoverUp.type).toBe('single_choice');
		expect(savedIsCoverUp.options).toEqual(['Yes', 'No']);
	});

	it('omitted required/hidden on a field leave its existing value untouched', async () => {
		const { artist, form } = await seededBookingForm();
		const server = createTestServer();

		await server.executeOperation(
			{
				query: UPDATE_BOOKING_REQUEST_FIELDS,
				variables: {
					formId: form.id,
					fields: form.fields.map((f) => ({ key: f.key, label: f.label, hidden: f.key === 'budget' })),
				},
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		// Second call sends no `hidden` at all - budget's true from the first call must survive.
		const secondResponse = await server.executeOperation(
			{
				query: UPDATE_BOOKING_REQUEST_FIELDS,
				variables: { formId: form.id, fields: form.fields.map((f) => ({ key: f.key, label: f.label })) },
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = secondResponse.body.singleResult;
		expect(errors).toBeUndefined();
		const budget = data.updateBookingRequestFields.fields.find((f) => f.key === 'budget');
		expect(budget.hidden).toBe(true);
	});

	it('refuses adding a field that is not one of the existing 7', async () => {
		const { artist, form } = await seededBookingForm();
		const server = createTestServer();
		const withExtra = [
			...form.fields.map((f) => ({ key: f.key, label: f.label })),
			{ key: 'notARealSlot', label: 'A made-up question' },
		];

		const response = await server.executeOperation(
			{ query: UPDATE_BOOKING_REQUEST_FIELDS, variables: { formId: form.id, fields: withExtra } },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.fields).toMatch(/cannot be added or removed/i);
	});

	it('refuses removing one of the 7 fields', async () => {
		const { artist, form } = await seededBookingForm();
		const server = createTestServer();
		const missingOne = form.fields.slice(1).map((f) => ({ key: f.key, label: f.label }));

		const response = await server.executeOperation(
			{ query: UPDATE_BOOKING_REQUEST_FIELDS, variables: { formId: form.id, fields: missingOne } },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.fields).toMatch(/cannot be added or removed/i);
	});

	it('refuses a duplicate key standing in for two of the seven slots', async () => {
		const { artist, form } = await seededBookingForm();
		const server = createTestServer();
		const duplicated = form.fields.slice(1).map((f) => ({ key: f.key, label: f.label }));
		duplicated.push({ key: duplicated[0].key, label: 'Duplicate' });

		const response = await server.executeOperation(
			{ query: UPDATE_BOOKING_REQUEST_FIELDS, variables: { formId: form.id, fields: duplicated } },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.fields).toMatch(/cannot be added or removed/i);
	});

	// BookingRequestFieldInput (typeDefs.js) simply has no `type`/`options` argument at all - this
	// proves the refusal happens at the SCHEMA level, before the resolver's own key-set check ever
	// runs, not merely as a resolver convention that a future edit could quietly weaken.
	it('the schema itself has no way to submit a type or options change here', async () => {
		const { artist, form } = await seededBookingForm();
		const server = createTestServer();
		const tampered = form.fields.map((f) => ({
			key: f.key,
			label: f.label,
			...(f.key === 'isCoverUp' ? { type: 'paragraph' } : {}),
		}));

		const response = await server.executeOperation(
			{ query: UPDATE_BOOKING_REQUEST_FIELDS, variables: { formId: form.id, fields: tampered } },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		// Variable coercion fails before execution starts - "type" is not a field
		// BookingRequestFieldInput declares.
		expect(response.body.singleResult.errors).toBeDefined();
		expect(response.body.singleResult.errors.length).toBeGreaterThan(0);

		const stillStored = await Form.findById(form.id);
		const isCoverUp = stillStored.fields.find((f) => f.key === 'isCoverUp');
		expect(isCoverUp.type).toBe('single_choice');
	});

	it('refuses a caller who does not own the form', async () => {
		const { form } = await seededBookingForm();
		const { user: someoneElse } = await createArtistUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_BOOKING_REQUEST_FIELDS,
				variables: { formId: form.id, fields: form.fields.map((f) => ({ key: f.key, label: f.label })) },
			},
			{ contextValue: contextWithToken(signTestToken(someoneElse)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('refuses to run against a form that is not the booking_request system form', async () => {
		const { user: artist } = await createArtistUser();
		await seedDefaultForms({ artistUserId: artist.id }, artist.id);
		const consentForm = await Form.findOne({ artistUserId: artist.id, systemKey: 'consent' });
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_BOOKING_REQUEST_FIELDS,
				variables: { formId: consentForm.id, fields: [{ key: 'whatever', label: 'x' }] },
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.formId).toMatch(/isn't the booking request form/i);
	});
});

// ---------------------------------------------------------------------------------------------
// 6. GraphQL: getMyFormLinks - self-scoped, no shopId/artistUserId argument
// ---------------------------------------------------------------------------------------------
describe('getMyFormLinks', () => {
	it('a plain shop-connected artist (not shop_admin) gets their own shop\'s form links with no arguments', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop._id);
		await seedDefaultForms({ shopId: shop._id }, shopAdmin.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_MY_FORM_LINKS },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getMyFormLinks.sort((a, b) => a.slug.localeCompare(b.slug))).toEqual([
			{ title: 'Booking Request', slug: 'book' },
			{ title: 'Consent Form', slug: 'consent' },
		]);
	});

	it('the SAME artist calling getForms(shopId) directly is refused - shop_admin-or-better only', async () => {
		const { shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop._id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_FORMS, variables: { shopId: shop._id.toString() } },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('a shop admin CAN call getForms(shopId) - confirms the artist\'s failure above is an authority gap, not a general bug', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await seedDefaultForms({ shopId: shop._id }, shopAdmin.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_FORMS, variables: { shopId: shop._id.toString() } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getForms.items).toHaveLength(2);
	});

	it('returns only {title, slug} - the schema has no other field to ask for', async () => {
		const { user: artist } = await createArtistUser();
		await seedDefaultForms({ artistUserId: artist.id }, artist.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: 'query { getMyFormLinks { title slug id } }' },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		// GraphQL validates the selection set against FormLinkSummary before any resolver runs -
		// "id" isn't one of its fields (see typeDefs.js's own comment: deliberately just enough to
		// build a URL and a label), so this is a schema-validation error, not a null/omitted value.
		expect(response.body.singleResult.errors).toBeDefined();
	});

	it('an independent artist (no shop) gets their own artistUserId-scoped links', async () => {
		const { user: artist } = await createArtistUser();
		await seedDefaultForms({ artistUserId: artist.id }, artist.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_MY_FORM_LINKS },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getMyFormLinks.map((f) => f.slug).sort()).toEqual(['book', 'consent']);
	});

	it('excludes a shopUseOnly form and a non-published draft, even though both belong to the caller\'s own shop', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artist } = await createArtistUser();
		await connectArtistToShop(artist.id, shop._id);
		await seedDefaultForms({ shopId: shop._id }, shopAdmin.id);
		await makeForm({ shopId: shop._id, slug: 'frontdesk', shopUseOnly: true, status: 'published', title: 'Front Desk Only', createdByUserId: shopAdmin._id });
		await makeForm({ shopId: shop._id, slug: 'draft-intake', status: 'draft', title: 'Still Drafting', createdByUserId: shopAdmin._id });
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_MY_FORM_LINKS },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getMyFormLinks.map((f) => f.slug).sort()).toEqual(['book', 'consent']);
	});
});

// ---------------------------------------------------------------------------------------------
// 7. A nonexistent handle and an archived artist's real handle must NOT collapse into the same
//    result - the bug this shipped fixing (see typeDefs.js's PublicArtistProfile.archived comment
//    and public-form-lookup.js's own header comment on the same distinction for form links).
// ---------------------------------------------------------------------------------------------
describe('nonexistent vs archived are distinguishable, not both a generic "not found"', () => {
	describe('getPublicFormBySlug', () => {
		it('a nonexistent ownerHandle is state: not_found', async () => {
			const server = createTestServer();
			const response = await server.executeOperation(
				{ query: GET_PUBLIC_FORM_BY_SLUG, variables: { formSlug: 'consent', ownerHandle: 'no-such-handle-at-all' } },
				{ contextValue: contextWithToken() },
			);
			const { errors, data } = response.body.singleResult;
			expect(errors).toBeUndefined();
			expect(data.getPublicFormBySlug.state).toBe('not_found');
			expect(data.getPublicFormBySlug.form).toBeNull();
		});

		it('an archived artist\'s real handle is the DIFFERENT, more specific state: artist_gone', async () => {
			const { user: artist } = await createArtistUser({
				artist: { bookingSlug: 'gone-artist', status: Constants.ARTIST_STATUS.ARCHIVED },
			});
			await makeForm({ artistUserId: artist.id, slug: 'consent', status: 'published' });
			const server = createTestServer();

			const response = await server.executeOperation(
				{ query: GET_PUBLIC_FORM_BY_SLUG, variables: { formSlug: 'consent', ownerHandle: 'gone-artist' } },
				{ contextValue: contextWithToken() },
			);
			const { errors, data } = response.body.singleResult;
			expect(errors).toBeUndefined();
			expect(data.getPublicFormBySlug.state).toBe('artist_gone');
			expect(data.getPublicFormBySlug.state).not.toBe('not_found');
		});
	});

	// getPublicArtistProfile(artistId: ID!) deliberately takes EITHER a real ObjectId OR an
	// artist's own bookingSlug in that same argument (see typeDefs.js's own comment: "so
	// /book/maya-chen and the older /book/<objectId> links both resolve") - so it is exercised here
	// with a handle, exactly like getPublicFormBySlug's ownerHandle above.
	describe('getPublicArtistProfile', () => {
		it('a genuinely nonexistent handle/id returns null', async () => {
			const server = createTestServer();
			const response = await server.executeOperation(
				{ query: GET_PUBLIC_ARTIST_PROFILE, variables: { artistId: 'no-such-handle-at-all' } },
				{ contextValue: contextWithToken() },
			);
			const { errors, data } = response.body.singleResult;
			expect(errors).toBeUndefined();
			expect(data.getPublicArtistProfile).toBeNull();
		});

		it('an ACTIVE artist\'s real handle returns a profile with archived: false', async () => {
			const { user: artist } = await createArtistUser({ artist: { bookingSlug: 'still-here' } });
			const server = createTestServer();

			const response = await server.executeOperation(
				{ query: GET_PUBLIC_ARTIST_PROFILE, variables: { artistId: 'still-here' } },
				{ contextValue: contextWithToken() },
			);
			const { errors, data } = response.body.singleResult;
			expect(errors).toBeUndefined();
			expect(data.getPublicArtistProfile).not.toBeNull();
			expect(data.getPublicArtistProfile.firstName).toBe(artist.firstName);
			expect(data.getPublicArtistProfile.archived).toBe(false);
		});

		it('an ARCHIVED artist\'s real handle returns a NON-NULL profile with archived: true - the fixed bug', async () => {
			const { user: artist } = await createArtistUser({
				artist: { bookingSlug: 'gone-artist-2', status: Constants.ARTIST_STATUS.ARCHIVED },
			});
			const server = createTestServer();

			const response = await server.executeOperation(
				{ query: GET_PUBLIC_ARTIST_PROFILE, variables: { artistId: 'gone-artist-2' } },
				{ contextValue: contextWithToken() },
			);
			const { errors, data } = response.body.singleResult;
			expect(errors).toBeUndefined();
			// Before the fix, an ARCHIVED artist and a handle that never existed at all both read as
			// data.getPublicArtistProfile === null - indistinguishable to the guest-facing page. Now
			// only the genuinely-nonexistent case (above) is null; an archived artist is a real,
			// non-null profile that explicitly says so.
			expect(data.getPublicArtistProfile).not.toBeNull();
			expect(data.getPublicArtistProfile.archived).toBe(true);
		});
	});
});
