const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Client = require('../models/Client');
const Appointment = require('../models/Appointment');
const Project = require('../models/Project');

/**
 * Erasure requests: remove who somebody was, keep what was transacted.
 *
 * This is NOT deletion, and the difference is the whole design. A shop has a legal obligation to
 * retain transaction records for tax, and a competing obligation under GDPR/CCPA to erase personal
 * data on request. Those pull in opposite directions, and deleting the row satisfies neither -
 * it destroys the financial record AND leaves the person's name on every appointment title,
 * message and project that referenced it.
 *
 * So: identity fields are overwritten in place; every row, every id and every amount stays exactly
 * where it was. An appointment that took $400 still took $400, still counts toward the shop's
 * revenue, and still reconciles against its Square invoice - it just no longer says who it was
 * for.
 *
 * IRREVERSIBLE, unlike archiving. There is no unredact: the values are overwritten, not flagged.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT TOUCH, AND WHY THAT IS A DECISION FOR A HUMAN
 *
 * Message bodies and BookingRequest.description are left intact. They are free text the person
 * wrote, so under GDPR they are arguably their personal data - but they are also one half of a
 * two-party conversation, and blanking them destroys the artist's record of what was agreed about
 * work that was actually done. Erasing them may be required in some jurisdictions; keeping them
 * may be defensible under legitimate interest. That is a legal call, not an engineering one, and
 * nothing here should be read as advice that this function makes a shop compliant.
 *
 * If the answer turns out to be "erase those too", the hook is redactClient below - the mechanism
 * is built, the scope is what needs deciding.
 * ---------------------------------------------------------------------------------------------
 */

// Overwritten identity values. A fixed string rather than an empty one so a redacted record reads
// as deliberately erased rather than as broken or half-migrated data.
const REDACTED_NAME = 'Redacted';

/**
 * A unique, non-routable placeholder.
 *
 * Both Client.email and User.email/username are UNIQUE. Writing a constant would work exactly once
 * and then throw a duplicate-key error on the second erasure - which would surface as a failed
 * legal request, at the worst possible moment. `.invalid` is the RFC 2606 reserved TLD, so this
 * can never accidentally reach a real mailbox.
 */
function redactedEmail() {
  return `redacted-${crypto.randomBytes(12).toString('hex')}@redacted.invalid`;
}

function redactedUsername() {
  return `redacted-${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Erases a client's identity, everywhere it was copied.
 *
 * Returns a summary of what was touched, so the caller can record that the request was carried out
 * - which is itself usually a compliance requirement.
 */
async function redactClient(client) {
  const user = client.userId ? await User.findById(client.userId) : null;

  // 1. The Client record itself. shopIds, status and _id survive: they carry no personal data and
  //    every Project/Appointment in the system points at this _id.
  await Client.updateOne(
    { _id: client._id },
    {
      $set: {
        firstName: REDACTED_NAME,
        lastName: '',
        email: redactedEmail(),
        phone: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        instagram: '',
        facebook: '',
        avatar: '',
        // Shop-side notes are written ABOUT this person - "cancels a lot", "needed a break every
        // twenty minutes". They describe them as directly as their name does.
        notes: [],
      },
    },
  );

  // 2. The User account behind them. Also made unusable: an account whose owner has asked to be
  //    forgotten should not remain loggable-into. The password is randomised and immediately
  //    discarded, so nobody - including this server - knows it.
  if (user) {
    const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          username: redactedUsername(),
          email: redactedEmail(),
          firstName: REDACTED_NAME,
          lastName: '',
          avatar: '',
          password: unusablePassword,
          hasSetPassword: true,
        },
      },
    );
  }

  // 3. Appointment titles. A consult's title is set to the client's own name at conversion (see
  //    mutations/bookingRequests.js), so the name is sitting on the calendar in plain text. Only
  //    the appointments of THIS client's projects, and only the title - every amount is untouched.
  const projectIds = await Project.distinct('_id', { clientId: client._id });
  let appointmentsRetitled = 0;
  if (projectIds.length > 0) {
    const result = await Appointment.updateMany(
      { projectId: { $in: projectIds } },
      { $set: { title: REDACTED_NAME } },
    );
    appointmentsRetitled = result.modifiedCount || 0;
  }

  return {
    clientId: String(client._id),
    userRedacted: Boolean(user),
    projectsAffected: projectIds.length,
    appointmentsRetitled,
  };
}

module.exports = { redactClient, redactedEmail, redactedUsername, REDACTED_NAME };
