// Integration tests for the Forms feature (resolvers/forms.js, models/Form.js,
// models/FormResponse.js) - consent forms, waivers, custom intake questionnaires. This shipped
// with ZERO test coverage; HANDOFF.md flags it as "the highest-priority gap to close before
// trusting this feature with a real shop's forms." This file is that gap being closed for the
// core Form/FormResponse CRUD and submission logic.
//
// NOT YET RUN. Same caveat as every other integration test in this directory (see
// expenses.test.js's own header comment) - this sandbox's MongoMemoryServer can't download a
// Mongo binary (fastdl.mongodb.org returns 403 for this platform), so `npx vitest run` fails
// before a single test executes, regardless of what the test bodies say. Written to the same
// structure and conventions as every passing test in this directory (expenses.test.js's
// ownership-authorization pattern, bookingRequests.test.js's guest-flow pattern); someone with
// real network access to fastdl.mongodb.org (or a local `mongod`) needs to be the first to
// actually run this file.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	createClientUser,
} = require('../helpers/factories');
const Form = require('../../models/Form');
const FormResponse = require('../../models/FormResponse');
const Client = require('../../models/Client');
const User = require('../../models/User');

// Every mutation below except submitFormResponse is withAuth'd, so this matches expenses.test.js's
// own `run` helper exactly - a fresh server + a signed JWT for `user`, no ip needed (nothing on
// this list calls getClientIp).
function run(query, user, variables) {
	return createTestServer().executeOperation(
		{ query, variables },
		{ contextValue: contextWithToken(signTestToken(user)) },
	);
}

// A fresh, never-used fake client IP per guest call - rate limiting is keyed by IP, and the
// in-memory limiter (utils/rate-limit.js) is a module-level singleton that persists for the whole
// test process, not reset between tests (see bookingRequests.test.js's own comment on the same
// helper, duplicated here rather than shared for the same "four lines, not worth coupling two
// files over" reasoning resolvers/forms.js itself gives for requireOneOwnerArg).
let ipCounter = 0;
function fakeIp() {
	ipCounter += 1;
	const octet4 = ipCounter % 250;
	const octet3 = Math.floor(ipCounter / 250) % 250;
	const octet2 = Math.floor(ipCounter / (250 * 250)) % 250;
	return `203.${octet2 + 1}.${octet3 + 1}.${octet4 + 1}`;
}

function submitAsGuest(variables, ip) {
	return createTestServer().executeOperation(
		{ query: SUBMIT_FORM_RESPONSE, variables },
		{ contextValue: { req: { headers: {}, ip: ip || fakeIp() } } },
	);
}

// submitFormResponse calls getClientIp(context.req) unconditionally, even on the authenticated
// paths - contextWithToken (test/helpers/testServer.js) builds req.headers but never sets req.ip,
// so an authenticated submission through the plain `run()` helper above would hit that call with
// an IP-less req. Building on top of contextWithToken (rather than hand-rolling a context and
// silently drifting from what index.js actually constructs) keeps `loaders` wired the same way
// every other authenticated test in this file gets it, while still giving submitFormResponse's
// rate limiter a real, per-test-call IP to key on.
function submitAsUser(variables, user, ip) {
	const base = contextWithToken(signTestToken(user));
	return createTestServer().executeOperation(
		{ query: SUBMIT_FORM_RESPONSE, variables },
		{ contextValue: { ...base, req: { ...base.req, ip: ip || fakeIp() } } },
	);
}

const CREATE_FORM = `
	mutation CreateForm($input: CreateFormInput!) {
		createForm(input: $input) {
			id
			shopId
			artistUserId
			title
			status
			fields { key type label helpText required options }
		}
	}
`;

const UPDATE_FORM = `
	mutation UpdateForm($input: UpdateFormInput!) {
		updateForm(input: $input) {
			id
			title
			fields { key type label helpText required options }
		}
	}
`;

const PUBLISH_FORM = `
	mutation PublishForm($formId: ID!) {
		publishForm(formId: $formId) { id status allowGuestSubmissions publicToken }
	}
`;

const ARCHIVE_FORM = `
	mutation ArchiveForm($formId: ID!) {
		archiveForm(formId: $formId) { id status allowGuestSubmissions publicToken }
	}
`;

const SET_FORM_GUEST_ACCESS = `
	mutation SetFormGuestAccess($formId: ID!, $allow: Boolean!) {
		setFormGuestAccess(formId: $formId, allow: $allow) {
			id
			status
			allowGuestSubmissions
			publicToken
		}
	}
`;

const DELETE_FORM = `
	mutation DeleteForm($formId: ID!) {
		deleteForm(formId: $formId)
	}
`;

const GET_FORM = `
	query GetForm($formId: ID!) {
		getForm(formId: $formId) {
			id
			title
			status
			allowGuestSubmissions
			publicToken
			fields { key label options required }
		}
	}
`;

const SUBMIT_FORM_RESPONSE = `
	mutation SubmitFormResponse($input: SubmitFormResponseInput!) {
		submitFormResponse(input: $input) {
			id
			formId
			clientId
			source
			answers { fieldKey textValue selectedOptions }
		}
	}
`;

// --- Fixture helpers -----------------------------------------------------------------------

function shortTextField(label, required = false) {
	return { type: 'short_text', label, required, helpText: '', options: [] };
}

function choiceField(label, options, { required = false, type = 'single_choice' } = {}) {
	return { type, label, required, helpText: '', options };
}

// Builds a Form document directly (bypassing createForm/zod) - the same "construct the fixture,
// then exercise the resolver under test" split expenses.test.js's seedExpenseType uses. `owner` is
// `{ shopId }` or `{ artistUserId }`, matching resolveBusinessOwner's own return shape exactly.
async function makeForm(owner, createdByUserId, overrides = {}) {
	return new Form({
		...owner,
		title: 'Consent Form',
		status: 'published',
		allowGuestSubmissions: false,
		publicToken: null,
		fields: [shortTextField('Full name', true)],
		createdByUserId,
		...overrides,
	}).save();
}

// A Client genuinely reachable by `shop` via Client.shopIds - see shop-membership.js's own
// canAccessClient comment on why this is the path a shop admin/staff member actually needs.
async function clientAtShop(shop) {
	return createClientUser({ client: { shopIds: [shop._id] } });
}

describe('createForm: schema validation', () => {
	// createFormInputSchema.fields is `.min(1, 'Add at least one field')` (utils/validation.js) -
	// this is the one thing every form, regardless of owner, must have before it can exist at all.
	it('rejects a form with zero fields', async () => {
		const { user: artist } = await createArtistUser();

		const { data, errors } = (
			await run(CREATE_FORM, artist, {
				input: { title: 'Empty Form', fields: [] },
			})
		).body.singleResult;

		// createForm(...): Form! is non-null in the schema, so a thrown resolver error nulls `data`
		// itself, not just `data.createForm` (same null-bubbling rule expenses.test.js/
		// bookingRequests.test.js both rely on).
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.fields).toMatch(/Add at least one field/);
	});
});

describe('createForm / resolveBusinessOwner: who a new form belongs to', () => {
	// Mirrors resolvers/forms.js's own header comment: "CREATE - resolveBusinessOwner(user,
	// input.shopId) decides and validates the owner in one call" - the exact same shape (and the
	// exact same underlying function) expenses.test.js already covers for Expense/Income.
	it('scopes to the shop when a shop admin passes their own shopId', async () => {
		const { user: admin, shop } = await createShopAdminUser();

		const { errors, data } = (
			await run(CREATE_FORM, admin, {
				input: { shopId: shop.id, title: 'Shop Waiver', fields: [shortTextField('Full name', true)] },
			})
		).body.singleResult;

		expect(errors).toBeUndefined();
		expect(data.createForm.shopId).toBe(String(shop.id));
		expect(data.createForm.artistUserId).toBeNull();
	});

	it("scopes to the caller's own artistUserId when shopId is omitted, for an independent artist", async () => {
		const { user: artist } = await createArtistUser();

		const { errors, data } = (
			await run(CREATE_FORM, artist, {
				input: { title: 'My Intake Form', fields: [shortTextField('Full name', true)] },
			})
		).body.singleResult;

		expect(errors).toBeUndefined();
		expect(data.createForm.artistUserId).toBe(String(artist.id));
		expect(data.createForm.shopId).toBeNull();
	});

	it("refuses a plain shop-connected SHOP_STAFF passing their shop's id - staff do not manage the books", async () => {
		const { shop } = await createShopAdminUser();
		const { user: staffUser } = await createStaffUser(shop.id);

		const { data, errors } = (
			await run(CREATE_FORM, staffUser, {
				input: { shopId: shop.id, title: 'Staff Attempt', fields: [shortTextField('Full name', true)] },
			})
		).body.singleResult;

		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/shop admin only|Action not allowed/);
	});

	it("refuses a shop admin passing a DIFFERENT shop's id - not a member there", async () => {
		const { user: admin } = await createShopAdminUser();
		const { shop: otherShop } = await createShopAdminUser();

		const { data, errors } = (
			await run(CREATE_FORM, admin, {
				input: { shopId: otherShop.id, title: 'Cross-shop attempt', fields: [shortTextField('Full name', true)] },
			})
		).body.singleResult;

		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('assertCanManageBusinessRecord (forms): ownership re-checked on every read/update/delete', () => {
	it("lets the owning artist read and update their own form", async () => {
		const { user: artist } = await createArtistUser();
		const form = await makeForm({ artistUserId: artist.id }, artist.id);

		const getRes = await run(GET_FORM, artist, { formId: form.id });
		expect(getRes.body.singleResult.errors).toBeUndefined();
		expect(getRes.body.singleResult.data.getForm.id).toBe(form.id);

		const updateRes = await run(UPDATE_FORM, artist, {
			input: { formId: form.id, title: 'Updated title' },
		});
		expect(updateRes.body.singleResult.errors).toBeUndefined();
		expect(updateRes.body.singleResult.data.updateForm.title).toBe('Updated title');
	});

	it("refuses a DIFFERENT artist from reading, updating, or deleting a form they don't own", async () => {
		const { user: owner } = await createArtistUser();
		const { user: outsider } = await createArtistUser();
		const form = await makeForm({ artistUserId: owner.id }, owner.id);

		const getRes = await run(GET_FORM, outsider, { formId: form.id });
		expect(getRes.body.singleResult.data).toBeNull();
		expect(getRes.body.singleResult.errors[0].message).toMatch(/Action not allowed/);

		const updateRes = await run(UPDATE_FORM, outsider, {
			input: { formId: form.id, title: 'Hijacked' },
		});
		expect(updateRes.body.singleResult.data).toBeNull();
		expect(updateRes.body.singleResult.errors[0].message).toMatch(/Action not allowed/);

		const deleteRes = await run(DELETE_FORM, outsider, { formId: form.id });
		expect(deleteRes.body.singleResult.data).toBeNull();
		expect(deleteRes.body.singleResult.errors[0].message).toMatch(/Action not allowed/);

		const stillThere = await Form.findById(form.id);
		expect(stillThere.title).toBe('Consent Form');
	});
});

describe('updateForm: Form.fields[].key stability', () => {
	// See models/Form.js's own header comment: a field's key is generated once and never reused,
	// because FormResponse.answers are keyed by it, not by array position or label. fieldsFromInput
	// (resolvers/forms.js) only ever passes `key` through when the caller supplied one - a
	// brand-new field (no key in the input) falls through to Mongoose's own
	// `default: () => crypto.randomUUID()`.
	it("keeps an existing field's key across an edit, and mints a fresh one for a brand-new field", async () => {
		const { user: artist } = await createArtistUser();
		const created = (
			await run(CREATE_FORM, artist, {
				input: { title: 'Intake', fields: [shortTextField('Full name', true)] },
			})
		).body.singleResult.data.createForm;
		const originalKey = created.fields[0].key;
		expect(originalKey).toBeTruthy();

		const updated = (
			await run(UPDATE_FORM, artist, {
				input: {
					formId: created.id,
					fields: [
						// Same field, key echoed back, label changed - this must NOT get a new key.
						{ key: originalKey, type: 'short_text', label: 'Legal name', required: true },
						// A genuinely new field - no key supplied.
						{ type: 'short_text', label: 'Preferred name', required: false },
					],
				},
			})
		).body.singleResult.data.updateForm;

		expect(updated.fields).toHaveLength(2);
		const editedField = updated.fields.find((f) => f.label === 'Legal name');
		const newField = updated.fields.find((f) => f.label === 'Preferred name');
		expect(editedField.key).toBe(originalKey);
		expect(newField.key).toBeTruthy();
		expect(newField.key).not.toBe(originalKey);
	});
});

describe('FormResponse.fieldsSnapshot: a real snapshot, not a live reference', () => {
	// THE load-bearing behavior of the whole feature, per models/FormResponse.js's own header
	// comment: "what somebody agreed to is whatever the form said the day they signed it" - editing
	// a form's wording/options later must never retroactively change what an already-submitted
	// response is interpreted as having asked. Tested directly: submit against a form, edit that
	// SAME field's label and options, then prove the stored response's own snapshot didn't move.
	it("does not change when the live Form's field label/options are edited after submission", async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const { client } = await clientAtShop(shop);
		const field = choiceField('Which style?', ['Old school', 'Fine line']);
		const form = await makeForm({ shopId: shop.id }, admin.id, { fields: [field] });
		const fieldKey = form.fields[0].key;

		const submitRes = await submitAsUser(
			{
				input: {
					formId: form.id,
					clientId: client.id,
					answers: [{ fieldKey, selectedOptions: ['Old school'] }],
				},
			},
			admin,
		);
		expect(submitRes.body.singleResult.errors).toBeUndefined();
		const responseId = submitRes.body.singleResult.data.submitFormResponse.id;

		const beforeEdit = await FormResponse.findById(responseId);
		expect(beforeEdit.fieldsSnapshot[0].label).toBe('Which style?');
		expect(beforeEdit.fieldsSnapshot[0].options).toEqual(['Old school', 'Fine line']);

		// Now edit the LIVE form - same field (key preserved), new label, a widened option list.
		const updateRes = await run(UPDATE_FORM, admin, {
			input: {
				formId: form.id,
				fields: [
					{
						key: fieldKey,
						type: 'single_choice',
						label: 'Which tattoo style, exactly?',
						options: ['Old school', 'Fine line', 'Anime'],
						required: false,
					},
				],
			},
		});
		expect(updateRes.body.singleResult.errors).toBeUndefined();

		// The LIVE form really did change...
		const liveForm = await Form.findById(form.id);
		expect(liveForm.fields[0].label).toBe('Which tattoo style, exactly?');
		expect(liveForm.fields[0].options).toEqual(['Old school', 'Fine line', 'Anime']);

		// ...but the already-submitted response's own snapshot is untouched.
		const afterEdit = await FormResponse.findById(responseId);
		expect(afterEdit.fieldsSnapshot[0].label).toBe('Which style?');
		expect(afterEdit.fieldsSnapshot[0].options).toEqual(['Old school', 'Fine line']);
		expect(afterEdit.fieldsSnapshot[0].key).toBe(fieldKey);
	});
});

describe('assertAnswersMatchFields: submission validation', () => {
	// A required field with no real answer, an answer naming an option the field doesn't have, and
	// an answer for a fieldKey not on the form at all - all three are loud, per-field failures
	// (resolvers/forms.js's own comment: "loud failures rather than silently-stored garbage"), not
	// silently dropped or silently accepted.
	async function shopFormWithClient() {
		const { user: admin, shop } = await createShopAdminUser();
		const { client } = await clientAtShop(shop);
		const requiredField = shortTextField('Full name', true);
		const dayField = choiceField('Preferred day', ['Mon', 'Tue'], { required: false });
		const form = await makeForm({ shopId: shop.id }, admin.id, { fields: [requiredField, dayField] });
		return { admin, form, client };
	}

	it('rejects a required field left with no answer, naming that field in the error', async () => {
		const { admin, form, client } = await shopFormWithClient();
		const requiredKey = form.fields[0].key;

		const res = await submitAsUser(
			{ input: { formId: form.id, clientId: client.id, answers: [] } },
			admin,
		);

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors[requiredKey]).toMatch(/"Full name" is required/);
		expect(await FormResponse.countDocuments({ formId: form.id })).toBe(0);
	});

	it('rejects an answer citing an option the field does not have', async () => {
		const { admin, form, client } = await shopFormWithClient();
		const requiredKey = form.fields[0].key;
		const dayKey = form.fields[1].key;

		const res = await submitAsUser(
			{
				input: {
					formId: form.id,
					clientId: client.id,
					answers: [
						{ fieldKey: requiredKey, textValue: 'Arya Stark' },
						{ fieldKey: dayKey, selectedOptions: ['Wed'] },
					],
				},
			},
			admin,
		);

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors[dayKey]).toMatch(
			/"Wed" is not one of this question's options/,
		);
	});

	it('rejects an answer for a fieldKey that is not part of this form', async () => {
		const { admin, form, client } = await shopFormWithClient();
		const requiredKey = form.fields[0].key;

		const res = await submitAsUser(
			{
				input: {
					formId: form.id,
					clientId: client.id,
					answers: [
						{ fieldKey: requiredKey, textValue: 'Arya Stark' },
						{ fieldKey: 'not-a-real-field-key', textValue: 'orphaned answer' },
					],
				},
			},
			admin,
		);

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors['not-a-real-field-key']).toMatch(
			/not part of this form/,
		);
	});
});

describe('submitFormResponse: the guest path (publicToken)', () => {
	// findOrCreateGuestClient (utils/guest-client.js) is the SAME real find-or-create-by-email
	// BookingRequest already relies on - see models/FormResponse.js's own comment on why clientId
	// is always set, even for a guest with no prior account.
	it('creates a new guest User + Client on a first-time email, and links the client to the form owner\'s shops', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const form = await makeForm({ shopId: shop.id }, admin.id, {
			allowGuestSubmissions: true,
			publicToken: 'guest-token-abc',
		});
		const email = `newguest${Date.now()}@example.com`;

		const res = await submitAsGuest({
			input: {
				publicToken: form.publicToken,
				answers: [{ fieldKey: form.fields[0].key, textValue: 'Arya Stark' }],
				firstName: 'Arya',
				lastName: 'Stark',
				email,
			},
		});

		const { errors, data } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.submitFormResponse.source).toBe('guest_public');

		const createdUser = await User.findOne({ email: email.toLowerCase() });
		expect(createdUser).not.toBeNull();
		expect(createdUser.hasSetPassword).toBe(false);

		const createdClient = await Client.findById(data.submitFormResponse.clientId);
		expect(createdClient.email.toLowerCase()).toBe(email.toLowerCase());
		// linkClientToUsersShops(client._id, form.createdByUserId) - the guest is this shop's
		// client from this moment, same reasoning as createBookingRequest's own guest flow.
		expect(createdClient.shopIds.map(String)).toContain(String(shop._id));
	});

	it('reuses the existing Client when the same email submits a second time', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const form = await makeForm({ shopId: shop.id }, admin.id, {
			allowGuestSubmissions: true,
			publicToken: 'guest-token-reuse',
		});
		const email = `repeatguest${Date.now()}@example.com`;
		const submission = () =>
			submitAsGuest({
				input: {
					publicToken: form.publicToken,
					answers: [{ fieldKey: form.fields[0].key, textValue: 'Arya Stark' }],
					firstName: 'Arya',
					lastName: 'Stark',
					email,
				},
			});

		const first = await submission();
		expect(first.body.singleResult.errors).toBeUndefined();
		const second = await submission();
		expect(second.body.singleResult.errors).toBeUndefined();

		expect(first.body.singleResult.data.submitFormResponse.clientId).toBe(
			second.body.singleResult.data.submitFormResponse.clientId,
		);
		expect(await User.countDocuments({ email: email.toLowerCase() })).toBe(1);
		expect(await FormResponse.countDocuments({ formId: form.id })).toBe(2);
	});
});

describe('submitFormResponse: the staff-entered path (explicit clientId)', () => {
	// Requires BOTH assertCanManageBusinessRecord (authority over the FORM's own scope) AND
	// assertCanAccessClient (a real relationship to the named CLIENT) - resolvers/forms.js's own
	// comment: "the first check alone would let any staff member at a shop attach a response to a
	// client they've never actually worked with."
	it('succeeds for a shop admin entering a response on behalf of their own shop\'s client', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const { client } = await clientAtShop(shop);
		const form = await makeForm({ shopId: shop.id }, admin.id);

		const res = await submitAsUser(
			{
				input: {
					formId: form.id,
					clientId: client.id,
					answers: [{ fieldKey: form.fields[0].key, textValue: 'Filled in at the counter' }],
				},
			},
			admin,
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.submitFormResponse.source).toBe('staff_entered');
		expect(res.body.singleResult.data.submitFormResponse.clientId).toBe(client.id);
	});

	it("refuses a SHOP_STAFF member who doesn't manage the form's own business scope, even naming a real client there", async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const { user: staffUser } = await createStaffUser(shop.id);
		const { client } = await clientAtShop(shop);
		const form = await makeForm({ shopId: shop.id }, admin.id);

		const res = await submitAsUser(
			{
				input: {
					formId: form.id,
					clientId: client.id,
					answers: [{ fieldKey: form.fields[0].key, textValue: 'Attempted by staff' }],
				},
			},
			staffUser,
		);

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
		expect(await FormResponse.countDocuments({ formId: form.id })).toBe(0);
	});

	it('refuses a shop admin naming a client with no relationship to their shop, even though they manage the form', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const { shop: unrelatedShop } = await createShopAdminUser();
		const { client: unrelatedClient } = await clientAtShop(unrelatedShop);
		const form = await makeForm({ shopId: shop.id }, admin.id);

		const res = await submitAsUser(
			{
				input: {
					formId: form.id,
					clientId: unrelatedClient.id,
					answers: [{ fieldKey: form.fields[0].key, textValue: 'Wrong client' }],
				},
			},
			admin,
		);

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
		expect(await FormResponse.countDocuments({ formId: form.id })).toBe(0);
	});
});

describe('submitFormResponse: the self-service path (authenticated, no clientId)', () => {
	// "Self-service: the logged-in caller is filling out their own copy" - resolves via
	// `Client.findOne({ userId: authenticatedCaller.id })`, never through the form's own scope.
	it("resolves the caller's own Client record", async () => {
		const { user: artist } = await createArtistUser();
		const form = await makeForm({ artistUserId: artist.id }, artist.id);
		const { user: clientUser, client } = await createClientUser();

		const res = await submitAsUser(
			{
				input: {
					formId: form.id,
					answers: [{ fieldKey: form.fields[0].key, textValue: 'My own name' }],
				},
			},
			clientUser,
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.submitFormResponse.source).toBe('client_authenticated');
		expect(res.body.singleResult.data.submitFormResponse.clientId).toBe(client.id);
	});

	it('refuses an authenticated caller with no Client record of their own at all', async () => {
		const { user: artist } = await createArtistUser();
		const form = await makeForm({ artistUserId: artist.id }, artist.id);
		// The artist themselves is authenticated but has no Client record - self-service has
		// nothing to resolve to.
		const res = await submitAsUser(
			{
				input: {
					formId: form.id,
					answers: [{ fieldKey: form.fields[0].key, textValue: 'No client record' }],
				},
			},
			artist,
		);

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors.formId).toMatch(
			/No client record found for this account/,
		);
	});
});

describe('submitFormResponse: guest access gating', () => {
	// Both a "toggled off" and a "never toggled on" case - see models/Form.js's own comment on
	// allowGuestSubmissions being per-form, re-checked at submission time regardless of how the
	// caller got here.
	it('refuses a guest using a stale publicToken once allowGuestSubmissions has been turned back off', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const form = await makeForm({ shopId: shop.id }, admin.id, {
			allowGuestSubmissions: false,
			publicToken: 'once-valid-now-stale-token',
		});

		const res = await submitAsGuest({
			input: {
				publicToken: form.publicToken,
				answers: [{ fieldKey: form.fields[0].key, textValue: 'Trying an old link' }],
				firstName: 'Old',
				lastName: 'Link',
				email: `stale${Date.now()}@example.com`,
			},
		});

		// The Form.findOne lookup itself requires allowGuestSubmissions: true, so a stale token on
		// a since-disabled form simply fails to resolve any form at all - a generic "invalid link"
		// message, not a more informative (and guessable-by-trial) distinction.
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors.publicToken).toMatch(
			/Invalid or expired link/,
		);
	});

	it('refuses a guest with no publicToken to use at all, when guest access was never turned on', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const form = await makeForm({ shopId: shop.id }, admin.id); // allowGuestSubmissions: false, publicToken: null

		// The only thing a guest could try is formId - and a guest is never allowed to resolve a
		// form by formId alone (resolvers/forms.js's own comment on why).
		const res = await submitAsGuest({
			input: {
				formId: form.id,
				answers: [{ fieldKey: form.fields[0].key, textValue: 'No link exists' }],
				firstName: 'No',
				lastName: 'Link',
				email: `nolink${Date.now()}@example.com`,
			},
		});

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('deleteForm: refuses once any FormResponse references the form', () => {
	// "A signed waiver is exactly the kind of record this app must never let disappear by
	// accident" - models/FormResponse.js's own header comment, enforced here via a plain
	// FormResponse.exists check rather than a cascading delete.
	it('deletes a form with zero responses', async () => {
		const { user: artist } = await createArtistUser();
		const form = await makeForm({ artistUserId: artist.id }, artist.id);

		const res = await run(DELETE_FORM, artist, { formId: form.id });

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.deleteForm).toBe(true);
		expect(await Form.findById(form.id)).toBeNull();
	});

	it('refuses to delete a form that already has one response on file', async () => {
		const { user: artist } = await createArtistUser();
		const form = await makeForm({ artistUserId: artist.id }, artist.id);
		const { user: clientUser } = await createClientUser();
		const submitRes = await submitAsUser(
			{ input: { formId: form.id, answers: [{ fieldKey: form.fields[0].key, textValue: 'On file' }] } },
			clientUser,
		);
		expect(submitRes.body.singleResult.errors).toBeUndefined();

		const res = await run(DELETE_FORM, artist, { formId: form.id });

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors.formId).toMatch(
			/has responses on file and cannot be deleted/,
		);
		expect(await Form.findById(form.id)).not.toBeNull();
	});

	it('refuses to delete a systemKey-marked default form, even with zero responses', async () => {
		const { user: artist } = await createArtistUser();
		const form = await makeForm({ artistUserId: artist.id }, artist.id, { systemKey: 'consent' });

		const res = await run(DELETE_FORM, artist, { formId: form.id });

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors.formId).toMatch(
			/default form and cannot be deleted/,
		);
	});
});

describe('publishForm / archiveForm / setFormGuestAccess: separate explicit mutations', () => {
	// UpdateFormInput's own comment: status and allowGuestSubmissions are deliberately NOT part of
	// the generic PATCH - each is its own explicit action. Confirms calling one never silently
	// touches either of the other two fields.
	it('moves only the field each mutation owns, leaving the others exactly as they were', async () => {
		const { user: artist } = await createArtistUser();
		const draft = await makeForm({ artistUserId: artist.id }, artist.id, { status: 'draft' });

		const publishRes = await run(PUBLISH_FORM, artist, { formId: draft.id });
		expect(publishRes.body.singleResult.errors).toBeUndefined();
		expect(publishRes.body.singleResult.data.publishForm.status).toBe('published');
		expect(publishRes.body.singleResult.data.publishForm.allowGuestSubmissions).toBe(false);

		const guestRes = await run(SET_FORM_GUEST_ACCESS, artist, { formId: draft.id, allow: true });
		expect(guestRes.body.singleResult.errors).toBeUndefined();
		expect(guestRes.body.singleResult.data.setFormGuestAccess.allowGuestSubmissions).toBe(true);
		// Turning guest access on must not have touched status.
		expect(guestRes.body.singleResult.data.setFormGuestAccess.status).toBe('published');
		const mintedToken = guestRes.body.singleResult.data.setFormGuestAccess.publicToken;
		expect(mintedToken).toBeTruthy();

		const archiveRes = await run(ARCHIVE_FORM, artist, { formId: draft.id });
		expect(archiveRes.body.singleResult.errors).toBeUndefined();
		expect(archiveRes.body.singleResult.data.archiveForm.status).toBe('archived');
		// Archiving must not have touched guest access or its already-minted token.
		expect(archiveRes.body.singleResult.data.archiveForm.allowGuestSubmissions).toBe(true);
		expect(archiveRes.body.singleResult.data.archiveForm.publicToken).toBe(mintedToken);
	});

	it('refuses to publish a form with no fields at all', async () => {
		const { user: artist } = await createArtistUser();
		const emptyDraft = await new Form({
			artistUserId: artist.id,
			title: 'Nothing here yet',
			status: 'draft',
			fields: [],
			createdByUserId: artist.id,
		}).save();

		const res = await run(PUBLISH_FORM, artist, { formId: emptyDraft.id });

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors.formId).toMatch(
			/Add at least one field before publishing/,
		);
	});
});

describe('setFormGuestAccess: publicToken is minted once and never regenerated', () => {
	// models/Form.js's own comment: "not regenerated on every toggle, so a link already handed to a
	// client or printed on a card keeps working if guest access is turned off and back on later."
	it('keeps the same publicToken across off-then-on, minting it only the first time on', async () => {
		const { user: artist } = await createArtistUser();
		const form = await makeForm({ artistUserId: artist.id }, artist.id);
		expect(form.publicToken).toBeNull();

		const firstOn = await run(SET_FORM_GUEST_ACCESS, artist, { formId: form.id, allow: true });
		const tokenAfterFirstOn = firstOn.body.singleResult.data.setFormGuestAccess.publicToken;
		expect(tokenAfterFirstOn).toBeTruthy();

		const off = await run(SET_FORM_GUEST_ACCESS, artist, { formId: form.id, allow: false });
		expect(off.body.singleResult.data.setFormGuestAccess.allowGuestSubmissions).toBe(false);
		// The token is never cleared just because guest access is off - only allowGuestSubmissions
		// (re-checked at submission time) is what actually gates a guest out, per the resolver's
		// own defense-in-depth comment.
		expect(off.body.singleResult.data.setFormGuestAccess.publicToken).toBe(tokenAfterFirstOn);

		const secondOn = await run(SET_FORM_GUEST_ACCESS, artist, { formId: form.id, allow: true });
		expect(secondOn.body.singleResult.data.setFormGuestAccess.allowGuestSubmissions).toBe(true);
		expect(secondOn.body.singleResult.data.setFormGuestAccess.publicToken).toBe(tokenAfterFirstOn);

		const stored = await Form.findById(form.id);
		expect(stored.publicToken).toBe(tokenAfterFirstOn);
	});
});
