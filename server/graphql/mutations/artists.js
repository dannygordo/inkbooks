const Artist = require('../../models/Artist');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError, UserInputError, rethrow } = require('../../utils/errors');
const { updateArtistRateSettingsInputSchema, validate } = require('../../utils/validation');
const { assertCanAccessShop, assertCanManageArtist } = require('../../utils/shop-membership');
const { getActiveShopIdForArtist } = require('../../utils/artist-shop');
const { assertNoArchiveTransition } = require('../../utils/archiving');
const { normalizeSlug, assertSlugAvailable } = require('../../utils/booking-slug');

/**
 * "Is the caller an artist?" - answered by whether they have an Artist profile, not by a field on
 * their token.
 *
 * Both self-service mutations below used to ask `user.userType !== ARTIST`. withAuth hands them
 * checkAuth's decoded JWT, and that payload is {id, email, role} - there is no userType on it and
 * never has been. So the comparison was `undefined !== 'artist'`, which is unconditionally true,
 * which means BOTH mutations rejected every caller including the artist they existed for.
 *
 * updateArtistRateSettings has been broken this way the whole time it has existed - an artist has
 * never once been able to save their own rates - and it had no test, so nothing said so. It was
 * found only because updateMyBookingSlug was written by copying its shape and the new mutation
 * did have tests.
 *
 * The fix is the rule this codebase already settled on for shop membership (see
 * utils/shop-membership.js): ask the database about a real relationship rather than branching on
 * something the token claims. An Artist row keyed to this user IS what being an artist means.
 */
async function loadOwnArtistProfile(user) {
  const artist = await Artist.findOne({ userId: user.id });
  if (!artist) {
    // Same message as any other refusal - a non-artist calling this learns nothing about whether
    // some other account exists.
    throw new AuthenticationError('Action not allowed');
  }
  return artist;
}

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
      // Opens an interval if none is open. NOT an upsert on { artistId, shopId } any more: that
      // matched a CLOSED row and reopened it in place, wiping the period the artist had previously
      // worked there - and it set disconnectedAt without clearing endedAt, leaving a row that
      // claimed to be active while still carrying an end date. See models/ArtistShopConnection.js.
      const open = await ArtistShopConnection.findOne({ artistId: userId, shopId, endedAt: null });
      if (!open) {
        await new ArtistShopConnection({
          artistId: userId,
          shopId,
          status: 'active',
          startedAt: new Date(),
          endedAt: null,
        }).save();
      }
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
  // NO ROLE FLOOR, deliberately - DECISIONS.md S2. assertCanManageArtist below already expresses
  // the whole rule: it passes the artist themselves regardless of role, and refuses anyone else
  // who is not SHOP_ADMIN-or-better sharing a shop with them. The `withAuth(fn, SHOP_ADMIN)` floor
  // that used to sit here ran BEFORE the body, so an independent artist - role ARTIST, nobody above
  // them to ask - was refused before that correct check was ever reached. Removing the floor does
  // not loosen anything a shop artist can do: a plain ARTIST calling this on a coworker still
  // fails the `user.role > minRole` branch inside.
  archiveArtist: withAuth(async (_, { artistId }, context, info, user) => {
    const artist = await Artist.findById(artistId);
    if (!artist) {
      throw new UserInputError('Errors', { errors: { artistId: 'Artist not found' } });
    }
    await assertCanManageArtist(user, artist.userId);
    artist.status = Constants.ARTIST_STATUS.ARCHIVED;
    await artist.save();
    return artist;
  }),
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
  }),
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
    // Same shape, different field. ArtistInput still carries shopId because createArtist needs it
    // to know which shop to connect the new artist to - but there is no Artist.shopId to write any
    // more, so an update sending one was being silently discarded. Connecting or moving an artist
    // is connectArtistToShop, which disconnects the old shop and asks before doing it; letting an
    // ordinary profile save do it quietly would put back exactly what that confirmation exists to
    // prevent. See utils/artist-shop.js.
    if (artist.shopId !== undefined && artist.shopId !== null) {
      const currentShopId = await getActiveShopIdForArtist(existing.userId);
      if (String(currentShopId || '') !== String(artist.shopId)) {
        throw new UserInputError('Errors', {
          errors: {
            shopId: 'Use connectArtistToShop to change which shop this artist works at.',
          },
        });
      }
    }
    // Validated and normalised before the write. undefined means "not editing the slug" and is
    // left alone; an explicit empty string means "remove my booking link", which is a legitimate
    // thing to want and must NOT be stored as '' - the unique index treats every empty string as
    // the same value, so the second artist to clear theirs would collide with the first. $unset
    // is what "no slug" actually looks like, and is what the sparse index is built around.
    let slugUpdate = {};
    if (artist.bookingSlug !== undefined) {
      const value = normalizeSlug(artist.bookingSlug);
      if (value === '') {
        slugUpdate = { $unset: { bookingSlug: '' } };
      } else {
        await assertSlugAvailable(value, artist.id);
        artist.bookingSlug = value;
      }
    }
    try{
      // bookingSlug is deleted from the $set payload when it's being unset, since Mongo refuses a
      // field appearing in both $set and $unset in one update.
      const payload = slugUpdate.$unset ? { ...artist } : artist;
      if (slugUpdate.$unset) {
        delete payload.bookingSlug;
      }
      const res = await Artist.findByIdAndUpdate(
        { _id: artist.id },
        { ...payload, ...slugUpdate },
        { new: true },
      );
      return res;
    } catch (err) {
        // A duplicate-key error here means two artists claimed the same slug between the
        // availability check above and this write. The check is a courtesy that produces a good
        // message; the unique index is the actual guarantee. Translated so the loser of that race
        // gets "that link is taken" on the right field rather than a raw E11000.
        if (err && err.code === 11000 && err.keyPattern && err.keyPattern.bookingSlug) {
          throw new UserInputError('Errors', {
            errors: { bookingSlug: 'That booking link is already taken.' },
          });
        }
        rethrow(err);
    }
  }),
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
    // The profile lookup IS the "are you an artist" check - see loadOwnArtistProfile.
    const own = await loadOwnArtistProfile(user);
    return Artist.findByIdAndUpdate(
      own._id,
      { hourlyRate: data.hourlyRate, flatRate: data.flatRate, billingType: data.billingType },
      { new: true },
    );
  }),

  // Self-service booking link, separate from updateArtist for exactly the reason
  // updateArtistRateSettings above is: updateArtist is gated to SHOP_ADMIN-or-better, so a plain
  // ARTIST has never been able to call it on their own record. Their own public booking handle is
  // the clearest possible case of something they should be able to change without asking an
  // admin. Looked up by the caller's own userId rather than a client-supplied artistId, so there
  // is no ownership check to get wrong.
  //
  // An empty slug means "remove my booking link", which is a legitimate choice - their
  // /book/<id> page still works. It has to be $unset rather than stored as '', because the unique
  // index would otherwise treat every artist who cleared theirs as holding the same value.
  updateMyBookingSlug: withAuth(async (_, { slug }, context, info, user) => {
    const existing = await loadOwnArtistProfile(user);

    const value = normalizeSlug(slug);
    const update = value === ''
      ? { $unset: { bookingSlug: '' } }
      : { $set: { bookingSlug: await assertSlugAvailable(value, existing._id) } };

    try {
      return await Artist.findByIdAndUpdate(existing._id, update, { new: true });
    } catch (err) {
      // The availability check above is a courtesy that produces a good message; this index is
      // the actual guarantee. Two artists claiming the same link in the same instant both pass
      // the check and one lands here.
      if (err && err.code === 11000 && err.keyPattern && err.keyPattern.bookingSlug) {
        throw new UserInputError('Errors', {
          errors: { bookingSlug: 'That booking link is already taken.' },
        });
      }
      rethrow(err);
    }
  }),
};
