const Artist = require('../../models/Artist');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError, UserInputError, rethrow } = require('../../utils/errors');
const { updateArtistRateSettingsInputSchema, validate } = require('../../utils/validation');
const { assertCanAccessShop, assertCanManageArtist } = require('../../utils/shop-membership');
const { assertNoArchiveTransition } = require('../../utils/archiving');

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
    context,
    info,
    user,
  ) => {
    // A shop admin can only add an artist to their own shop.
    await assertCanAccessShop(user, shopId);
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
      // shopId is accepted (it's what says which shop to put them at) but deliberately not stored
      // on the Artist row - the connection below is the membership record. See
      // utils/artist-shop.js.
      userId,
      status,
    });
    const artist = await newArtist.save();
    // Without this the artist would be invisible everywhere: the directory, the shop calendar's
    // colour list, shop analytics and the shop-cut ledger all resolve membership through
    // connections. createArtistAccount (mutations/accounts.js) already did this; this
    // lower-level mutation didn't, and used to rely on the stored shopId that nothing reads now.
    if (shopId && userId) {
      await ArtistShopConnection.findOneAndUpdate(
        { artistId: userId, shopId },
        { artistId: userId, shopId, status: 'active', disconnectedAt: null },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
    return artist;
  }, Constants.ROLES.SHOP_ADMIN),
  /**
   * Takes an artist off the roster without touching anything they did.
   *
   * Replaces deleteArtist, which removed the Artist row and left the User row, their projects and
   * their appointments behind - money attached to a person who no longer existed. This sets a
   * status and nothing else. Their completed sessions still count toward shop revenue, still
   * render on the calendar in their own colour, and their shop-cut ledger still reconciles.
   */
  archiveArtist: withAuth(async (_, { artistId }, context, info, user) => {
    const artist = await Artist.findById(artistId);
    if (!artist) {
      throw new UserInputError('Errors', { errors: { artistId: 'Artist not found' } });
    }
    await assertCanManageArtist(user, artist.userId);
    artist.status = Constants.ARTIST_STATUS.ARCHIVED;
    await artist.save();
    return artist;
  }, Constants.ROLES.SHOP_ADMIN),
  // Undo, for the archive-by-mistake case and for an artist who comes back. Deliberately restores
  // to ACTIVE rather than to whatever the status was before - remembering the prior value means
  // storing it, and "they're back and taking work" is the only reason to press this.
  unarchiveArtist: withAuth(async (_, { artistId }, context, info, user) => {
    const artist = await Artist.findById(artistId);
    if (!artist) {
      throw new UserInputError('Errors', { errors: { artistId: 'Artist not found' } });
    }
    await assertCanManageArtist(user, artist.userId);
    artist.status = Constants.ARTIST_STATUS.ACTIVE;
    await artist.save();
    return artist;
  }, Constants.ROLES.SHOP_ADMIN),
  updateArtist: withAuth(async (_, args, context, info, user) => {
    // Everything up to the write sits OUTSIDE the try. The catch below rewraps whatever it
    // catches as a plain Error, which flattens a UserInputError's extensions - so an
    // authorization or validation failure would reach the client as an opaque server error
    // instead of the message it carries.
    const artist = args.artist;
    // status is selected explicitly: `.select('userId')` alone left it undefined, so the archive
    // check below would have read every record as unarchived and never fired.
    const existing = await Artist.findById(artist.id).select('userId status');
    if (!existing) {
      throw new UserInputError('Errors', { errors: { id: 'Artist not found' } });
    }
    // A shop admin editing an artist's profile - including their hourly rate - must share a
    // shop with them. The minRole was the entire check before this.
    await assertCanManageArtist(user, existing.userId);
    // Archiving has one door, and this isn't it - see utils/archiving.js.
    assertNoArchiveTransition(existing, artist.status, 'archiveArtist');
    try{
      const res = await Artist.findByIdAndUpdate({_id: artist.id}, artist, {new: true});
      return res;
    } catch (err) {
        rethrow(err);
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
