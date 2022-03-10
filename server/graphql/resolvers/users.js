const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { UserInputError } = require('apollo-server');
const { SECRET_KEY } = require('../../config');
const User = require('../../models/User');
const Artist = require('../../models/Artist');
const Client = require('../../models/Client');
const Staff = require('../../models/Staff');
const {
  validateRegisterInput,
  validateLoginInput,
} = require('../../utils/validators');
const checkAuth = require('../../utils/check-auth');
const {Constants} = require('../../utils/constants');

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
    SECRET_KEY,
    { expiresIn: '5d' },
  );
}

module.exports = {
  Mutation: {
    async login(_, { username, password }) {
      // check to see if inputs are valid
      const { errors, valid } = validateLoginInput(username, password);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      // get user and if not found throw error
      const user = await User.findOne({ username });
      if (!user) {
        errors.general = 'User not found';
        throw new UserInputError('User not found', {
          errors: {
            username: 'Username not found',
          }
        });
      }
      // if user is found make sure password entered is the same as the saved hash
      const match = await bcrypt.compare(password, user.password);
      console.log(match);
      if (!match) {
        errors.general = 'Invalid username/password';
        throw new UserInputError('Invalid username/password', {
          errors: {
            password: 'Invalid username/password',
          }
        });
      }
      // user has been authenticated, generate token and return user object
      const token = generateToken(user);
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
              userType: user.userType
            };
      }
      
    },
    async register(
      _,
      {
        registerInput: {
          username, password, email, firstName, lastName, avatar, confirmPassword, role, userType
        },
      },
    ) {
      // validates user's input from registration form
      const { valid, errors } = validateRegisterInput(
        username,
        email,
        firstName,
        lastName,
        avatar,
        password,
        confirmPassword,
        role,
        userType
      );
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
      password = await bcrypt.hash(password, 12);

      const newUser = new User({
        email,
        firstName,
        lastName,
        avatar,
        username,
        password,
        role,
        userType
      });

      // save new user to database and return user object
      const res = await newUser.save();

      const token = generateToken(res);
      // change _id to id and add access token to the user object the return to caller
      return {
        ...res._doc,
        id: res._id,
        accessToken: token,
      };
    },
    async updateUser(_, args, context) {
      const user = checkAuth(context);
      try {
        const usr = args.user;

        console.log(usr);
        if (user.role <= Constants.ROLES.SHOP_ADMIN || user.id === usr.id) {
          // validates user's input from registration form
          // const { valid, errors } = validateRegisterInput(
          //   usr.username,
          //   usr.email,
          //   usr.firstName,
          //   usr.lastName,
          //   usr.avatar,
          //   usr.password,
          //   usr.confirmPassword,
          //   usr.role,
          //   usr.userType
          // );

          // if (!valid) {
          //   throw new UserInputError('Errors', { errors });
          // }
          let res = await User.findByIdAndUpdate({_id: usr.id}, usr, {new: true});
          res.accessToken = 'temp_' + Date.now();
          console.log(res);
          return res;
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
          throw new Error(err);
      }
    },
    async forgotPassword(_, { username, password }) {
      // check to see if inputs are valid
      // const { errors, valid } = validateLoginInput(username, password);
      // if (!valid) {
      //   throw new UserInputError('Errors', { errors });
      // }

      // get user and if not found throw error
      const user = await User.findOne({ username });
      if (!user) {
        errors.general = 'User not found';
        throw new UserInputError('User not found', {
          errors: {
            username: 'Username not found',
          }
        });
      }

      // hash password
      password = await bcrypt.hash(password, 12);

      // save new user to database and return user object
      const res = await User.findByIdAndUpdate({_id: user.id}, {password: password}, {new: true});

      const token = generateToken(res);
      // change _id to id and add access token to the user object the return to caller
      return {
        ...res._doc,
        id: res._id,
        accessToken: token,
      };
    }
  },
  Query: {
    async getUsers() {
      try {
        const users = await User.find().sort({ email: 1 });
        return users;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getUser(_, { userId }) {
      try {
        const user = await User.findById(userId);
        if (user) {
          return user;
        } throw new Error('User not found');
      } catch (err) {
        throw new Error(err);
      }
    },
  }
};
