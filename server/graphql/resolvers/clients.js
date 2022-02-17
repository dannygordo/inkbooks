const Client = require('../../models/Client');

module.exports = {
  Query: {
    async getClients() {
      try {
        const clients = await Client.find().sort({ lastName: 1 });
        return clients;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getClient(_, { clientId }) {
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
