const { DateTypeDefs } = require('graphql-scalars');
const { ApolloServer } = require('apollo-server');
const mongoose = require('mongoose');
const { MONGODB } = require('./config');
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
 console.log(process.env.NODE_ENV);
 console.log(process.env.MONGODB);
 console.log(process.env.MONGODB.replace(',',''));
 // look into fixing the mongodb connection string including a comma at the end of the value
mongoose
  .connect(process.env.MONGODB.replace(',',''), { useNewUrlParser: true })
  .then(() => {
    console.log('MongoDB Connected!');
    console.log(MONGODB);
    console.log("----");
    console.log(process.env.MONGODB);
    return server.listen({ port: 5500 });
  })
  .then((res) => {
    console.log(`Server running at ${res.url}`);
  });
