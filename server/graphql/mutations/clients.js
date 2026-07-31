const Client = require('../../models/Client');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');

module.exports = {
  createClient: withAuth(async (
    _,
    {
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      state,
      zip,
      instagram,
      facebook,
      avatar,
      userId,
    },
  ) => {
    const newClient = new Client({
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      state,
      zip,
      instagram,
      facebook,
      avatar,
      userId,
    });
    const client = await newClient.save();
    return client;
  }, Constants.ROLES.CLIENT),
  deleteClient: withAuth(async (_, { clientId }) => {
    try {
      const client = await Client.findById(clientId);
      //TODO: revisit rule that allows a user to delete an client.  Might want to inactive client instead of delete in order to prevent historical documents from breaking
      if (client) {
        await Client.deleteOne({ _id: clientId });
        return 'Client deleted successfully';
      }
      throw new Error('Client not found');
    } catch (err) {
      throw new Error(err);
    }
  }, Constants.ROLES.ADMIN),
  updateClient: withAuth(async (_, args) => {
    try{
      const client = args.client;
      const res = await Client.findByIdAndUpdate({_id: client.id}, client, {new: true});
      return res;
    } catch (err) {
        throw new Error(err);
    }
  }, Constants.ROLES.SHOP_ADMIN)
};
