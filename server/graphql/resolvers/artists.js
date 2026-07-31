const Artist = require('../../models/Artist');
const checkAuth = require('../../utils/check-auth');

module.exports = {
  Query: {
    async getArtists(_, args, context) {
      checkAuth(context);
      try {
        const artists = await Artist.find().sort({ startDate: 1 });
        return artists;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getArtist(_, { artistId }, context) {
      checkAuth(context);
      try {
        const artist = await Artist.findById(artistId);
        if (artist) {
          return artist;
        } throw new Error('Artist not found');
      } catch (err) {
        throw new Error(err);
      }
    },
    async getArtistsByShop(_, { shopId }, context) {
      checkAuth(context);
      try {
        const artists = await Artist.find({ shopId: shopId }).sort({ firstName: 1 });
        if (artists) {
          return artists;
        } throw new Error('Artists not found');
      } catch (err) {
        throw new Error(err);
      }
    },
  },
};
