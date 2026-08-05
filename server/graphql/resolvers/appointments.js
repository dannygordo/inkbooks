const Appointment = require('../../models/Appointment');
const Staff = require('../../models/Staff');
const Client = require('../../models/Client');
const Project = require('../../models/Project');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
const {
  getShopIdsForUser,
  getArtistIdsForShops,
  sharesShopWith,
  assertCanAccessShop,
  assertCanManageArtist,
} = require('../../utils/shop-membership');
const { paginate } = require('../../utils/pagination');

// getAppointmentsByShop is called for real by Artist- and Staff-role users viewing their own
// shop's calendar (see client/src/components/ibCalendar/IBCalendar.jsx), not just Shop Admins -
// so this can't be a flat role gate the way getPendingShopCutConfirmations is. checkAuth's JWT
// payload only carries {id, email, role} (see utils/check-auth.js/generateToken), no
// userType, so this checks both possible ownership relationships directly rather than branching
// on a userType this function doesn't have.
async function callerBelongsToShop(user, shopId) {
  // No role skips this. It said `role <= SHOP_ADMIN`, which treated a shop admin as belonging to
  // EVERY shop - passing someone else's shopId returned their whole appointment history, money
  // included. Belonging to a shop is a database relationship, never a role number.
  const [isStaffHere, isConnectedArtist] = await Promise.all([
    Staff.exists({ userId: user.id, shopId }),
    ArtistShopConnection.exists({ artistId: user.id, shopId }),
  ]);
  return Boolean(isStaffHere || isConnectedArtist);
}


/**
 * Turns an AppointmentFilter into a Mongo filter.
 *
 * One filter rather than a query per screen. The calendar wants a month, the dashboard wants
 * "upcoming" and "recently completed", the payout list wants "completed and unpaid" - all four
 * used to be the same fetch-everything call with four different client-side passes over the
 * result, which is why an artist's dashboard downloaded their entire career to render two lists
 * of five.
 *
 * Half-open [from, to) on dates, matching utils/analytics.js - so consecutive months don't both
 * claim the appointment that lands exactly on the boundary.
 */
function appointmentFilterToQuery(filter) {
  if (!filter) {
    return {};
  }
  const query = {};

  const dateBounds = {};
  if (filter.from) {
    dateBounds.$gte = new Date(filter.from);
  }
  if (filter.to) {
    dateBounds.$lt = new Date(filter.to);
  }
  // upcomingOnly is resolved HERE, at query time, rather than by the caller passing
  // `from: <now>`. "Upcoming" has to mean ahead of the moment the query runs; a client that
  // computed `now` when it rendered would drift, and a cached one would drift badly.
  if (filter.upcomingOnly) {
    dateBounds.$gte = new Date();
  }
  if (Object.keys(dateBounds).length > 0) {
    query.appointmentDate = dateBounds;
  }

  // "Upcoming" is two conditions, not one: still ahead of now, AND not already dealt with.
  //
  // Only the date half existed, which is how a consult that had already been converted into a
  // session went on sitting in the artist's upcoming list - it was over, but its originally-booked
  // date was still in the future. convertBookingRequest now closes that consult out and pulls its
  // date back to the conversion moment (see mutations/bookingRequests.js), which alone would keep
  // it out of this list - but only by a few milliseconds of clock ordering, which is not a rule.
  // This is the rule. A completed, cancelled or no-show appointment is not upcoming at any date.
  //
  // Skipped when the caller asked for a specific appointmentStatus, since "upcoming AND
  // completed" is a coherent question to ask (it isn't asked today) and silently returning
  // nothing would be a worse answer than the empty set they'd actually get.
  if (filter.upcomingOnly && !filter.appointmentStatus) {
    query.appointmentStatus = { $nin: ['completed', 'cancelled', 'no_show'] };
  }

  if (filter.appointmentStatus) {
    query.appointmentStatus = filter.appointmentStatus;
  }
  if (filter.shopCutStatus) {
    query.shopCutStatus = filter.shopCutStatus;
  }
  return query;
}

module.exports = {
  Query: {
    // Shop-admin-or-better AND at this shop. The minRole alone was the whole check before, so any
    // shop admin could read any other shop's pending confirmations - each of which carries an
    // artist's name and the amount they claim to have paid - by passing a different shopId.
    getPendingShopCutConfirmations: withAuth(async (_, { shopId }, context, info, user) => {
      await assertCanAccessShop(user, shopId);
      return Appointment.find({ shopId, shopCutStatus: 'pending_confirmation' }).sort({
        shopCutMarkedPaidAt: 1,
      });
    }, Constants.ROLES.SHOP_ADMIN),
    // Was withAuth with no role/ownership check at all - any authenticated user (including a
    // Client with no relationship to this shop at all) could pass an arbitrary shopId and read
    // that shop's entire appointment history, including total/tip/shopCutAmount for every artist
    // connected there. Found while building the artist dashboard (see PRODUCTION_ROADMAP.md) -
    // this financial data is exactly what that dashboard now surfaces prominently, which is what
    // made the gap worth fixing rather than just noting. Not a flat role gate - see
    // callerBelongsToShop above for why.
    getAppointmentsByShop: withAuth(async (_, { shopId, filter, page }, context, info, user) => {
      if (!(await callerBelongsToShop(user, shopId))) {
        throw new AuthenticationError('Action not allowed');
      }
      return paginate(Appointment, { shopId, ...appointmentFilterToQuery(filter) }, {
        sort: { appointmentDate: 1 },
        page,
      });
    }),
    // Was withAuth with no ownership check at all - any authenticated user could pass an
    // arbitrary userId and read that artist's entire appointment/financial history. Same
    // "the artist themselves, or shop-admin-or-better" convention already used by
    // getArtistShopConnections/getBookingRequests (see resolvers/artistShopConnections.js /
    // resolvers/bookingRequests.js) - not a new pattern invented for this fix.
    // Widened slightly from "shop-admin-or-better or the artist themselves": Staff at the same
    // shop are now allowed too. The artist directory and per-artist dashboard are being scoped to
    // Staff-and-above (see resolvers/artists.js), and Staff being able to open a page whose
    // central panel then errors out is worse than either allowing or denying it outright. Staff
    // at a DIFFERENT shop stay denied - role alone can't express that, hence sharesShopWith.
    // ARTIST-role callers are unaffected and still only ever see their own history.
    getAppointmentsByArtist: withAuth(async (_, { userId, filter, page }, context, info, user) => {
        // The artist themselves, or Staff-and-above who share a shop with them. A shop admin is
        // in that second group and takes the same shared-shop check as anyone else - previously
        // `role > SHOP_ADMIN` let them skip it and read any artist's financial history.
        if (String(user.id) !== String(userId)) {
          const isSameShopStaff =
            user.role <= Constants.ROLES.SHOP_STAFF && (await sharesShopWith(user.id, userId));
          if (!isSameShopStaff) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        // Sorted by appointmentDate, not updatedAt. Every caller of this is asking a
        // date-shaped question - the next few, the most recent few, a month - and updatedAt
        // ordering made "the first N" mean "the N most recently edited", which is not a thing
        // anybody wants to see. It only went unnoticed because the client re-sorted the whole
        // array itself after fetching all of it.
        return paginate(Appointment, { userId, ...appointmentFilterToQuery(filter) }, {
          sort: { appointmentDate: filter && filter.upcomingOnly ? 1 : -1 },
          page,
        });
      }),
    /**
     * Every shop cut this artist still owes.
     *
     * Deliberately unpaginated - see the note in typeDefs.js. The task is settling a debt, not
     * browsing history, and a batch "invoice all" over a paged list is ambiguous about what it
     * covers.
     *
     * 'unpaid' only: invoice_sent and pending_confirmation already have an action in flight, and
     * showing them here would invite invoicing the same session twice. Requires a shopId, since a
     * cut with no shop attached is an independent artist's session and owed to nobody.
     */
    getShopCutPayoutCandidates: withAuth(async (_, { userId }, context, info, user) => {
      await assertCanManageArtist(user, userId, Constants.ROLES.SHOP_STAFF);
      return Appointment.find({
        userId,
        appointmentStatus: 'completed',
        shopCutStatus: 'unpaid',
        shopId: { $ne: null },
      }).sort({ appointmentDate: 1 });
    }),
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // appointmentId and read its full detail, including total/tip/shopCutAmount. Allowed:
    // shop-admin-or-better, the assigned artist (Appointment.userId, matching
    // getAppointmentsByArtist's convention), or anyone affiliated with the appointment's shop -
    // reusing callerBelongsToShop above rather than a flat gate, for the same reason
    // getAppointmentsByShop can't be one.
    getAppointment: withAuth(async (_, { appointmentId }, context, info, user) => {
      try {
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
          throw new UserInputError('Errors', { errors: { appointmentId: 'Appointment not found.' } });
        }
        if (
          String(user.id) !== String(appointment.userId) &&
          !(await callerBelongsToShop(user, appointment.shopId))
        ) {
          throw new AuthenticationError('Action not allowed');
        }
        return appointment;
      } catch (err) {
        rethrow(err);
      }
    }),
    // Powers the in-project session list (see client/src/pages/projects/Project.jsx) - every
    // session appointment tied to a project, so the artist can see and reopen past sessions'
    // timer/notes/total. Same ownership shape as getProject itself (resolvers/projects.js):
    // shop-admin-or-better, the project's own artist, the project's own client, or shop staff
    // affiliated with the project's artist - checked against the Project, not the individual
    // Appointment, since that's the resource actually being browsed here.
    getAppointmentsByProject: withAuth(async (_, { projectId }, context, info, user) => {
      const project = await Project.findById(projectId);
      if (!project) {
        throw new UserInputError('Errors', { errors: { projectId: 'Project not found.' } });
      }
      if (String(user.id) !== String(project.artistId)) {
        const myClient = await Client.findOne({ userId: user.id }).select('_id');
        const isOwnClient = myClient && String(myClient.id) === String(project.clientId);
        let isShopStaff = false;
        if (!isOwnClient) {
          const shopIds = await getShopIdsForUser(user.id);
          const artistIds = await getArtistIdsForShops(shopIds);
          isShopStaff = artistIds.map(String).includes(String(project.artistId));
        }
        if (!isOwnClient && !isShopStaff) {
          throw new AuthenticationError('Action not allowed');
        }
      }
      try {
        const appointments = await Appointment.find({ projectId }).sort({ appointmentDate: 1 });
        return appointments;
      } catch (err) {
        rethrow(err);
      }
    }),
  },
};
