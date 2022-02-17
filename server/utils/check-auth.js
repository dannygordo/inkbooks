const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('apollo-server');
const { SECRET_KEY } = require('../config');

module.exports = (context) => {
  //console.log(context.req.headers.authorization);
  const authHeader = context.req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split('Bearer ')[1];
    if (token) {
      try {
        const user = jwt.verify(token, SECRET_KEY);
        return user;
      } catch (err) {
        throw new AuthenticationError('Invalid/expired token');
      }
    }
    throw new Error(
      'Authentication token must be prefixed with the string: Bearer ',
    );
  }
  throw new Error(
    'Authentication header must be provided to perform this action',
  );
};
