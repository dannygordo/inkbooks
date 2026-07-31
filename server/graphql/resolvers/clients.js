const Client = require('../../models/Client');
const withAuth = require('../../utils/with-auth');

module.exports = {
  Query: {
    getClients: withAuth(async () => {
      try {
        const clients = await Client.find().sort({ lastName: 1 });
        return clients;
      } catch (err) {
        throw new Error(err);
      }
    }),
    getClient: withAuth(async (_, { clientId }) => {
      try {
        const client = await Client.findById(clientId);
        if (client) {
          return client;
        } throw new Error('Client not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
  },
};
