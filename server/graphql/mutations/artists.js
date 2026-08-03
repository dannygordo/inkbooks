const Artist = require('../../models/Artist');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { updateArtistRateSettingsInputSchema, validate } = require('../../utils/validation');

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
  }, Constants.ROLES.SHOP_ADMIN),
  // Self-service rate settings, deliberately separate from updateArtist above - updateArtist is
  // gated to SHOP_ADMIN-or-better (an admin editing an artist's full profile), which means a
  // plain ARTIST-role user has never been able to call it on their own record at all, including
  // to set their own rate. This is any authenticated artist updating their own
  // hourlyRate/flatRate/billingType only - narrower fields, no minRole restriction beyond being
  // logged in, and looked up by the caller's own userId rather than a client-supplied artistId,
  // so there's no ownership check to get wrong.
  updateArtistRateSettings: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(updateArtistRateSettingsInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    if (user.userType !== Constants.USER_TYPE.ARTIST) {
      throw new AuthenticationError('Action not allowed');
    }
    const artist = await Artist.findOneAndUpdate(
      { userId: user.id },
      { hourlyRate: data.hourlyRate, flatRate: data.flatRate, billingType: data.billingType },
      { new: true },
    );
    if (!artist) {
      throw new UserInputError('Errors', { errors: { artistId: 'Artist profile not found' } });
    }
    return artist;
  }),
};
