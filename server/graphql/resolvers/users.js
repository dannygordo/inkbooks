const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
// See utils/check-auth.js - server/config.js is gitignored and never committed, so requiring it
// crashes anywhere the file isn't manually present (e.g. Render). Read from process.env instead,
// same mechanism MONGODB already uses.
const SECRET_KEY = process.env.SECRET_KEY;
const User = require('../../models/User');
const Artist = require('../../models/Artist');
const Client = require('../../models/Client');
const Staff = require('../../models/Staff');
const {
  loginInputSchema,
  registerInputSchema,
  changePasswordInputSchema,
  validate,
} = require('../../utils/validation');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { mintFirebaseToken } = require('../../utils/firebase-admin');
const {
  getShopIdsForUser,
  canManageArtist,
  assertCanManageArtist,
  assertCanAccessShop,
} = require('../../utils/shop-membership');
const { DEFAULT_NO_SHOP_TAG_COLOR, isUnsetTagColor, pickDefaultTagColor } = require('../../utils/tag-color');
const { findArtistsForShops } = require('../../utils/artist-shop');

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
    SECRET_KEY,
    // Explicit algorithm, not left to jsonwebtoken's default - see check-auth.js for why.
    { expiresIn: '5d', algorithm: 'HS256' },
  );
}

module.exports = {
  Mutation: {
    // login and register are the only two Mutations in this whole codebase that are
    // intentionally NOT wrapped in withAuth - they're how a session gets created in the first
    // place, so there's nothing to authenticate against yet.
    async login(_, { username, password }) {
      const { errors, valid } = validate(loginInputSchema, { username, password });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      // get user and if not found throw error
      const user = await User.findOne({ username });
      if (!user) {
        throw new UserInputError('User not found', {
          errors: {
            username: 'Username not found',
          }
        });
      }
      // if user is found make sure password entered is the same as the saved hash
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        throw new UserInputError('Invalid username/password', {
          errors: {
            password: 'Invalid username/password',
          }
        });
      }
      // Self-heals a missing/placeholder tagColor on the next real login, rather than needing a
      // one-off DB migration script (this sandbox has no way to run one against a live DB anyway -
      // mongodb-memory-server's binary download is blocked here). Fixes every account already
      // stuck at the old hardcoded '#fff' default (see register() below, and the previous
      // Register.jsx literal) the moment they next log in, without waiting for them to
      // stumble into Profile and notice their calendar events render invisibly (white on white).
      // Uses this user's first shop (Artist/Staff, legacy shopId or an active
      // ArtistShopConnection - same resolution getShopIdsForUser uses everywhere else) so the
      // assigned color is guaranteed unique among shop-mates; falls back to the fixed purple
      // default for anyone with no shop at all (an independent artist, staff with no shop - rare -
      // or a Client). See utils/tag-color.js.
      if (isUnsetTagColor(user.tagColor)) {
        const shopIds = await getShopIdsForUser(user.id);
        user.tagColor = await pickDefaultTagColor(shopIds[0], user.id);
        await user.save();
      }
      // user has been authenticated, generate token and return user object
      const token = generateToken(user);
      const firebaseToken = await mintFirebaseToken(user.id, {
        role: user.role,
        userType: user.userType,
      });
      // Resolves the profile record that matches this user's type. Three near-identical branches
      // collapsed into one lookup - the only thing that differed between them was which model to
      // query.
      //
      // The profile can legitimately be MISSING, and the previous version crashed when it was:
      // each branch did `userInfo.id = userInfo._id` on the result of a findOne with no null
      // check, so a User whose profile row doesn't exist got
      // "Cannot read properties of null" and could not log in at all. That isn't hypothetical -
      // the seeded `platformadmin` account is a User with userType STAFF and deliberately no
      // Staff record ("no Staff/Shop tie", see scripts/seed.js), so logging in as the platform
      // admin failed outright. Found by auth.test.js the first time the suite was run.
      //
      // Returning null userInfo is the honest answer: the account exists and its credentials are
      // valid, it just has no shop-side profile attached. Callers already optional-chain this
      // (user.userInfo?.shop?.id appears throughout the client).
      const profileModelByType = {
        [Constants.USER_TYPE.ARTIST]: Artist,
        [Constants.USER_TYPE.CLIENT]: Client,
        [Constants.USER_TYPE.STAFF]: Staff,
      };
      const ProfileModel = profileModelByType[user.userType];
      let userInfo = null;
      if (ProfileModel) {
        userInfo = await ProfileModel.findOne({ userId: user.id }).select('-user');
        if (userInfo) {
          // `id` is a Mongoose virtual, so it survives neither .lean() nor the spread the client
          // does on this object - set explicitly, as the original branches did.
          userInfo.id = userInfo._id;
        }
      }
      return {
        ...user._doc,
        userInfo,
        id: user._id,
        role: user.role,
        accessToken: token,
        firebaseToken: firebaseToken,
        userType: user.userType,
      };
    },
    async register(
      _,
      {
        registerInput: {
          username, password, email, firstName, lastName, avatar, confirmPassword
          // NOTE: role and userType are intentionally NOT destructured from client input here.
          // Public self-registration must never let the caller choose their own role - see
          // PRODUCTION_ROADMAP.md Phase 1, item 3. Every self-registered account is a Client.
          // tagColor is intentionally not destructured either any more - see the comment on
          // newUser below for why the client's value is never used.
        },
      },
    ) {
      const role = Constants.ROLES.CLIENT;
      const userType = Constants.USER_TYPE.CLIENT;

      const { valid, errors } = validate(registerInputSchema, {
        username, email, firstName, lastName, avatar, password, confirmPassword,
      });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      // Check to see if the email address is already in use
      const userEmail = await User.findOne({ email });
      if (userEmail) {
        throw new UserInputError('Email is already taken', {
          errors: {
            username: 'This email is taken',
          },
        });
      }
      // Check to see if the username is already in use
      const userUsername = await User.findOne({ username });
      if (userUsername) {
        throw new UserInputError('Username is already taken', {
          errors: {
            username: 'This username is taken',
          },
        });
      }
      // hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      const newUser = new User({
        email,
        firstName,
        lastName,
        avatar,
        username,
        password: hashedPassword,
        role,
        userType,
        // Was the client-supplied value - Register.jsx always hardcoded the literal string '#fff'
        // (see that file), so every self-registered account's calendar label rendered invisibly
        // (white on white) until the artist happened to open Profile and pick a real color
        // themselves. Every self-registered account is a Client with no shop (see the note above),
        // so there's no "unique among shop-mates" computation needed here - always the fixed
        // purple default. See utils/tag-color.js.
        tagColor: DEFAULT_NO_SHOP_TAG_COLOR,
      });

      // save new user to database and return user object
      const res = await newUser.save();

      // Was missing entirely - every self-registered account is Constants.USER_TYPE.CLIENT (see
      // the note above), and login()'s own switch statement unconditionally does
      // `Client.findOne({ userId: user.id })` then dereferences the result for CLIENT-type users
      // (`userInfo.id = userInfo._id`) with no null check. Without this, a self-registered user's
      // *first* session worked (this resolver's own return value stands in for it), but the
      // moment they tried to log in again for real - a new device, a cleared cache, the next day -
      // login() crashed with "Cannot read properties of null (reading '_id')" and they could never
      // get back into their own account. Found while writing a real end-to-end register-then-login
      // integration test (see test/integration/auth.test.js) - nothing previously exercised both
      // mutations back to back with a real (non-factory-seeded) Client record.
      await new Client({
        firstName,
        lastName,
        email,
        avatar,
        userId: res._id,
      }).save();

      const token = generateToken(res);
      const firebaseToken = await mintFirebaseToken(res.id, {
        role: res.role,
        userType: res.userType,
      });
      // change _id to id and add access token to the user object the return to caller
      return {
        ...res._doc,
        id: res._id,
        accessToken: token,
        firebaseToken: firebaseToken,
      };
    },
    updateUser: withAuth(async (_, args, context, info, user) => {
      try {
        const usr = args.user;
        // Was `role <= SHOP_ADMIN || self` - a shop admin could edit ANY user account on the
        // platform, including another shop's admin (role is a writable field on this input).
        // Now: the person themselves, or a shop admin at that person's own shop. Clients aren't
        // shop-affiliated and so aren't reachable here at all - they're edited through
        // updateClient (mutations/clients.js), which has its own shared-project check.
        if (user.id === usr.id || (await canManageArtist(user, usr.id))) {
          let res = await User.findByIdAndUpdate({_id: usr.id}, usr, {new: true});
          res.accessToken = 'temp_' + Date.now();
          return res;
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
          rethrow(err);
      }
    }),
    // Renamed from forgotPassword. The original version reset any user's password given only
    // their username - no proof of ownership, no email, no token. Combined with the (now also
    // fixed) unauthenticated getUsers query, that was a complete, zero-credential account
    // takeover of every user in the system. This now requires a valid session AND the caller's
    // current password. It intentionally does not help someone who is actually locked out and
    // logged out - that requires a real email-based reset token flow, which needs a
    // transactional email provider that isn't set up yet (see PRODUCTION_ROADMAP.md Phase 1,
    // item 1). Don't loosen this back to a username-only reset.
    changePassword: withAuth(async (_, { currentPassword, newPassword }, context, info, authUser) => {
      const { valid, errors } = validate(changePasswordInputSchema, { currentPassword, newPassword });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }

      const user = await User.findById(authUser.id);
      if (!user) {
        throw new AuthenticationError('User not found');
      }

      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) {
        throw new AuthenticationError('Current password is incorrect');
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      const res = await User.findByIdAndUpdate(
        { _id: user.id },
        { password: hashed },
        { new: true }
      );

      const token = generateToken(res);
      return {
        ...res._doc,
        id: res._id,
        accessToken: token,
      };
    })
  },
  Query: {
    // getUsers (every user account on the platform) was deleted, not scoped. It had no caller in
    // the client, and its only possible caller was the global admin role that no longer exists -
    // so scoping it would have meant inventing a feature to justify keeping a query that returns
    // every email address in the system. "Ungated but nobody calls it" is exactly the shape of
    // hole that survives review by looking unused.
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // userId and read that account's full record. Not called anywhere in the client (grepped -
    // every place that needs "the user behind this Staff/Artist/Client/Message" already resolves
    // it internally via its own field resolver, e.g. Staff.user in resolvers/index.js, rather
    // than going through this top-level query). Allowed: shop-admin-or-better, or the user
    // themselves.
    getUser: withAuth(async (_, { userId }, context, info, user) => {
      try {
        if (String(user.id) !== String(userId)) {
          await assertCanManageArtist(user, userId);
        }
        const foundUser = await User.findById(userId);
        if (foundUser) {
          return foundUser;
        } throw new Error('User not found');
      } catch (err) {
        rethrow(err);
      }
    }),
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // shopId and get back the user ids/tag colors of every artist and staff member there. Real
    // caller (Profile.jsx) always passes the caller's own shop id, so this now requires the
    // caller actually be affiliated with that shop (or shop-admin-or-better) - same pattern as
    // getArtistsByShop/getConversationsByShopId.
    getUserTagColors: withAuth(async (_, { shopId }, context, info, user) => {
      await assertCanAccessShop(user, shopId);
      try {
        let usrIds = [];
        let usrs = [];
        // Via connections, not Artist.shopId - see utils/artist-shop.js.
        const artists = await findArtistsForShops([shopId]);
        if(artists) {
          artists.map((artist) => {
            usrIds.push(artist.userId);
          });
        }
        const staff = await Staff.find({shopId: shopId});
        if(staff) {
          staff.map((stf) => {
            usrIds.push(stf.userId);
          });
          usrs = await User.find({ _id: { $in: usrIds } });
        }
        return usrs;
      }catch(err) {
        rethrow(err);
      }
    })
  }
};
