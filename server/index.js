const dotenv = require('dotenv');

// Load .env.* values before requiring anything else. NODE_ENV itself is already set by the
// start scripts (`NODE_ENV=DEVELOPMENT node index.js` / `NODE_ENV=PRODUCTION nodemon index.js`),
// so it's available here; this just loads the rest (MONGODB, SECRET_KEY, FIREBASE_*, etc.)
// before any local module that might read process.env at require-time.
if (process.env.NODE_ENV !== 'PRODUCTION') {
  dotenv.config({ path: '.env.development' });
} else {
  dotenv.config({ path: '.env.production' });
}
console.log('NODE_ENV:', process.env.NODE_ENV);

const http = require('http');
const express = require('express');
const { createLoaders } = require('./utils/loaders');
const { startScheduler } = require('./utils/scheduler');
const { notificationJobs } = require('./utils/notification-jobs');
const { businessJobs } = require('./utils/business-jobs');
const ClientFlagType = require('./models/ClientFlagType');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { ApolloServer } = require('@apollo/server');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const { expressMiddleware } = require('@as-integrations/express5');
const { DateTypeDefs } = require('graphql-scalars');

const ibTypeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');
const { Constants } = require('./utils/constants');
const bookingUploadsRouter = require('./routes/bookingUploads');
const formUploadsRouter = require('./routes/formUploads');
const { router: squareOAuthRouter } = require('./routes/squareOAuth');
const squareWebhooksRouter = require('./routes/squareWebhooks');
const squarePaymentsRouter = require('./routes/squarePayments');

// NOTE: never console.log(process.env.MONGODB) or the connection string anywhere - it contains
// the database password in plaintext, and this project's server logs have historically ended up
// in places (terminal scrollback, hosting provider logs) that aren't as private as they should be.

// .env files here previously had a stray trailing comma on every value (an artifact of copying
// from a JS object literal), which required a runtime .replace(',', '') hack to work around.
// Trim it here instead so a correctly-formatted .env value (no trailing comma) also works.
const mongoUri = (process.env.MONGODB || '').replace(/,\s*$/, '');
if (!mongoUri) {
  throw new Error('MONGODB environment variable is not set - check your .env file.');
}

/**
 * Square's two identifiers have to name the SAME application, and nothing used to say so.
 *
 * A card nonce is only chargeable by the application that minted it. The browser tokenizes with
 * the application id; the server charges with the access token. If those belong to different
 * apps, every charge fails with "Card nonce not found in this application environment" - a
 * message that is precisely accurate and reads like nonsense, because the two halves it's talking
 * about are configured in different places and each looks correct on its own. That is exactly what
 * happened: a hardcoded id in the client named one sandbox app, the token named another.
 *
 * The client no longer holds a copy (see routes/squarePayments.js's GET /square/config), so the
 * remaining way to get this wrong is to paste the token and the id from two different app pages
 * in the Square dashboard. This catches that at boot, where it costs ten seconds, rather than at
 * the moment somebody is standing in front of a client with a card in their hand.
 *
 * Warns rather than refusing to start. Square is one optional feature; a dev with no Square setup
 * at all should still get a running server, and SQUARE_APPLICATION_ID legitimately holds a
 * PRODUCTION id for the OAuth/shop-cut flow in a deployment where the sandbox charge path isn't
 * used. Both of those are "unset or deliberately different", not "silently mismatched", so the
 * check only fires when both values exist and disagree.
 */
function checkSquareApplicationIds() {
  const sandboxAppId = process.env.SQUARE_SANDBOX_APPLICATION_ID;
  const oauthAppId = process.env.SQUARE_APPLICATION_ID;
  const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;

  if (token && !sandboxAppId && !oauthAppId) {
    console.warn(
      '[square] SQUARE_SANDBOX_ACCESS_TOKEN is set but neither SQUARE_SANDBOX_APPLICATION_ID nor ' +
        'SQUARE_APPLICATION_ID is - the card form has no application id to tokenize against and ' +
        'GET /square/config will return a 500.',
    );
    return;
  }
  if (sandboxAppId && oauthAppId && sandboxAppId !== oauthAppId) {
    console.warn(
      '\n[square] WARNING: two different Square applications are configured.\n' +
        `  SQUARE_SANDBOX_APPLICATION_ID  ${sandboxAppId}\n` +
        `  SQUARE_APPLICATION_ID          ${oauthAppId}\n` +
        '  A card nonce is only chargeable by the app that minted it. If SQUARE_SANDBOX_ACCESS_TOKEN\n' +
        '  belongs to the second one, every card charge will fail with "Card nonce not found in this\n' +
        '  application environment". Copy the Application ID and the Sandbox Access Token from the\n' +
        '  SAME app in your Square Developer Dashboard.\n' +
        '  (Ignore this if SQUARE_APPLICATION_ID is deliberately a production id for the OAuth\n' +
        '  shop-cut flow and you are not using the sandbox charge path.)\n',
    );
  }
}
checkSquareApplicationIds();

const app = express();
// Render (like most PaaS providers) terminates TLS and proxies requests to this app - without
// this, req.ip returns Render's internal proxy address for every request instead of the real
// caller's IP, which would silently break IP-based rate limiting (utils/rate-limit.js) by
// putting every caller in the same bucket.
app.set('trust proxy', 1);
// Hoisted to app-level (was previously only applied inside the '/' GraphQL middleware chain
// below) so the new /booking-uploads route - a plain Express route, not GraphQL - gets the same
// CORS treatment without duplicating the origin config in two places. Safe to hoist: cors() only
// sets response headers, it doesn't touch/consume the request body, so it can't interfere with
// multer's multipart parsing on the upload route or express.json()'s parsing on the GraphQL one.
app.use(cors({ origin: [Constants.URLS.INKBOOKS_WEBAPP] }));
app.use(bookingUploadsRouter);
app.use(formUploadsRouter);
// squareWebhooksRouter uses express.raw() internally (needs the raw, unparsed body for HMAC
// signature verification - see routes/squareWebhooks.js) and squareOAuthRouter's callback is a
// plain GET with no body at all - neither one is affected by the '/' route's express.json()
// below, since Express only applies path-scoped middleware to matching paths, but registering
// them here (before '/') keeps all non-GraphQL routes grouped in one place, same as
// bookingUploadsRouter above.
app.use(squareOAuthRouter);
app.use(squareWebhooksRouter);
app.use(squarePaymentsRouter);
// Apollo Server v5 has no standalone listener of its own (that was removed along with the
// apollo-server package) - it now runs as Express middleware, sharing one HTTP server with
// socket.io below instead of each having its own port.
const httpServer = http.createServer(app);

// ---------- Socket.io setup ----------
// Previously `require('socket.io')(4000, {...})` - its own listener on a separate port.
// Now attached to the same httpServer as Express/Apollo, so there's only one process/port
// to run, deploy, and configure CORS for.
const io = new Server(httpServer, {
  cors: {
    origin: [Constants.URLS.INKBOOKS_WEBAPP],
  },
});

io.on('connection', (socket) => {
  console.log('user connected on socket: ' + socket.id);

  const id = socket.handshake.query.id;
  socket.join(id);

  socket.on('send-message', ({ recipients, savedMessage }) => {
    recipients.forEach((recipient) => {
      const newRecipients = recipients.filter((r) => r !== id);

      socket.broadcast.to(recipient).emit('receive-message', {
        recipients: newRecipients,
        sender: id,
        message: savedMessage,
      });
    });
  });

  socket.on('disconnect', () => {
    console.log('a user disconnected');
  });
});
// ---------- End Socket.io setup ----------

const typeDefs = [ibTypeDefs, DateTypeDefs];

const server = new ApolloServer({
  typeDefs,
  resolvers,
  // Lets the HTTP server shut down cleanly (finishes in-flight requests, then closes) instead
  // of being killed out from under active connections.
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
});

async function start() {
  // Apollo Server v5 must be started before its middleware can be mounted.
  await server.start();

  // Mounted at '/' (not '/graphql') to match the URL the client already points at
  // (APP_SETTINGS_CONSTANTS.GRAPHQL_SERVER_URL = 'http://localhost:5500/') - no client change
  // needed for this part. cors() is applied app-wide above now, not repeated here.
  app.use(
    '/',
    // 2mb, not Express's 100kb default.
    //
    // Nobody chose 100kb - it is what express.json() does when you don't say. A GraphQL mutation
    // is a JSON body like any other, and updateProject carries a title, a description, session
    // notes and an array of reference-image records; a project with a long description and a dozen
    // images clears 100kb without anything unusual happening. The failure is a body-parse
    // rejection before the request reaches Apollo, so nothing in the GraphQL layer logs it and the
    // browser sees a bare 4xx with no useful message - which is what a "400 on reference image
    // upload" looks like from the client side.
    //
    // NOT confirmed as the cause of the reported 400; the payload for that was lost. This is a
    // size cliff nobody set deliberately, worth removing on its own. The images themselves go to
    // Firebase from the browser and only their URLs come through here, so 2mb is generous for what
    // this route legitimately carries.
    express.json({ limit: '2mb' }),
    expressMiddleware(server, {
      // loaders are built fresh for every operation, never shared. They batch the per-row
      // lookups field resolvers do (see utils/loaders.js); a loader that outlived a request would
      // be a cache serving a stale answer to "which shop does this artist work at".
      context: async ({ req }) => ({ req, loaders: createLoaders() }),
    }),
  );

  // useNewUrlParser was a MongoDB driver-3.x option that became a permanent no-op once
  // Mongoose moved to driver 4.x years ago (Mongoose 6 already bundled driver 4) - it did
  // nothing under 6.x either, but Mongoose 8+ bundles driver 6.x and validates connect()
  // options more strictly, so a genuinely dead legacy option is worth dropping now rather
  // than carrying it forward on faith.
  await mongoose.connect(mongoUri);
  console.log('MongoDB Connected!');

  // Started only after Mongo is connected. The very first thing every job does is claim a lock
  // row, so a scheduler running before the database is up would throw on its first tick.
  //
  // The lock (models/ScheduledRun.js) is what makes this safe to run on more than one instance:
  // both tick, both try to claim the same period, exactly one wins. Without it, scaling past a
  // single instance would send every email twice - and that failure is invisible in development,
  // where there is only ever one instance.
  // A ONE-MINUTE TICK, down from five. The finest cadence any job asks for is now one minute
  // (client-schedule-emails), and a tick coarser than that silently turns its three-minute debounce
  // into up to eight. Every job still declares its own period and the lock decides what actually
  // runs, so the extra ticks cost one indexed upsert each - which is the trade the lock was built
  // to make (see utils/scheduler.js).
  // Combined into the same scheduler instance as the notification jobs rather than a second
  // startScheduler call - one interval, one set of ticks, jobs from both files claimed by the
  // same lock (models/ScheduledRun.js). See utils/business-jobs.js for what this one does.
  startScheduler([...notificationJobs(), ...businessJobs()], { tickMs: 60 * 1000 });
  console.log('Scheduler started');

  // The flag types the app ships with. Idempotent and $setOnInsert-only, so re-running never
  // overwrites a label somebody has since edited - and doing it on boot rather than in a migration
  // means a fresh database is usable immediately instead of failing the first time a session is
  // marked no-show. See models/ClientFlagType.js.
  await ClientFlagType.ensureSeeded();

  const PORT = process.env.PORT || 5500;
  await new Promise((resolve) => httpServer.listen(PORT, resolve));
  console.log(`Server running at http://localhost:${PORT}/`);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
