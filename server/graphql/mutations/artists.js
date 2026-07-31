const Artist = require('../../models/Artist');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');

module.exports = {
  createArtist: withAuth(async (
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
  ) => {
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
    const artist = await newArtist.save();
    return artist;
  }, Constants.ROLES.SHOP_ADMIN),
  deleteArtist: withAuth(async (_, { artistId }) => {
    try {
      const artist = await Artist.findById(artistId);
      //TODO: revisit rule that allows a user to delete an artist.  Might want to inactive artist instead of delete in order to prevent historical documents from breaking
      if (artist) {
        await Artist.deleteOne({ _id: artistId });
        return 'Artist deleted successfully';
      }
      throw new Error('Artist not found');
    } catch (err) {
      throw new Error(err);
    }
  }, Constants.ROLES.ADMIN),
  updateArtist: withAuth(async (_, args) => {
    try{
      const artist = args.artist;
      const res = await Artist.findByIdAndUpdate({_id: artist.id}, artist, {new: true});
      return res;
    } catch (err) {
        throw new Error(err);
    }
  }, Constants.ROLES.SHOP_ADMIN)
};
