/**
 * The one structured-logging entry point for this app - see PRODUCTION_ROADMAP.md's Phase 6
 * checklist ("replace console.log debug statements... with structured logging (pino), and make
 * sure nothing sensitive ever hits a log line").
 *
 * WHY PINO. Same reasoning as choosing Vitest over Jest for testing (one well-supported choice
 * instead of picking between several similar ones): pino is the standard Node structured logger,
 * outputs newline-delimited JSON that every log aggregator (Render's own log viewer, Datadog,
 * Better Stack, etc.) already understands with zero configuration, and its `redact` option is
 * exactly the safety-net this file exists to provide.
 *
 * REDACTION IS DEFENSE IN DEPTH, NOT THE ONLY GUARD. It only scrubs fields on a STRUCTURED object
 * passed as the log call's first argument (e.g. `logger.info({ user }, 'registered')`) - a plain
 * string message like `logger.warn('failed for ' + user.email)` bypasses it entirely, the same way
 * it always would have with console.log. The actual discipline (don't put a password/token/whole
 * user object in a message) still matters; this exists so a future accidental
 * `logger.info({ req }, '...')` - which WOULD otherwise leak `req.headers.authorization` into every
 * log line - gets scrubbed automatically instead of depending on the author remembering.
 *
 * DEV VS PROD TRANSPORT: pino-pretty (human-readable, colorized) locally; plain NDJSON in
 * production, since that's what a log aggregator actually wants to parse, not what's pleasant to
 * stare at in a terminal.
 */
const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'PRODUCTION';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.accessToken',
      '*.refreshToken',
      '*.secretKey',
      '*.token',
      '*.guestToken',
      '*.accessTokenEncrypted',
      '*.SECRET_KEY',
      '*.TOKEN_ENCRYPTION_KEY',
    ],
    censor: '[redacted]',
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});

module.exports = logger;
