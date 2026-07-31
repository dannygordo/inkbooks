const { AuthenticationError } = require('apollo-server');
const Artist = require('../../models/Artist');
const checkAuth = require('../../utils/check-auth');
const { Constants } = require('../../utils/constants');

module.exports = {
  async createArtist(
    _,
    {
      firstName,
      lastName,
      email,
      title,
      phone,
      address,
      city,
      state,
      zip,
      instagram,
      facebook,
      avatar,
      startDate,
      endDate,
      hourlyRate,
      shopId,
      userId,
      status,
    },
    context,
  ) {
    const user = checkAuth(context);
    const newArtist = new Artist({
      firstName,
      lastName,
      email,
      title,
      phone,
      address,
      city,
      state,
      zip,
      instagram,
      facebook,
      avatar,
      startDate,
      endDate,
      hourlyRate,
      shopId,
      userId,
      status,
    });
    if(user.role <= Constants.ROLES.SHOP_ADMIN) {
      const artist = await newArtist.save();
      return artist;
    }
    throw new AuthenticationError('Action not allowed');
  },
  async deleteArtist(_, { artistId }, context) {
    const user = checkAuth(context);
    try {
      const artist = await Artist.findById(artistId);
      //TODO: revisit rule that allows a user to delete an artist.  Might want to inactive artist instead of delete in order to prevent historical documents from breaking

      //if authenticated user is an admin then delete is permitted, otherwise an authentication error will be thrown
      if (artist && user.role === Constants.ROLES.ADMIN) {
        await Artist.deleteOne({ _id: artistId });
        return 'Artist deleted successfully';
      }
      throw new AuthenticationError('Action not allowed');
    } catch (err) {
      throw new Error(err);
    }
  },
  async updateArtist(_, args, context) {
    const user = checkAuth(context);
    try{
      const artist = args.artist;
      console.log('user');
      console.log(user);
      if (user.role <= Constants.ROLES.SHOP_ADMIN) {

      console.log('fartist');
      console.log(artist);
        const res = await Artist.findByIdAndUpdate({_id: artist.id}, artist, {new: true});
        return res;
      }
      throw new AuthenticationError('Action not allowed');
    } catch (err) {
        throw new Error(err);
    }
  }
};
