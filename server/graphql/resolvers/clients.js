const Client = require('../../models/Client');
const checkAuth = require('../../utils/check-auth');

module.exports = {
  Query: {
    async getClients(_, args, context) {
      checkAuth(context);
      try {
        const clients = await Client.find().sort({ lastName: 1 });
        return clients;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getClient(_, { clientId }, context) {
      checkAuth(context);
      try {
        const client = await Client.findById(clientId);
        if (client) {
          return client;
        } throw new Error('Client not found');
      } catch (err) {
        throw new Error(err);
      }
    },
  },
};
