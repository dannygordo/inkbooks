const { DateTypeDefs } = require('graphql-scalars');
const { ApolloServer } = require('apollo-server');
const mongoose = require('mongoose');
const { MONGODB } = require('./config');
const ibTypeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');
const { Constants } = require('./utils/constants');
const users = require('./graphql/resolvers/users');
const io = require('socket.io')(4000, {
  cors: {
    origin: [Constants.URLS.INKBOOKS_WEBAPP]
  }
});

//---------- Socket.io setup --------------//
let messengerUsers = [];

const addMessengerUser = (userId, socketId) => {
  console.log('............line 19: ' + userId + ' ' + socketId);
  if(!messengerUsers.some((user) => user.userId === userId))  {
    messengerUsers.push({ userId, socketId });
    console.log('....line 22 follows');
    console.log(messengerUsers);
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
    console.log('-------------line 48-----------'); 
    console.log(recipients);
    console.log('-------------line 50-----------'); 
    console.log(savedMessage);
    recipients.forEach(recipient => {

      const newRecipients = recipients.filter(r => r !== id);

      //newRecipients.push(id);

      console.log('-------------line 58-----------'); 
      console.log(newRecipients);
      socket.broadcast.to(recipient).emit('receive-message', {
        recipients: newRecipients,
        sender: id,
        message: savedMessage
      });
    });
  });


  // socket.on('addUser', (userId) => {
  //   console.log('....line 41 follows');
  //   addMessengerUser(userId, socket.id);
  //   io.emit('getUsers', messengerUsers);
  // });

  //send and receive messages
  // socket.on('sendMessage', ({message}) => {
  //   console.log('....line 49 follows');
  //     console.log(message);
  //     const messageReceiver = getMessengerUser(message.receiverId);
  //     console.log('....line 52 follows');
  //     console.log(messageReceiver);
  //     console.log(messengerUsers);
  //     io.to(messageReceiver.socketId).emit('test', message);
  //     io.to(messageReceiver.socketId).emit('receiveMessage', message);
  // });

  //socket disconnect event
  socket.on('disconnect', () => {
    console.log('a user disconnected');
    // removeMessengerUser(socket.id);
    // io.emit('getUsers', messengerUsers);
  });

});

//---------- End Socket.io setup --------------//

const typeDefs = [ibTypeDefs, DateTypeDefs];

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => ({ req }),
});

mongoose
  .connect(MONGODB, { useNewUrlParser: true })
  .then(() => {
    console.log('MongoDB Connected!');
    return server.listen({ port: 5000 });
  })
  .then((res) => {
    console.log(`Server running at ${res.url}`);
  });
