const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
// See utils/check-auth.js - server/config.js is gitignored and never committed, so requiring it
// crashes anywhere the file isn't manually present (e.g. Render). Read from process.env instead,
// same mechanism MONGODB already uses.
const SECRET_KEY = process.env.SECRET_KEY;
const User = require('../../models/User');
const Artist = require('../../models/Artist');
const Staff = require('../../models/Staff');
const Shop = require('../../models/Shop');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const {
  loginInputSchema,
  registerAccountInputSchema,
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
const { assertSlugAvailable } = require('../../utils/booking-slug');

// A real bcrypt hash of a value nobody knows, compared against when no account matches, so a
// missing account and a wrong password take the same time to answer. Generated once at module
// load rather than per request - bcrypt is deliberately slow, and the point is that both paths
// pay the same cost, not that they pay it twice.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
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
    async login(_, { email, password }) {
      const { errors, valid } = validate(loginInputSchema, { email, password });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      // Lowercased to match how it's stored (models/User.js normalises on write). Typing an
      // address with the capitalisation your phone chose must not be a failed login.
      const normalizedEmail = String(email).trim().toLowerCase();
      const user = await User.findOne({ email: normalizedEmail });

      // One message and one field for both "no such account" and "wrong password", deliberately.
      // Distinguishing them turns this into an oracle for which addresses have accounts here -
      // and for a tattoo shop, the account list IS the client list. requestPasswordReset already
      // takes the same care (see mutations/passwords.js); this is the other half of it.
      //
      // bcrypt.compare still runs against a dummy hash when there's no user, so a missing account
      // and a wrong password take the same time to answer. Returning early would make the
      // difference measurable regardless of what the message says.
      const passwordHash = user ? user.password : DUMMY_PASSWORD_HASH;
      const match = await bcrypt.compare(password, passwordHash);
      if (!user || !match) {
        throw new UserInputError('Invalid email or password', {
          errors: {
            password: 'Invalid email or password',
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
      // NO userInfo ASSEMBLED HERE ANY MORE. It is a field resolver on User (see
      // resolvers/index.js), so it is filled in for anything that returns a User rather than for
      // whichever resolvers remembered to do it.
      //
      // This function used to look the profile up itself and hang it on the returned object, which
      // read as harmless until registerAccount was added and didn't - a brand new account arrived
      // at the dashboard with userInfo null, and the only way to get one was to log in, because
      // logging in was the single place that knew how. Nothing failed loudly; the field is
      // nullable, so GraphQL returned null and the client rendered the empty state.
      return {
        ...user._doc,
        id: user._id,
        role: user.role,
        accessToken: token,
        firebaseToken: firebaseToken,
        userType: user.userType,
      };
    },
    /**
     * Public signup. A SHOP, or an INDEPENDENT ARTIST.
     *
     * WHAT THE CALLER GETS TO DECIDE, AND WHAT THEY DON'T.
     *
     * They pick accountType and nothing else about who they are. role and userType are derived
     * from it here - never read from the input, not even optionally. That is the same rule the old
     * register() enforced (see PRODUCTION_ROADMAP.md Phase 1, item 3, where a client-supplied role
     * was a real escalation bug), restated for a form that now has a legitimate choice on it. The
     * choice is between two SHAPES of account, not between two permission levels.
     *
     * WHY A SHOP OWNER ALSO GETS AN ARTIST PROFILE.
     *
     * The overwhelmingly common signup is one person who owns a studio and tattoos in it. Giving
     * them only a SHOP_ADMIN account leaves them with no calendar of their own and no way to be
     * booked - they'd have to notice, and then add themselves as an artist. So a shop signup
     * creates all four records: the Shop, the User, a Staff row and an Artist row with an active
     * connection. A shop whose owner doesn't tattoo can archive that artist profile; that is a much
     * easier thing to discover than an absence.
     *
     * userType is ARTIST and role is SHOP_ADMIN, which is not a contradiction: role is what you may
     * DO, userType is which profile record `userInfo` resolves to. Artist.shop resolves through the
     * connection (see resolvers/index.js), so the shop id the client reads off userInfo is correct
     * either way - and the Staff row is what makes them findable as a shop admin for notifications
     * (see utils/notification-audience.js, which looks for admins through Staff).
     *
     * NO EMAIL VERIFICATION YET. An account works immediately, which means anyone can create a shop
     * with any address. That is a deliberate, temporary position while this is in development and
     * it should be revisited before launch.
     */
    async registerAccount(_, { input }) {
      const { valid, errors, data } = validate(registerAccountInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }

      // Normalised before the uniqueness check, not just on write. Checking the raw value would
      // let Maya@shop.com past a lookup for maya@shop.com and then collide on the unique index at
      // save time, surfacing as a duplicate-key crash instead of "that address is taken".
      const normalizedEmail = String(data.email).trim().toLowerCase();
      if (await User.findOne({ email: normalizedEmail })) {
        throw new UserInputError('Email is already taken', {
          errors: { email: 'An account already exists for that email address.' },
        });
      }

      const isShop = data.accountType === Constants.SIGNUP_TYPE.SHOP;

      // BEFORE anything is written, including the Shop.
      //
      // assertSlugAvailable throws on a bad shape, a reserved word or a taken handle. Doing it here
      // rather than at the Artist save means a rejected link fails the whole signup cleanly - order
      // matters more than usual on this path, because the shop branch creates a Shop first, and a
      // slug collision discovered afterwards would leave an orphaned Shop row behind with no owner
      // and a name somebody else can no longer use.
      //
      // Optional throughout: signing up without a link is legal, /book/<id> still works, and one
      // can be chosen later from Settings. Nobody should be stuck at the last step of a signup
      // form inventing a handle.
      const bookingSlug = data.bookingSlug ? await assertSlugAvailable(data.bookingSlug) : undefined;

      const hashedPassword = await bcrypt.hash(data.password, 12);

      // The Shop first, so its id is available for the tag colour and the connection below. Its
      // contact email starts as the owner's - a solo studio has one address, and it is editable in
      // shop settings. Shop.email is uniquely indexed, so a second shop on the same address fails
      // with a clear message rather than silently sharing one.
      let shop = null;
      if (isShop) {
        if (await Shop.findOne({ email: normalizedEmail })) {
          throw new UserInputError('Errors', {
            errors: { email: 'A shop already exists for that email address.' },
          });
        }
        shop = await new Shop({ name: data.shopName, email: normalizedEmail }).save();
      }

      const newUser = await new User({
        email: normalizedEmail,
        firstName: data.firstName,
        lastName: data.lastName,
        password: hashedPassword,
        // DERIVED, never taken from input. A shop's first account is its admin; an independent
        // artist is an artist.
        role: isShop ? Constants.ROLES.SHOP_ADMIN : Constants.ROLES.ARTIST,
        // ARTIST either way - see the header. A shop owner tattoos until they say otherwise.
        userType: Constants.USER_TYPE.ARTIST,
        // Unique within the shop where there is one, so two artists never share a calendar colour.
        // A lone artist gets the fixed no-shop default rather than an unreadable client-supplied
        // value - the old register() accepted one and every self-registered account ended up white
        // on white. See utils/tag-color.js.
        tagColor: shop ? await pickDefaultTagColor(shop._id, null) : DEFAULT_NO_SHOP_TAG_COLOR,
        hasSetPassword: true,
      }).save();

      // The profile record. Without one, login() resolves userInfo to null and the whole app
      // renders as though this person has no identity - which is exactly the bug the old register()
      // had before it started creating a Client row.
      await new Artist({
        firstName: data.firstName,
        lastName: data.lastName,
        email: normalizedEmail,
        // Only set when actually chosen. Writing '' or null here would put every slug-less artist
        // on the same indexed value and the second one would collide - see models/Artist.js.
        ...(bookingSlug ? { bookingSlug } : {}),
        userId: newUser._id,
        status: Constants.ARTIST_STATUS.ACTIVE,
        startDate: new Date(),
      }).save();

      if (shop) {
        // Both records, deliberately. The connection is what makes them visible on the shop's
        // calendar and in its analytics; the Staff row is what makes them findable as an ADMIN of
        // it. Neither substitutes for the other - see utils/notification-audience.js.
        await new ArtistShopConnection({
          artistId: newUser._id,
          shopId: shop._id,
          status: 'active',
        }).save();
        await new Staff({
          firstName: data.firstName,
          lastName: data.lastName,
          email: normalizedEmail,
          userId: newUser._id,
          shopId: shop._id,
          status: Constants.STAFF_STATUS.ACTIVE,
        }).save();
      }

      const token = generateToken(newUser);
      const firebaseToken = await mintFirebaseToken(newUser.id, {
        role: newUser.role,
        userType: newUser.userType,
      });
      return {
        ...newUser._doc,
        id: newUser._id,
        accessToken: token,
        firebaseToken,
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
        } throw new UserInputError('Errors', { errors: { userId: 'User not found.' } });
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
