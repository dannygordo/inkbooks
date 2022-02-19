const { AuthenticationError } = require('apollo-server');
const Client = require('../../models/Client');
const checkAuth = require('../../utils/check-auth');
const { Constants } = require('../../utils/constants');

module.exports = {
  async createClient(
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
    context,
  ) {
    const user = checkAuth(context);
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
    if(user.role <= Constants.ROLES.CLIENT) {
      const client = await newClient.save();
      return client;
    }
    throw new AuthenticationError('Action not allowed');
  },
  async deleteClient(_, { clientId }, context) {
    const user = checkAuth(context);
    try {
      const client = Client.findById(clientId);
      //TODO: revisit rule that allows a user to delete an client.  Might want to inactive client instead of delete in order to prevent historical documents from breaking

      //if authenticated user is an admin then delete is permitted, otherwise an authentication error will be thrown
      if (client && user.role === Constants.ROLES.ADMIN) {
        await client.deleteOne({ clientId });
        return 'Client deleted successfully';
      }
      throw new AuthenticationError('Action not allowed');
    } catch (err) {
      throw new Error(err);
    }
  },
  async updateClient(_, args, context) {
    const user = checkAuth(context);
    try{
      const client = args.client;
      console.log('user');
      console.log(user);
      if (user.role <= Constants.ROLES.SHOP_ADMIN) {

      console.log('fclient');
      console.log(client);
        const res = await Client.findByIdAndUpdate({_id: client.id}, client, {new: true});
        return res;
      }
      throw new AuthenticationError('Action not allowed');
    } catch (err) {
        throw new Error(err);
    }
  }
};
