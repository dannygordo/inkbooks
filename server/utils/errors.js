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

/**
 * Use this in a catch instead of `throw new Error(err)`.
 *
 * Almost every resolver in this codebase wraps its body in
 * `try { ... } catch (err) { throw new Error(err) }`. That pattern silently destroys every
 * deliberate error thrown inside the try: an AuthenticationError carrying "Action not allowed",
 * or a UserInputError carrying `extensions.errors.email`, gets caught by its own resolver and
 * re-thrown as a bare Error whose message is the stringified original and whose extensions are
 * gone. The client sees an opaque server error where the server was trying to say something
 * specific, and every form that reads `extensions.errors` to highlight a field gets nothing.
 *
 * It was found three separate times before it was understood as one thing - getShop, getClient,
 * then all three update mutations - because each instance looks local and harmless. Five files
 * had already grown their own `if (err instanceof GraphQLError) throw err` guard, which is this
 * function written out longhand.
 *
 * Anything that isn't a GraphQLError keeps the old behaviour exactly, so a genuine unexpected
 * failure (a Mongoose cast error, a network blip) is reported the way it always was.
 */
function rethrow(err) {
  if (err instanceof GraphQLError) {
    throw err;
  }
  throw new Error(err);
}

module.exports = { AuthenticationError, UserInputError, ForbiddenError, RateLimitError, rethrow };
