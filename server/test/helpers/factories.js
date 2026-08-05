// Direct-to-Mongoose fixture builders for tests - deliberately bypass the register/login
// mutations for speed (bcrypt hashing is slow, and most tests don't care about password auth
// specifically - test/integration/auth.test.js is the one place that exercises the real mutations
// end to end). Every field defaults to something valid so a test only has to override what it
// actually cares about.
const User = require('../../models/User');
const Artist = require('../../models/Artist');
const Client = require('../../models/Client');
const Staff = require('../../models/Staff');
const Shop = require('../../models/Shop');
const Project = require('../../models/Project');
const Appointment = require('../../models/Appointment');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const BookingRequest = require('../../models/BookingRequest');
const mongoose = require('mongoose');
const { Constants } = require('../../utils/constants');

let counter = 0;
function unique(prefix) {
	counter += 1;
	return `${prefix}${Date.now()}${counter}`;
}

async function createUser(overrides = {}) {
	const user = new User({
		username: unique('user'),
		email: `${unique('user')}@example.com`,
		// Never actually checked in most tests (they auth via a signed JWT, not a real login) -
		// a fixed bcrypt-shaped placeholder is fine; auth.test.js sets a real hashed password
		// itself when it specifically needs to exercise bcrypt.compare via the login mutation.
		password: 'not-a-real-hash',
		role: Constants.ROLES.CLIENT,
		userType: Constants.USER_TYPE.CLIENT,
		firstName: 'Test',
		lastName: 'User',
		hasSetPassword: true,
		...overrides,
	});
	return user.save();
}

async function createArtistUser(overrides = {}) {
	const user = await createUser({
		role: Constants.ROLES.ARTIST,
		userType: Constants.USER_TYPE.ARTIST,
		...overrides,
	});
	const artist = await new Artist({
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
		userId: user._id,
		status: Constants.ARTIST_STATUS.ACTIVE,
		...overrides.artist,
	}).save();
	return { user, artist };
}

async function createShopAdminUser(overrides = {}) {
	const shop = await new Shop({
		name: unique('Shop'),
		email: `${unique('shop')}@example.com`,
		...overrides.shop,
	}).save();
	const user = await createUser({
		role: Constants.ROLES.SHOP_ADMIN,
		userType: Constants.USER_TYPE.STAFF,
		...overrides,
	});
	const staff = await new Staff({
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
		userId: user._id,
		shopId: shop._id,
		// Constants.STAFF_STATUS.ACTIVE. This was a bare `1` with a comment explaining that Staff
		// had no named statuses - it does now, added with archiving (see utils/archiving.js).
		status: Constants.STAFF_STATUS.ACTIVE,
		...overrides.staff,
	}).save();
	return { user, staff, shop };
}

// Unlike createShopAdminUser (which creates its own new Shop), this attaches to a shopId the
// caller already has - needed for tests that check "a genuine SHOP_STAFF-role staff member of
// *this* shop", not "a SHOP_ADMIN, who's already privileged enough to pass any shop-admin-or-
// better check regardless of which shop is involved".
async function createStaffUser(shopId, overrides = {}) {
	const user = await createUser({
		role: Constants.ROLES.SHOP_STAFF,
		userType: Constants.USER_TYPE.STAFF,
		...overrides,
	});
	const staff = await new Staff({
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
		userId: user._id,
		shopId,
		status: Constants.STAFF_STATUS.ACTIVE,
		...overrides.staff,
	}).save();
	return { user, staff };
}

async function createClientUser(overrides = {}) {
	const user = await createUser({
		role: Constants.ROLES.CLIENT,
		userType: Constants.USER_TYPE.CLIENT,
		...overrides,
	});
	const client = await new Client({
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
		userId: user._id,
		// Deliberately no shopIds by default. A client with no shop link is the harder case for
		// every access check (it's what a brand-new record looks like before anything ties it to a
		// shop), so tests that want the link have to ask for it - `{ client: { shopIds: [shop._id] } }`
		// - rather than getting it for free and never exercising the other path.
		...overrides.client,
	}).save();
	return { user, client };
}

// artistId is the artist's own User._id, not the Artist collection's own _id - matching the
// convention documented in models/ArtistShopConnection.js.
async function connectArtistToShop(artistUserId, shopId, overrides = {}) {
	return new ArtistShopConnection({
		artistId: artistUserId,
		shopId,
		status: 'active',
		...overrides,
	}).save();
}

// BookingRequest requires conversationId and guestToken alongside the obvious fields - both are
// real requirements of the guest-intake flow (see models/BookingRequest.js) and neither has a
// default, so a test building one by hand silently fails validation on save. Generating throwaway
// values here keeps that detail in one place rather than in every test that needs a consult with
// a client attached.
async function createBookingRequest(artistUserId, clientId, overrides = {}) {
	return new BookingRequest({
		artistId: artistUserId,
		clientId,
		conversationId: new mongoose.Types.ObjectId(),
		guestToken: unique('token'),
		description: 'Test booking request',
		status: 'consult_booked',
		source: 'artist_created',
		...overrides,
	}).save();
}

async function createProject(artistId, clientId, overrides = {}) {
	return new Project({
		title: unique('Project'),
		description: 'Test project',
		artistId,
		clientId,
		// Real, validation-enforced values (see createProjectInputSchema in utils/validation.js) -
		// Constants.PROJECT_STATUS (numeric) is a separate, unrelated legacy constant that isn't
		// actually what this field validates against; don't use it here.
		status: 'in_progress',
		...overrides,
	}).save();
}

async function createAppointment(userId, overrides = {}) {
	const now = new Date();
	return new Appointment({
		appointmentDate: now,
		userId,
		title: unique('Appointment'),
		appointmentType: 'session',
		appointmentStatus: 'scheduled',
		shopCutStatus: 'none',
		createdAt: now,
		updatedAt: now,
		...overrides,
	}).save();
}

module.exports = {
	createUser,
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	createClientUser,
	connectArtistToShop,
	createProject,
	createAppointment,
	createBookingRequest,
};
