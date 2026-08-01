const { GraphQLError } = require('graphql');

// Thin replacements for apollo-server's AuthenticationError/UserInputError/ForbiddenError,
// which don't exist in @apollo/server v4+ (Apollo Server 3, which this project used to run on,
// bundled its own error subclasses; the modern package expects you to throw a plain GraphQLError
// with an extensions.code instead). These exist so every resolver/mutation file that already
// does `throw new AuthenticationError('...')` or `throw new UserInputError('...', { errors })`
// keeps working unchanged - only the import source changes (from 'apollo-server' to this file).
//
// Match apollo-server's actual behavior: the second constructor argument's keys become
// top-level `extensions` keys (not nested under an `extensions` key themselves). This matters
// because the client reads `err.graphQLErrors[0].extensions.errors` directly - see
// client/src/pages/register/Register.js's onError handler, for example.

class AuthenticationError extends GraphQLError {
  constructor(message, extensionsInput = {}) {
    super(message, { extensions: { code: 'UNAUTHENTICATED', ...extensionsInput } });
    this.name = 'AuthenticationError';
  }
}

class UserInputError extends GraphQLError {
  constructor(message, extensionsInput = {}) {
    super(message, { extensions: { code: 'BAD_USER_INPUT', ...extensionsInput } });
    this.name = 'UserInputError';
  }
}

class ForbiddenError extends GraphQLError {
  constructor(message, extensionsInput = {}) {
    super(message, { extensions: { code: 'FORBIDDEN', ...extensionsInput } });
    this.name = 'ForbiddenError';
  }
}

class RateLimitError extends GraphQLError {
  constructor(message, extensionsInput = {}) {
    super(message, { extensions: { code: 'RATE_LIMITED', ...extensionsInput } });
    this.name = 'RateLimitError';
  }
}

module.exports = { AuthenticationError, UserInputError, ForbiddenError, RateLimitError };
