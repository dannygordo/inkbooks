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
const { createArtistUser, createUser, createShopAdminUser } = require('../helpers/factories');
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
	mutation ConvertBookingRequest($bookingRequestId: ID!, $outcome: String!, $appointmentInput: AppointmentInput) {
		convertBookingRequest(bookingRequestId: $bookingRequestId, outcome: $outcome, appointmentInput: $appointmentInput) {
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
	async function submitBookingRequest(artistUserId) {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: CREATE_BOOKING_REQUEST, variables: { bookingRequestInput: bookingInput(artistUserId) } },
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

	it('a SHOP_ADMIN-or-better user can convert a request that isn\'t theirs', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: shopAdmin } = await createShopAdminUser();
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
