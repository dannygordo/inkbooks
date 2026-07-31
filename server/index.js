const { DateTypeDefs } = require('graphql-scalars');
const { ApolloServer } = require('apollo-server');
const mongoose = require('mongoose');
const ibTypeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');
const { Constants } = require('./utils/constants');
const users = require('./graphql/resolvers/users');
const dotenv = require('dotenv');
const io = require('socket.io')(4000, {
  cors: {
    origin: [Constants.URLS.INKBOOKS_WEBAPP]
  }
});

//---------- Socket.io setup --------------//
let messengerUsers = [];

const addMessengerUser = (userId, socketId) => {
  if(!messengerUsers.some((user) => user.userId === userId))  {
    messengerUsers.push({ userId, socketId });
  }
}

const removeMessengerUser = (socketId) => {
  messengerUsers = messengerUsers.filter(user=>messengerUsers.socketId !== socketId);
}

const getMessengerUser = (userId) => {
  return messengerUsers.find((user) => {
    if(user.userId === userId) {
      return user;
    }
  })
}

//socket connection event
io.on('connection', (socket) => {
  console.log('user connected on socket: ' + socket.id);
  
  const id = socket.handshake.query.id;
  socket.join(id);

  socket.on('send-message', ({recipients, savedMessage}) => {
    recipients.forEach(recipient => {

      const newRecipients = recipients.filter(r => r !== id);

      socket.broadcast.to(recipient).emit('receive-message', {
        recipients: newRecipients,
        sender: id,
        message: savedMessage
      });
    });
  });

  //socket disconnect event
  socket.on('disconnect', () => {
    console.log('a user disconnected');
  });

});

//---------- End Socket.io setup -------------//

const typeDefs = [ibTypeDefs, DateTypeDefs];

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => ({ req }),
});

if (process.env.NODE_ENV !== 'PRODUCTION') {
  dotenv.config({ path: '.env.development' });
} else {
  dotenv.config({ path: '.env.production' });
}
console.log('NODE_ENV:', process.env.NODE_ENV);
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

mongoose
  .connect(mongoUri, { useNewUrlParser: true })
  .then(() => {
    console.log('MongoDB Connected!');
    return server.listen({ port: 5500 });
  })
  .then((res) => {
    console.log(`Server running at ${res.url}`);
  });
