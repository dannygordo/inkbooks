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

const app = express();
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
  // needed for this part.
  app.use(
    '/',
    cors({ origin: [Constants.URLS.INKBOOKS_WEBAPP] }),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => ({ req }),
    }),
  );

  await mongoose.connect(mongoUri, { useNewUrlParser: true });
  console.log('MongoDB Connected!');

  const PORT = process.env.PORT || 5500;
  await new Promise((resolve) => httpServer.listen(PORT, resolve));
  console.log(`Server running at http://localhost:${PORT}/`);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
