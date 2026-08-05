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
const { assertCanAccessShop } = require('../../utils/shop-membership');

// The artist themselves, or a shop admin OF THIS SHOP. The old version was role-only ("a shop
// admin, of anywhere"), which meant any shop admin could attach an artist to - or detach them
// from - a shop neither of them has anything to do with, and set that artist's rate there.
//
// The artist's own case can't go through assertCanAccessShop: connecting is precisely how they
// become a member, so they aren't one yet at this point. There's no invite/approve flow (see
// PRODUCTION_ROADMAP.md), so a direct self-connect stays allowed.
async function assertCanManageConnection(user, artistId, shopId) {
  if (String(user.id) === String(artistId)) {
    return;
  }
  if (user.role > Constants.ROLES.SHOP_ADMIN) {
    throw new AuthenticationError('Action not allowed');
  }
  await assertCanAccessShop(user, shopId);
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
    await assertCanManageConnection(user, data.artistId, data.shopId);

    const artist = await User.findById(data.artistId);
    if (!artist || artist.userType !== Constants.USER_TYPE.ARTIST) {
      throw new UserInputError('Errors', { errors: { artistId: 'Artist not found' } });
    }
    const shop = await Shop.findById(data.shopId);
    if (!shop) {
      throw new UserInputError('Errors', { errors: { shopId: 'Shop not found' } });
    }

    // An artist works at ONE shop at a time. That's a product decision, not a technical limit -
    // and enforcing it here rather than tolerating multiples is what makes "which shop does this
    // artist work at" answerable with no precedence rule. Artist.shop/shopId are resolved from
    // this single active connection (see utils/artist-shop.js).
    //
    // The realistic way an artist ends up connected twice isn't a guest spot, it's mundane: they
    // move shops and nobody remembers to disconnect them from the old one, because leaving a shop
    // isn't an event anyone thinks to record in software. So connecting somewhere new is treated
    // as exactly that record.
    //
    // Refused unless the caller has confirmed. The refusal carries the name of the shop being
    // left in extensions.transfer so the client can name it before asking - a message that says
    // "you'll be disconnected from your current shop" without saying which one is not a warning
    // anyone can act on. Safe by default: a caller that knows nothing about confirmTransfer can
    // never silently move an artist off their shop.
    const existingElsewhere = await ArtistShopConnection.find({
      artistId: data.artistId,
      status: 'active',
      shopId: { $ne: data.shopId },
    });

    if (existingElsewhere.length > 0 && !data.confirmTransfer) {
      const currentShops = await Shop.find({
        _id: { $in: existingElsewhere.map((c) => c.shopId) },
      }).select('name');
      const names = currentShops.map((c) => c.name).filter(Boolean);
      throw new UserInputError('Errors', {
        errors: {
          confirmTransfer:
            `This will disconnect ${names.length === 1 ? names[0] : 'the current shop'} and ` +
            `connect ${shop.name}. Confirm to continue.`,
        },
        // Structured alongside the message so the client can build its own dialog rather than
        // parsing prose - see Settings.jsx.
        transfer: {
          requiresConfirmation: true,
          currentShops: currentShops.map((c) => ({ id: String(c._id), name: c.name })),
          newShop: { id: String(shop._id), name: shop.name },
        },
      });
    }

    // Confirmed (or nothing to leave). Ending the old connection first means there is never a
    // moment where two are active, even if the second write fails.
    if (existingElsewhere.length > 0) {
      await ArtistShopConnection.updateMany(
        { artistId: data.artistId, status: 'active', shopId: { $ne: data.shopId } },
        { $set: { status: 'disconnected', disconnectedAt: new Date() } },
      );
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
    await assertCanManageConnection(user, data.artistId, data.shopId);

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
    await assertCanManageConnection(user, data.artistId, data.shopId);

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
