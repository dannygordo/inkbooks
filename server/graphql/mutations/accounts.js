const crypto = require('crypto');
const { GraphQLError } = require('graphql');
const User = require('../../models/User');
const Artist = require('../../models/Artist');
const Staff = require('../../models/Staff');
const Client = require('../../models/Client');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const withAuth = require('../../utils/with-auth');
const { assertCanAccessShop, linkClientToUsersShops } = require('../../utils/shop-membership');
const { Constants } = require('../../utils/constants');
const { UserInputError } = require('../../utils/errors');
const { issuePasswordToken, generateUnusablePassword } = require('../../utils/password-tokens');
const { sendAccountInviteEmail, buildSetPasswordLink } = require('../../utils/email');
const { pickDefaultTagColor } = require('../../utils/tag-color');
const { findOrCreateGuestClient } = require('../../utils/guest-client');
const Shop = require('../../models/Shop');

/**
 * Account creation for the three wizards.
 *
 * Every one of these creates a User alongside the profile record, which nothing did before:
 * createArtist and createStaff took a `userId` and expected one to already exist, and no UI ever
 * created one - which is why every "Add" button in this app pointed at a route that didn't exist.
 *
 * ARTISTS AND STAFF GET AN INVITE, CLIENTS DON'T. An artist or staff member needs to log in, so
 * they get a random unusable password and an emailed link to set a real one. A client added by a
 * shop is usually someone who walked in for a consult; they get the same silent account the
 * booking flow already creates, and can claim it later through the normal reset flow if they ever
 * need the dashboard. Emailing a login to someone who just booked a tattoo is noise.
 *
 * NO SHARED DEFAULT PASSWORD anywhere here. See utils/password-tokens.js's
 * generateUnusablePassword for why: a fixed string means every unclaimed account is open to
 * anyone who has seen it.
 */

// Usernames are `required` and `unique` on User but nothing in the app displays one, and no
// wizard should ask a shop admin to invent one. Derived from the email's local part with a random
// suffix, which keeps it human-readable in the database without risking a collision.
function deriveUsername(email) {
  const localPart = String(email).split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 20);
  return `${localPart || 'user'}_${crypto.randomBytes(4).toString('hex')}`;
}

async function assertEmailAvailable(email) {
  const existing = await User.findOne({ email });
  if (existing) {
    // Named plainly rather than obscured. This is an authenticated shop admin adding someone to
    // their own shop, not a public signup form - "that address is already in use" is the useful
    // answer here, and the account-enumeration concern that shapes requestPasswordReset doesn't
    // apply to a caller who can already list every user at their shop.
    throw new UserInputError('Errors', {
      errors: { email: 'An account already exists for that email address.' },
    });
  }
}

/**
 * Creates the User, issues an invite token, and sends the email.
 *
 * Returns the raw invite link alongside the created records. That's deliberate and worth being
 * explicit about: utils/email.js no-ops when the provider isn't configured, so an invite can
 * "succeed" while no email is ever sent. Handing the link back lets the wizard show it, which is
 * the difference between a shop admin who can paste it into a text message and one who is left
 * wondering why the new hire never got anything.
 */
async function createUserWithInvite({ firstName, lastName, email, role, userType, shopId, createdBy }) {
  const password = await generateUnusablePassword();
  const tagColor = await pickDefaultTagColor(shopId, null);

  const user = await new User({
    username: deriveUsername(email),
    email,
    password,
    role,
    userType,
    firstName,
    lastName,
    tagColor,
    // The account isn't claimed until someone redeems the invite. This also means any guest
    // magic-link logic treats it correctly, and it's what the invite flips (see
    // utils/password-tokens.js's consumePasswordToken).
    hasSetPassword: false,
  }).save();

  const { rawToken, expiresAt } = await issuePasswordToken({
    userId: user.id,
    purpose: 'invite',
    createdBy,
  });

  const shop = shopId ? await Shop.findById(shopId).select('name') : null;
  // Best-effort, matching every other send in this codebase - a failed or unconfigured email
  // must not roll back an account that was otherwise created correctly. The returned link is the
  // fallback.
  try {
    await sendAccountInviteEmail({
      to: email,
      firstName,
      shopName: shop?.name,
      rawToken,
      expiresAt,
    });
  } catch (err) {
    console.error('[accounts] Invite email failed:', err.message);
  }

  return { user, inviteLink: buildSetPasswordLink(rawToken) };
}

module.exports = {
  /**
   * Artist + User, connected to the creating admin's shop.
   *
   * The ArtistShopConnection is created here rather than left as a follow-up step because an
   * artist with no connection is invisible to almost everything - the shop calendar, the artist
   * directory, shop analytics and the shop-cut ledger all resolve membership through it. Creating
   * an artist who then doesn't appear anywhere would read as the wizard having failed.
   */
  createArtistAccount: withAuth(
    async (_, { input }, context, info, user) => {
      try {
        const email = String(input.email || '').trim().toLowerCase();
        if (!email || !input.firstName || !input.lastName) {
          throw new UserInputError('Errors', {
            errors: { email: 'First name, last name and email are required.' },
          });
        }
        await assertEmailAvailable(email);

        const shopId = input.shopId || null;
        // Creating an artist attaches them to shopId and gives them a tag colour there. Without
        // this a shop admin could plant a working account, with an invite link they hold, on
        // someone else's shop calendar.
        await assertCanAccessShop(user, shopId);
        const { user: newUser, inviteLink } = await createUserWithInvite({
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          role: Constants.ROLES.ARTIST,
          userType: Constants.USER_TYPE.ARTIST,
          shopId,
          createdBy: user.id,
        });

        const artist = await new Artist({
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          title: input.title || '',
          phone: input.phone || '',
          instagram: input.instagram || '',
          facebook: input.facebook || '',
          hourlyRate: input.hourlyRate,
          shopId,
          userId: newUser._id,
          status: Constants.ARTIST_STATUS.ACTIVE,
          startDate: new Date(),
        }).save();

        if (shopId) {
          await new ArtistShopConnection({
            artistId: newUser._id,
            shopId,
            status: 'active',
          }).save();
        }

        return { artist, inviteLink };
      } catch (err) {
        if (err instanceof GraphQLError) {
          throw err;
        }
        throw new Error(err);
      }
    },
    Constants.ROLES.SHOP_ADMIN,
  ),

  /**
   * Staff + User. shopId is required by the Staff model and by the job - a staff member with no
   * shop has nothing to administer.
   */
  createStaffAccount: withAuth(
    async (_, { input }, context, info, user) => {
      try {
        const email = String(input.email || '').trim().toLowerCase();
        if (!email || !input.firstName || !input.lastName) {
          throw new UserInputError('Errors', {
            errors: { email: 'First name, last name and email are required.' },
          });
        }
        if (!input.shopId) {
          throw new UserInputError('Errors', {
            errors: { shopId: 'A staff member must belong to a shop.' },
          });
        }
        // Same reasoning as createArtistAccount - and staff are more sensitive, since the account
        // created here can read that shop's client list.
        await assertCanAccessShop(user, input.shopId);
        await assertEmailAvailable(email);

        const { user: newUser, inviteLink } = await createUserWithInvite({
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          // Staff created this way are SHOP_STAFF, never SHOP_ADMIN. Promoting someone to admin
          // is a deliberate act with different consequences (shop-wide financials, the ability to
          // create more accounts) and shouldn't be a dropdown on a create form that a shop admin
          // fills in while onboarding a receptionist.
          role: Constants.ROLES.SHOP_STAFF,
          userType: Constants.USER_TYPE.STAFF,
          shopId: input.shopId,
          createdBy: user.id,
        });

        const staff = await new Staff({
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone: input.phone || '',
          title: input.title || '',
          instagram: input.instagram || '',
          facebook: input.facebook || '',
          userId: newUser._id,
          shopId: input.shopId,
          status: Constants.STAFF_STATUS.ACTIVE,
        }).save();

        return { staff, inviteLink };
      } catch (err) {
        if (err instanceof GraphQLError) {
          throw err;
        }
        throw new Error(err);
      }
    },
    Constants.ROLES.SHOP_ADMIN,
  ),

  /**
   * Client + User, no invite.
   *
   * Reuses findOrCreateGuestClient - the same find-or-create the public booking form already
   * runs - rather than a parallel implementation. That means adding a client who has booked
   * before reuses their existing account instead of failing on the unique-email constraint,
   * which is the common case in a shop: someone books online, then walks in, and a receptionist
   * adds them by hand not knowing they're already there.
   *
   * Staff-and-above rather than shop-admin: adding a walk-in client is front-desk work.
   */
  createClientAccount: withAuth(
    async (_, { input }, context, info, user) => {
      try {
        const email = String(input.email || '').trim().toLowerCase();
        if (!email || !input.firstName || !input.lastName) {
          throw new UserInputError('Errors', {
            errors: { email: 'First name, last name and email are required.' },
          });
        }

        const { client, isNewUser } = await findOrCreateGuestClient({
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone: input.phone,
        });
        // This is what makes a brand new walk-in editable. Without it the shop that just created
        // the record has no relationship to it until a project exists, so a receptionist couldn't
        // correct a typo in the email they'd just typed - see canAccessClient.
        await linkClientToUsersShops(client._id, user.id);

        // The remaining fields aren't part of the booking-flow shape, so they're applied after.
        const extras = {};
        ['address', 'city', 'state', 'zip', 'instagram', 'facebook'].forEach((field) => {
          if (input[field]) {
            extras[field] = input[field];
          }
        });
        const updated = Object.keys(extras).length
          ? await Client.findByIdAndUpdate(client._id, extras, { new: true })
          : client;

        // isNewUser is surfaced so the wizard can say "this client already existed and has been
        // updated" rather than silently implying it created something. A receptionist adding a
        // duplicate should find out.
        return { client: updated, isNewAccount: isNewUser };
      } catch (err) {
        if (err instanceof GraphQLError) {
          throw err;
        }
        throw new Error(err);
      }
    },
    Constants.ROLES.SHOP_STAFF,
  ),
};
