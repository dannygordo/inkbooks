const { DateTypeDefs } = require('graphql-scalars');
const { ApolloServer } = require('apollo-server');
const mongoose = require('mongoose');
const { MONGODB } = require('./config');
const ibTypeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');
const { Constants } = require('./utils/constants');
const io = require('socket.io')(4000, {
  cors: {
    origin: [Constants.URLS.INKBOOKS_WEBAPP]
  }
});

//Socket.io setup
io.on('connection', socket => {
  console.log(socket.id);
});

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
