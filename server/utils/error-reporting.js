/**
 * Error monitoring (Sentry) - see PRODUCTION_ROADMAP.md's Phase 6 checklist. NO-OPS COMPLETELY
 * until SENTRY_DSN is set - this file is safe to import and call from day one, on a server with no
 * Sentry project created yet, and turns on for real the moment a real DSN lands in the env file.
 * See .env.development/.env.production for where that goes and how to get one.
 *
 * ONE FUNCTION, reportError(), IS THE ONLY THING THE REST OF THE APP CALLS. Two things happen
 * together on purpose, not as two separate calls a resolver has to remember to make: a structured
 * log line (via utils/logger.js - so it shows up in normal log output/aggregation even without
 * Sentry configured) AND a Sentry capture (if configured). A call site that only logged would be
 * invisible the moment nobody's tailing logs; a call site that only reported to Sentry would be
 * invisible to a local dev with no DSN set. Both, from one call, is the point.
 *
 * WHAT SHOULD GO THROUGH THIS, VERSUS A PLAIN logger.warn(). Not every caught error is an
 * incident - see graphql/typeDefs and utils/errors.js's AuthenticationError/UserInputError/
 * ForbiddenError/RateLimitError: those are EXPECTED outcomes of normal use (a client typed the
 * wrong password, a form was submitted with a bad email), not bugs, and reporting every one of
 * them to Sentry would bury the signal that actually matters under thousands of routine rejections.
 * The Apollo error-formatting plugin in index.js already draws exactly this line for everything
 * that flows through GraphQL - see its own comment for the specific rule (any of the four known
 * `extensions.code` values is expected and skipped; anything else reaches here). Call sites outside
 * GraphQL (routes/, scheduled jobs, webhook handlers) that catch a genuinely unexpected failure -
 * a third-party API call that threw, a database operation that failed - should call this directly.
 */
const logger = require('./logger');

let Sentry = null;
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  // Required only when actually configured - a server with no Sentry project yet should not need
  // @sentry/node's dependency tree loaded (or even installed) to boot at all. See package.json;
  // it's a real dependency either way, but this keeps init side-effect-free without a DSN.
  // eslint-disable-next-line global-require
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV === 'PRODUCTION' ? 'production' : 'development',
    tracesSampleRate: 0,
  });
  logger.info('[error-reporting] Sentry initialized.');
} else {
  logger.warn(
    '[error-reporting] SENTRY_DSN is not set - errors will be logged locally only, not reported ' +
      'to Sentry. See .env.development for how to get one.',
  );
}

/**
 * Report an unexpected error: always logs at error level, additionally forwards to Sentry when
 * configured. `context` is arbitrary extra structured data (e.g. { operationName, userId }) -
 * attached to both the log line and the Sentry event, never the raw request/user object (see
 * utils/logger.js's own redaction for why that discipline still matters even with redaction as a
 * backstop).
 */
function reportError(err, context = {}) {
  logger.error({ err, ...context }, err && err.message ? err.message : 'Unexpected error');
  if (Sentry) {
    Sentry.captureException(err, { extra: context });
  }
}

module.exports = { reportError, Sentry };
