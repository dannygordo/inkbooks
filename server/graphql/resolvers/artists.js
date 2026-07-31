const Artist = require('../../models/Artist');
const withAuth = require('../../utils/with-auth');

module.exports = {
  Query: {
    getArtists: withAuth(async () => {
      try {
        const artists = await Artist.find().sort({ startDate: 1 });
        return artists;
      } catch (err) {
        throw new Error(err);
      }
    }),
    getArtist: withAuth(async (_, { artistId }) => {
      try {
        const artist = await Artist.findById(artistId);
        if (artist) {
          return artist;
        } throw new Error('Artist not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
    getArtistsByShop: withAuth(async (_, { shopId }) => {
      try {
        const artists = await Artist.find({ shopId: shopId }).sort({ firstName: 1 });
        if (artists) {
          return artists;
        } throw new Error('Artists not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
  },
};
