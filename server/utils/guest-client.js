const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Client = require('../models/Client');
const { Constants } = require('./constants');

// See PRODUCTION_ROADMAP.md's "Booking request & guest correspondence" section.
//
// Finds or creates the User + Client pair for a booking-request submission, keyed by email.
// - If a User with this email already exists, reuse it (and its Client record) rather than
//   creating a duplicate. Deliberately a simplification (same email = same person) - the same
//   tradeoff every intake-form-based tool makes; doesn't handle a shared/reused email address
//   belonging to a different real person.
// - If not, creates a new User with hasSetPassword: false - a real account (so Message.senderId
//   stays a normal, unmodified ObjectId reference - no parallel "guest sender" concept needed)
//   that's unusable for login until/unless that person ever sets a real password.
//
// NOTE on the existing-Artist/Staff-account edge case flagged in the roadmap as deferred, not
// blocking: if the matched User has no Client profile yet (e.g. it's an Artist getting tattooed
// by a colleague), this creates one attached to the existing User rather than blocking the
// booking request. That's a reasonable default, not a final decision - revisit before launch.
async function findOrCreateGuestClient({ firstName, lastName, email, phone }) {
  const normalizedEmail = email.trim().toLowerCase();
  let user = await User.findOne({ email: normalizedEmail });
  let client;

  if (user) {
    client = await Client.findOne({ userId: user._id });
    if (!client) {
      client = await new Client({
        firstName,
        lastName,
        email: normalizedEmail,
        phone: phone || '',
        userId: user._id,
      }).save();
    }
    return { user, client, isNewUser: false };
  }

  // No existing account for this email - create a real User that can never log in with a
  // password no one (including this app) knows, since it's random and immediately discarded.
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const hashedPassword = await bcrypt.hash(randomPassword, 12);

  user = await new User({
    email: normalizedEmail,
    password: hashedPassword,
    role: Constants.ROLES.CLIENT,
    userType: Constants.USER_TYPE.CLIENT,
    firstName,
    lastName,
    hasSetPassword: false,
  }).save();

  client = await new Client({
    firstName,
    lastName,
    email: normalizedEmail,
    phone: phone || '',
    userId: user._id,
  }).save();

  return { user, client, isNewUser: true };
}

module.exports = { findOrCreateGuestClient };
