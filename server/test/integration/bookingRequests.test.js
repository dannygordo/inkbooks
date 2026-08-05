// Integration tests for the public booking-request/guest-correspondence flow - the one part of
// this API that's intentionally reachable with no JWT at all (createBookingRequest,
// sendGuestMessage, getBookingRequestByToken, getPublicArtistProfile are public/token-gated by
// design, not withAuth). convertBookingRequest is the one artist-side, withAuth'd mutation in this
// file. Covers the two things that matter most here: rate limiting on the public endpoints, and
// the guest-token revocation gate (a magic link must stop working the instant its underlying
// account sets a real password - see utils/guest-auth.js).
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createUser,
	createShopAdminUser,
	connectArtistToShop,
} = require('../helpers/factories');
const { Constants } = require('../../utils/constants');
const User = require('../../models/User');
const Client = require('../../models/Client');
const Appointment = require('../../models/Appointment');
const BookingRequest = require('../../models/BookingRequest');

const GET_PUBLIC_ARTIST_PROFILE = `
	query GetPublicArtistProfile($artistId: ID!) {
		getPublicArtistProfile(artistId: $artistId) {
			id
			firstName
			lastName
		}
	}
`;

const CREATE_BOOKING_REQUEST = `
	mutation CreateBookingRequest($bookingRequestInput: BookingRequestInput!) {
		createBookingRequest(bookingRequestInput: $bookingRequestInput) {
			id
			status
			artistId
		}
	}
`;

const GET_BOOKING_REQUESTS = `
	query GetBookingRequests($artistId: ID!) {
		getBookingRequests(artistId: $artistId) {
			id
			status
			source
		}
	}
`;

const GET_BOOKING_REQUEST_BY_TOKEN = `
	query GetBookingRequestByToken($token: String!) {
		getBookingRequestByToken(token: $token) {
			id
			description
		}
	}
`;

const SEND_GUEST_MESSAGE = `
	mutation SendGuestMessage($token: String!, $message: String!) {
		sendGuestMessage(token: $token, message: $message) {
			id
			message
		}
	}
`;

const CONVERT_BOOKING_REQUEST = `
	mutation ConvertBookingRequest(
		$bookingRequestId: ID!
		$outcome: String!
		$appointmentInput: AppointmentInput
		$projectTitle: String
	) {
		convertBookingRequest(
			bookingRequestId: $bookingRequestId
			outcome: $outcome
			appointmentInput: $appointmentInput
			projectTitle: $projectTitle
		) {
			id
			status
			resultingAppointmentId
		}
	}
`;

// A fresh, never-used fake client IP per test - rate limiting is keyed by IP, and the in-memory
// limiter (utils/rate-limit.js) is a module-level singleton that persists for the whole test
// process, not reset between tests. Reusing a real-looking IP across tests would let one test's
// usage count bleed into another's rate-limit assertions.
let ipCounter = 0;
function fakeIp() {
	// A strictly incrementing counter encoded across all four octets guarantees every call within
	// this file returns a distinct address (up to 250^4, far more than this file will ever need) -
	// unlike a random range, which matters because the rate limiter (utils/rate-limit.js) is an
	// in-memory singleton that persists for the whole test file, not reset between tests the way
	// the DB is (a collision would let one test's usage count bleed into another's).
	ipCounter += 1;
	const octet4 = ipCounter % 250;
	const octet3 = Math.floor(ipCounter / 250) % 250;
	const octet2 = Math.floor(ipCounter / (250 * 250)) % 250;
	return `198.${octet2 + 1}.${octet3 + 1}.${octet4 + 1}`;
}

function bookingInput(artistId, overrides = {}) {
	return {
		artistId,
		firstName: 'Arya',
		lastName: 'Stark',
		email: `guest${Date.now()}${Math.floor(Math.random() * 100000)}@example.com`,
		description: 'A small needle-and-thread tattoo, black and grey.',
		...overrides,
	};
}

describe('getPublicArtistProfile', () => {
	it('returns a narrow profile for a real artist', async () => {
		const { user: artistUser } = await createArtistUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PUBLIC_ARTIST_PROFILE, variables: { artistId: artistUser.id } },
			{ contextValue: contextWithToken() }, // no auth needed - public query
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getPublicArtistProfile.firstName).toBe(artistUser.firstName);
	});

	it('returns null (not an error) for a non-artist user id', async () => {
		const clientUser = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PUBLIC_ARTIST_PROFILE, variables: { artistId: clientUser.id } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getPublicArtistProfile).toBeNull();
	});

	it('returns null (not an error) for a well-formed but nonexistent id', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: GET_PUBLIC_ARTIST_PROFILE, variables: { artistId: '507f1f77bcf86cd799439011' } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getPublicArtistProfile).toBeNull();
	});
});

describe('createBookingRequest', () => {
	it('creates a new guest User + Client + BookingRequest for a first-time email', async () => {
		const { user: artistUser } = await createArtistUser();
		const server = createTestServer();
		const email = `newguest${Date.now()}@example.com`;

		const response = await server.executeOperation(
			{ query: CREATE_BOOKING_REQUEST, variables: { bookingRequestInput: bookingInput(artistUser.id, { email }) } },
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createBookingRequest.status).toBe('pending');

		const createdUser = await User.findOne({ email: email.toLowerCase() });
		expect(createdUser).not.toBeNull();
		expect(createdUser.hasSetPassword).toBe(false);
	});

	it('reuses the existing User/Client when the email already has an account', async () => {
		const { user: artistUser } = await createArtistUser();
		const existing = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_BOOKING_REQUEST,
				variables: { bookingRequestInput: bookingInput(artistUser.id, { email: existing.email }) },
			},
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);

		const { errors } = response.body.singleResult;
		expect(errors).toBeUndefined();

		// Still exactly one User with this email - no duplicate was created.
		const matches = await User.find({ email: existing.email.toLowerCase() });
		expect(matches.length).toBe(1);
	});

	it('rejects an artistId that does not exist', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{
				query: CREATE_BOOKING_REQUEST,
				variables: { bookingRequestInput: bookingInput('507f1f77bcf86cd799439011') },
			},
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);

		// createBookingRequest(...): BookingRequest! is non-null in the schema, so a thrown resolver
		// error nulls out `data` itself, not just `data.createBookingRequest` - same rule noted in
		// test/integration/auth.test.js.
		// This throws `new UserInputError('Errors', { errors: { artistId: 'Artist not found' } })`
		// - same convention as register/login's validation errors - so the human-readable detail
		// lives at errors[0].extensions.errors.artistId, not errors[0].message (which is literally
		// the string "Errors").
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.artistId).toMatch(/Artist not found/);
	});

	it('rejects a blank description', async () => {
		const { user: artistUser } = await createArtistUser();
		const server = createTestServer();
		const response = await server.executeOperation(
			{
				query: CREATE_BOOKING_REQUEST,
				variables: { bookingRequestInput: bookingInput(artistUser.id, { description: '' }) },
			},
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);

		const { data } = response.body.singleResult;
		expect(data).toBeNull();
	});

	it('rate-limits at 5 submissions/hour from the same IP', async () => {
		const { user: artistUser } = await createArtistUser();
		const server = createTestServer();
		const ip = fakeIp();

		for (let i = 0; i < 5; i++) {
			const response = await server.executeOperation(
				{ query: CREATE_BOOKING_REQUEST, variables: { bookingRequestInput: bookingInput(artistUser.id) } },
				{ contextValue: { req: { headers: {}, ip } } },
			);
			expect(response.body.singleResult.errors).toBeUndefined();
		}

		const sixthResponse = await server.executeOperation(
			{ query: CREATE_BOOKING_REQUEST, variables: { bookingRequestInput: bookingInput(artistUser.id) } },
			{ contextValue: { req: { headers: {}, ip } } },
		);

		const { errors, data } = sixthResponse.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Too many booking requests/);
	});
});

describe('guest token flow: getBookingRequestByToken + sendGuestMessage', () => {
	async function submitBookingRequest(artistUserId) {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: CREATE_BOOKING_REQUEST, variables: { bookingRequestInput: bookingInput(artistUserId) } },
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);
		const bookingRequestId = response.body.singleResult.data.createBookingRequest.id;
		const stored = await BookingRequest.findById(bookingRequestId);
		return stored;
	}

	it('lets a guest fetch their own request by token', async () => {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_BOOKING_REQUEST_BY_TOKEN, variables: { token: bookingRequest.guestToken } },
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getBookingRequestByToken.id).toBe(bookingRequest.id);
	});

	it('rejects an invalid/unknown token', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: GET_BOOKING_REQUEST_BY_TOKEN, variables: { token: 'not-a-real-token' } },
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getBookingRequestByToken).toBeNull();
		expect(errors[0].message).toMatch(/Invalid or expired link/);
	});

	it('lets a guest post a message via their token', async () => {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: SEND_GUEST_MESSAGE, variables: { token: bookingRequest.guestToken, message: 'When are you free?' } },
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.sendGuestMessage.message).toBe('When are you free?');
	});

	// The core security property of the whole guest-token design: once the underlying account has
	// a real password, the magic link must stop working - otherwise anyone who intercepted the
	// original notification email retains permanent, password-free access.
	it('revokes the guest token once the underlying account has set a real password', async () => {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);

		const client = await Client.findById(bookingRequest.clientId);
		await User.findByIdAndUpdate(client.userId, { hasSetPassword: true });

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: SEND_GUEST_MESSAGE, variables: { token: bookingRequest.guestToken, message: 'Still there?' } },
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);

		// sendGuestMessage(...): Message! is non-null in the schema, so a thrown resolver error
		// nulls out `data` itself, not just `data.sendGuestMessage`.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/no longer valid/);
	});

	it('rate-limits sendGuestMessage at 30/hour per token', async () => {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();

		for (let i = 0; i < 30; i++) {
			const response = await server.executeOperation(
				{ query: SEND_GUEST_MESSAGE, variables: { token: bookingRequest.guestToken, message: `Message ${i}` } },
				{ contextValue: { req: { headers: {}, ip: fakeIp() } } }, // fresh IP each time - isolates the token-level limit
			);
			expect(response.body.singleResult.errors).toBeUndefined();
		}

		const response = await server.executeOperation(
			{ query: SEND_GUEST_MESSAGE, variables: { token: bookingRequest.guestToken, message: 'One too many' } },
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Too many messages sent/);
	});
});

describe('convertBookingRequest', () => {
	async function submitBookingRequest(artistUserId, overrides = {}) {
		const server = createTestServer();
		const response = await server.executeOperation(
			{
				query: CREATE_BOOKING_REQUEST,
				variables: { bookingRequestInput: bookingInput(artistUserId, overrides) },
			},
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);
		return BookingRequest.findById(response.body.singleResult.data.createBookingRequest.id);
	}

	it('rejects an artist who is not the one this request was addressed to', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CONVERT_BOOKING_REQUEST, variables: { bookingRequestId: bookingRequest.id, outcome: 'declined' } },
			{ contextValue: contextWithToken(signTestToken(otherArtist)) },
		);

		// convertBookingRequest(...): BookingRequest! is non-null in the schema, so a thrown
		// resolver error nulls out `data` itself, not just `data.convertBookingRequest`.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('marks the request declined without creating an Appointment', async () => {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CONVERT_BOOKING_REQUEST, variables: { bookingRequestId: bookingRequest.id, outcome: 'declined' } },
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.convertBookingRequest.status).toBe('declined');
		expect(data.convertBookingRequest.resultingAppointmentId).toBeNull();
	});

	it('converts to session_booked: creates a real Appointment with a derived appointmentType', async () => {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: {
					bookingRequestId: bookingRequest.id,
					outcome: 'session_booked',
					appointmentInput: { appointmentDate: new Date().toISOString(), appointmentStatus: 'scheduled' },
					// Required for session_booked (see the resolver's own projectTitle check) - this
					// test previously omitted it, and CONVERT_BOOKING_REQUEST didn't even declare a
					// $projectTitle variable, so this was passing "by accident": the resolver would
					// have thrown a UserInputError for a missing project title had this actually run
					// against a real database. Found while fixing the query to add $projectTitle for
					// the new shopId regression test below - fixed here too rather than leave a test
					// that doesn't actually exercise what it claims to.
					projectTitle: 'Regression test project',
				},
			},
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.convertBookingRequest.status).toBe('session_booked');
		expect(data.convertBookingRequest.resultingAppointmentId).toEqual(expect.any(String));

		const appointment = await Appointment.findById(data.convertBookingRequest.resultingAppointmentId);
		expect(appointment.appointmentType).toBe('session');
		// Regression: convertBookingRequest used to set Appointment.userId to the *client's*
		// userId instead of the artist's - see that resolver's own comment on why. Every other
		// consumer of Appointment.userId (getAppointmentsByArtist, getAppointmentsByShop,
		// loadOwnedAppointment) treats it as the artist, so a wrong value here meant a converted
		// booking request could never show up on the artist's own calendar or dashboard even
		// though the BookingRequest/Appointment documents both existed.
		expect(String(appointment.userId)).toBe(String(artistUser.id));
		// Regression: Appointment.title was never set at all for a session_booked outcome -
		// ibCalendar/Day.jsx's template string then interpolated the resulting null as the
		// literal text "null". Now derived from the just-created Project's own title.
		expect(appointment.title).toBe('Regression test project');
		// Regression: bookingRequestId was never stamped onto the Appointment at all, so there was
		// no way back from an Appointment to the BookingRequest that produced it (needed for
		// ConsultDetail.jsx's "Convert to Session" action on a consult).
		expect(String(appointment.bookingRequestId)).toBe(String(bookingRequest.id));
	});

	it('derives Appointment.shopId from the artist\'s own shop when converting a booking request', async () => {
		const { shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser({ artist: { shopId: shop._id } });
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: {
					bookingRequestId: bookingRequest.id,
					outcome: 'session_booked',
					appointmentInput: { appointmentDate: new Date().toISOString(), appointmentStatus: 'scheduled' },
					projectTitle: 'Regression test project',
				},
			},
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();

		// Regression: shopId was never set at all on the resulting Appointment, for either this
		// mutation's caller (the appointment wizard) or the pre-existing ArtistBookingRequests
		// dashboard - neither ever sends one. IBCalendar.jsx exclusively queries
		// getAppointmentsByShop (filtered on Appointment.shopId) once an artist belongs to a shop,
		// so a converted booking request was invisible on a shop-affiliated artist's calendar
		// regardless of the userId fix above. Derived server-side here from the artist's own
		// Artist.shopId record instead of trusting either client to remember to pass it.
		const appointment = await Appointment.findById(data.convertBookingRequest.resultingAppointmentId);
		expect(String(appointment.shopId)).toBe(String(shop._id));
	});

	it('derives Appointment.title from the client\'s name for a consult_booked outcome', async () => {
		const { user: artistUser } = await createArtistUser();
		// bookingInput's default firstName/lastName is 'Arya'/'Stark' (see that helper above).
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: {
					bookingRequestId: bookingRequest.id,
					outcome: 'consult_booked',
					appointmentInput: { appointmentDate: new Date().toISOString(), appointmentStatus: 'scheduled' },
				},
			},
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();

		// Regression: a consult Appointment never had a title at all (unlike a session, which at
		// least had a Project to borrow one from) - ibCalendar/Day.jsx's template string then
		// showed the literal text "null". A consult has no Project to derive from, so this falls
		// back to the client's own name instead. description is also copied from the
		// BookingRequest directly, for the same "a consult has no Project to hold this otherwise"
		// reason - see ConsultDetail.jsx, which reads it back via bookingRequestId instead.
		const appointment = await Appointment.findById(data.convertBookingRequest.resultingAppointmentId);
		expect(appointment.title).toBe('Arya Stark');
		expect(appointment.description).toBe(bookingRequest.description);
		expect(String(appointment.bookingRequestId)).toBe(String(bookingRequest.id));
	});

	it('lets a consult_booked request progress to session_booked, creating a Project', async () => {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();
		const token = signTestToken(artistUser);

		const consultResponse = await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: {
					bookingRequestId: bookingRequest.id,
					outcome: 'consult_booked',
					appointmentInput: { appointmentDate: new Date().toISOString(), appointmentStatus: 'scheduled' },
				},
			},
			{ contextValue: contextWithToken(token) },
		);
		expect(consultResponse.body.singleResult.errors).toBeUndefined();
		expect(consultResponse.body.singleResult.data.convertBookingRequest.status).toBe('consult_booked');

		// The consult happened, the client wants to move forward - this is the "Book Session"
		// action on an already consult_booked request (ArtistBookingRequests.jsx), not a fresh
		// booking request. Should be allowed to progress rather than rejected as already-handled.
		const sessionResponse = await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: {
					bookingRequestId: bookingRequest.id,
					outcome: 'session_booked',
					appointmentInput: { appointmentDate: new Date().toISOString(), appointmentStatus: 'scheduled' },
					projectTitle: 'Sleeve piece',
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = sessionResponse.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.convertBookingRequest.status).toBe('session_booked');
		const appointment = await Appointment.findById(data.convertBookingRequest.resultingAppointmentId);
		expect(appointment.appointmentType).toBe('session');
		expect(appointment.projectId).toBeTruthy();
	});

	it('lets a consult_booked request be marked not_booked without creating an Appointment', async () => {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();
		const token = signTestToken(artistUser);

		await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: {
					bookingRequestId: bookingRequest.id,
					outcome: 'consult_booked',
					appointmentInput: { appointmentDate: new Date().toISOString(), appointmentStatus: 'scheduled' },
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const response = await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: { bookingRequestId: bookingRequest.id, outcome: 'not_booked' },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.convertBookingRequest.status).toBe('not_booked');
		// Asserts what the test name actually claims - that no SECOND appointment was created.
		//
		// This previously asserted resultingAppointmentId was null, which fails and should: the
		// consult booked in the first call is a real appointment that really happened, and
		// not_booked means "had a consult, went cold" (as distinct from declined, which is
		// "turned down before any consult" - see models/BookingRequest.js). Erasing the link
		// would orphan the record of a consult that took place, and would lose exactly the
		// information that distinguishes those two outcomes.
		expect(await Appointment.countDocuments({ bookingRequestId: bookingRequest._id })).toBe(1);
	});

	it('rejects converting an already-terminal booking request (e.g. re-converting a declined one)', async () => {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();
		const token = signTestToken(artistUser);

		await server.executeOperation(
			{ query: CONVERT_BOOKING_REQUEST, variables: { bookingRequestId: bookingRequest.id, outcome: 'declined' } },
			{ contextValue: contextWithToken(token) },
		);

		const response = await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: {
					bookingRequestId: bookingRequest.id,
					outcome: 'session_booked',
					appointmentInput: { appointmentDate: new Date().toISOString(), appointmentStatus: 'scheduled' },
					projectTitle: 'Should not be created',
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(errors[0].message).toMatch(/Errors/);
	});

	it('rejects not_booked on a request that never had a consult', async () => {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();

		// not_booked only makes sense following an actual consult - a still-pending request should
		// use 'declined' instead. See the resolver's VALID_OUTCOMES_BY_STATUS guard.
		const response = await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: { bookingRequestId: bookingRequest.id, outcome: 'not_booked' },
			},
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors } = response.body.singleResult;
		expect(errors).toBeDefined();
	});

	it('a shop admin at the artist\'s own shop can convert a request that isn\'t theirs', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		// The connection is what makes this artist theirs. Without it the same call is now
		// refused - a shop admin is an admin of one shop, not of the platform.
		await connectArtistToShop(artistUser.id, shop.id);
		const bookingRequest = await submitBookingRequest(artistUser.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CONVERT_BOOKING_REQUEST, variables: { bookingRequestId: bookingRequest.id, outcome: 'declined' } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.convertBookingRequest.status).toBe('declined');
	});
});

describe('getBookingRequests', () => {
	it('defaults a submission to source: public_form when the caller sends none', async () => {
		const { user: artistUser } = await createArtistUser();
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: CREATE_BOOKING_REQUEST, variables: { bookingRequestInput: bookingInput(artistUser.id) } },
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);
		const bookingRequest = await BookingRequest.findById(
			response.body.singleResult.data.createBookingRequest.id,
		);
		expect(bookingRequest.source).toBe('public_form');
	});

	// Regression: AppointmentWizard.jsx (an artist scheduling a consult/session directly from
	// their own calendar) reuses this exact createBookingRequest/convertBookingRequest pipeline,
	// which used to mean it also showed up in this same artist's "Booking Requests" inbox -
	// confusing, since it was never a real inbound request from anyone. Excluded here via the new
	// source field (see BookingRequest.js's own comment).
	it('only returns source: public_form requests, excluding artist_created ones', async () => {
		const { user: artistUser } = await createArtistUser();
		const server = createTestServer();

		await server.executeOperation(
			{
				query: CREATE_BOOKING_REQUEST,
				variables: { bookingRequestInput: bookingInput(artistUser.id, { source: 'public_form' }) },
			},
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);
		await server.executeOperation(
			{
				query: CREATE_BOOKING_REQUEST,
				variables: { bookingRequestInput: bookingInput(artistUser.id, { source: 'artist_created' }) },
			},
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);

		const response = await server.executeOperation(
			{ query: GET_BOOKING_REQUESTS, variables: { artistId: artistUser.id } },
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getBookingRequests).toHaveLength(1);
		expect(data.getBookingRequests[0].source).toBe('public_form');
	});
});

// Converting a consult into a session means the consult HAPPENED. Nothing used to record that:
// the consult stayed 'scheduled' at its originally-booked date, which left it sitting in the
// artist's upcoming list as a meeting they had already had - and, because utils/analytics.js
// buckets by appointmentDate, dated its deposit revenue to a period the money wasn't earned in.
describe('convertBookingRequest: closing out the consult', () => {
	// Local copy rather than the identically-named helpers inside the two describe blocks above:
	// those are scoped to their own blocks and are not visible here. fakeIp/bookingInput ARE
	// module-level, so only the submit step needs repeating.
	async function submitRequest(artistUserId) {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: CREATE_BOOKING_REQUEST, variables: { bookingRequestInput: bookingInput(artistUserId) } },
			{ contextValue: { req: { headers: {}, ip: fakeIp() } } },
		);
		return BookingRequest.findById(response.body.singleResult.data.createBookingRequest.id);
	}

	// Books a consult for `daysOut` days from now, then converts that same request to a session.
	// Returns the consult document as it stands afterwards.
	async function consultThenSession(daysOut) {
		const { user: artistUser } = await createArtistUser();
		const bookingRequest = await submitRequest(artistUser.id);
		const server = createTestServer();
		const asArtist = { contextValue: contextWithToken(signTestToken(artistUser)) };

		const consultDate = new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000);
		const consultRes = await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: {
					bookingRequestId: bookingRequest.id,
					outcome: 'consult_booked',
					appointmentInput: {
						appointmentDate: consultDate.toISOString(),
						appointmentStatus: 'scheduled',
					},
				},
			},
			asArtist,
		);
		expect(consultRes.body.singleResult.errors).toBeUndefined();
		const consultId = consultRes.body.singleResult.data.convertBookingRequest.resultingAppointmentId;

		const sessionRes = await server.executeOperation(
			{
				query: CONVERT_BOOKING_REQUEST,
				variables: {
					bookingRequestId: bookingRequest.id,
					outcome: 'session_booked',
					appointmentInput: {
						appointmentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
						appointmentStatus: 'scheduled',
					},
					projectTitle: 'Sleeve',
				},
			},
			asArtist,
		);
		expect(sessionRes.body.singleResult.errors).toBeUndefined();

		return {
			consult: await Appointment.findById(consultId),
			consultDate,
			sessionId: sessionRes.body.singleResult.data.convertBookingRequest.resultingAppointmentId,
			artistUser,
			server,
		};
	}

	it('marks the consult completed', async () => {
		const { consult } = await consultThenSession(7);
		expect(consult.appointmentStatus).toBe('completed');
	});

	it('pulls a future-dated consult back to the conversion moment', async () => {
		// The consult was booked a week out but the conversion is happening now, so the meeting
		// happened now. This is the money-correctness half: a deposit is recorded against this
		// consult, and analytics buckets by appointmentDate - leaving it a week out would book
		// this month's revenue into next month.
		const before = Date.now();
		const { consult, consultDate } = await consultThenSession(7);
		const after = Date.now();

		expect(consult.appointmentDate.getTime()).toBeLessThan(consultDate.getTime());
		expect(consult.appointmentDate.getTime()).toBeGreaterThanOrEqual(before);
		expect(consult.appointmentDate.getTime()).toBeLessThanOrEqual(after);
	});

	it('leaves a past-dated consult where it was', async () => {
		// The mirror image, and the reason this only ever moves the date backward. A consult held
		// last week and only converted today really did happen last week; rewriting it to today
		// would move revenue OUT of the period it belongs to - the same bug, pointed the other way.
		const { consult, consultDate } = await consultThenSession(-7);
		expect(consult.appointmentStatus).toBe('completed');
		expect(consult.appointmentDate.getTime()).toBe(consultDate.getTime());
	});

	it('does not close out the new session', async () => {
		// resultingAppointmentId is overwritten to point at the session, so a guard that only
		// looked at "the request's resulting appointment" would close out the session on a second
		// conversion. The session is in the future and hasn't happened.
		const { sessionId } = await consultThenSession(7);
		const session = await Appointment.findById(sessionId);
		expect(session.appointmentType).toBe('session');
		expect(session.appointmentStatus).toBe('scheduled');
	});

	it('keeps the converted consult out of the upcoming list', async () => {
		// The point of the whole thing, asserted through the query the dashboard actually calls.
		const { artistUser, server } = await consultThenSession(7);

		const response = await server.executeOperation(
			{
				query: `
					query Upcoming($userId: ID!) {
						getAppointmentsByArtist(userId: $userId, filter: { upcomingOnly: true }) {
							items { id appointmentType appointmentStatus }
						}
					}
				`,
				variables: { userId: artistUser.id },
			},
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		const types = data.getAppointmentsByArtist.items.map((a) => a.appointmentType);
		expect(types).toContain('session');
		expect(types).not.toContain('consult');
	});

	it('excludes a completed appointment from upcoming even when its date is still ahead', async () => {
		// Independent of the date rewrite above. A consult closed out by any other route - or one
		// whose date was never pulled back - must still not read as upcoming. Marking it completed
		// is the rule; the date change is a separate correctness fix that happens to also help.
		const { user: artistUser } = await createArtistUser();
		const server = createTestServer();
		const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
		await new Appointment({
			userId: artistUser.id,
			title: 'Already dealt with',
			appointmentType: 'consult',
			appointmentStatus: 'completed',
			appointmentDate: future,
			createdAt: new Date(),
			updatedAt: new Date(),
		}).save();

		const response = await server.executeOperation(
			{
				query: `
					query Upcoming($userId: ID!) {
						getAppointmentsByArtist(userId: $userId, filter: { upcomingOnly: true }) {
							items { id }
						}
					}
				`,
				variables: { userId: artistUser.id },
			},
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		expect(response.body.singleResult.errors).toBeUndefined();
		expect(response.body.singleResult.data.getAppointmentsByArtist.items).toHaveLength(0);
	});
});
