const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { UserInputError, AuthenticationError } = require('../../utils/errors');
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
      // user has been authenticated, generate token and return user object
      const token = generateToken(user);
      const firebaseToken = await mintFirebaseToken(user.id, {
        role: user.role,
        userType: user.userType,
      });
      let userInfo = {};
      switch(user.userType) {
        case Constants.USER_TYPE.ARTIST :
          userInfo = await Artist.findOne({userId: user.id}).select('-user');
          userInfo.id = userInfo._id;
          return {
            ...user._doc,
            userInfo: userInfo,
            id: user._id,
            role: user.role,
            accessToken: token,
            firebaseToken: firebaseToken,
            userType: user.userType
          };
        case Constants.USER_TYPE.CLIENT :
            userInfo = await Client.findOne({userId: user.id}).select('-user');
            userInfo.id = userInfo._id;
            return {
              ...user._doc,
              userInfo: userInfo,
              id: user._id,
              role: user.role,
              accessToken: token,
              firebaseToken: firebaseToken,
              userType: user.userType
            };
        case Constants.USER_TYPE.STAFF :
            userInfo = await Staff.findOne({userId: user.id}).select('-user');
            userInfo.id = userInfo._id;
            return {
              ...user._doc,
              userInfo: userInfo,
              id: user._id,
              role: user.role,
              accessToken: token,
              firebaseToken: firebaseToken,
              userType: user.userType
            };
      }
    },
    async register(
      _,
      {
        registerInput: {
          username, password, email, firstName, lastName, avatar, confirmPassword, tagColor
          // NOTE: role and userType are intentionally NOT destructured from client input here.
          // Public self-registration must never let the caller choose their own role - see
          // PRODUCTION_ROADMAP.md Phase 1, item 3. Every self-registered account is a Client.
        },
      },
    ) {
      const role = Constants.ROLES.CLIENT;
      const userType = Constants.USER_TYPE.CLIENT;

      const { valid, errors } = validate(registerInputSchema, {
        username, email, firstName, lastName, avatar, password, confirmPassword, tagColor,
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
        tagColor
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
        if (user.role <= Constants.ROLES.SHOP_ADMIN || user.id === usr.id) {
          let res = await User.findByIdAndUpdate({_id: usr.id}, usr, {new: true});
          res.accessToken = 'temp_' + Date.now();
          return res;
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
          throw new Error(err);
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
    getUsers: withAuth(async () => {
      try {
        const users = await User.find().sort({ email: 1 });
        return users;
      } catch (err) {
        throw new Error(err);
      }
    }),
    getUser: withAuth(async (_, { userId }) => {
      try {
        const user = await User.findById(userId);
        if (user) {
          return user;
        } throw new Error('User not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
    getUserTagColors: withAuth(async (_, { shopId }) => {
      try {
        let usrIds = [];
        let usrs = [];
        const artists = await Artist.find({shopId: shopId});
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
        throw new Error(err);
      }
    })
  }
};
