const ArtistShopConnection = require('../../models/ArtistShopConnection');
const User = require('../../models/User');
const Shop = require('../../models/Shop');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const {
  artistShopConnectionInputSchema,
  setRateSourceInputSchema,
  validate,
} = require('../../utils/validation');
const { isUnsetTagColor, pickDefaultTagColor } = require('../../utils/tag-color');

// Same authorization shape as the Query side (see resolvers/artistShopConnections.js) - the
// artist themselves, or a shop-admin-or-better role (Shop has no owning-User field to check
// against a *specific* shop yet).
function assertCanManageConnection(user, artistId) {
  if (user.role > Constants.ROLES.SHOP_ADMIN && String(user.id) !== String(artistId)) {
    throw new AuthenticationError('Action not allowed');
  }
}

module.exports = {
  // Also serves as "reconnect" - see the model's own comment on why disconnect/reconnect reuse
  // the same document (status flips) rather than creating a new row each time. There's no
  // invite-link/shop-directory request-approve flow yet (see PRODUCTION_ROADMAP.md) - this is a
  // direct connect, gated only by the same role check as everything else here.
  connectArtistToShop: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(artistShopConnectionInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    assertCanManageConnection(user, data.artistId);

    const artist = await User.findById(data.artistId);
    if (!artist || artist.userType !== Constants.USER_TYPE.ARTIST) {
      throw new UserInputError('Errors', { errors: { artistId: 'Artist not found' } });
    }
    const shop = await Shop.findById(data.shopId);
    if (!shop) {
      throw new UserInputError('Errors', { errors: { shopId: 'Shop not found' } });
    }

    const connection = await ArtistShopConnection.findOneAndUpdate(
      { artistId: data.artistId, shopId: data.shopId },
      { artistId: data.artistId, shopId: data.shopId, status: 'active', disconnectedAt: null },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    // First time this artist is actually affiliated with a shop, their tagColor may still be the
    // purple "no shop" default from registration (or, for an account that predates this fix, the
    // old white default) - assign one guaranteed not already in use by another artist/staff member
    // at this shop. Never overwrites a tagColor the artist (or an admin) already deliberately
    // chose, even if it happens to collide with a shop-mate right now - see
    // utils/tag-color.js's isUnsetTagColor for exactly what counts as "not a real choice yet".
    if (isUnsetTagColor(artist.tagColor)) {
      artist.tagColor = await pickDefaultTagColor(data.shopId, artist.id);
      await artist.save();
    }

    return connection;
  }),
  // Either party can disconnect at any time, per the design - doesn't touch any Appointment
  // already written under this connection (see the model's comment: the row is kept, not
  // deleted, specifically so past Appointments remain authorized).
  disconnectArtistFromShop: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(artistShopConnectionInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    assertCanManageConnection(user, data.artistId);

    const connection = await ArtistShopConnection.findOne({
      artistId: data.artistId,
      shopId: data.shopId,
    });
    if (!connection) {
      throw new UserInputError('Errors', {
        errors: { shopId: 'No connection exists between this artist and shop' },
      });
    }
    connection.status = 'disconnected';
    connection.disconnectedAt = new Date();
    await connection.save();
    return connection;
  }),
  // Which side's rate (the shop's, or this artist's own) this artist's sessions bill against at
  // this shop - see models/ArtistShopConnection.js's rateSource field and
  // PRODUCTION_ROADMAP.md's "Rates & settings" section for the full design. Same authorization
  // shape as connect/disconnect above - the artist themselves, or shop-admin-or-better.
  setArtistShopRateSource: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(setRateSourceInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    assertCanManageConnection(user, data.artistId);

    const connection = await ArtistShopConnection.findOne({
      artistId: data.artistId,
      shopId: data.shopId,
    });
    if (!connection) {
      throw new UserInputError('Errors', {
        errors: { shopId: 'No connection exists between this artist and shop' },
      });
    }
    connection.rateSource = data.rateSource;
    await connection.save();
    return connection;
  }),
};
