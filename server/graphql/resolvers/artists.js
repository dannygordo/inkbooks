const Artist = require('../../models/Artist');

module.exports = {
  Query: {
    async getArtists() {
      try {
        const artists = await Artist.find().sort({ startDate: 1 });
        return artists;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getArtist(_, { artistId }) {
      try {
        const artist = await Artist.findById(artistId);
        if (artist) {
          return artist;
        } throw new Error('Artist not found');
      } catch (err) {
        throw new Error(err);
      }
    },
  },
};
