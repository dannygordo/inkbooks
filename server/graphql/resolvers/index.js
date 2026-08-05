const { tryCheckAuth } = require('../../utils/check-auth');
const artistsResolvers = require('./artists');
const usersResolvers = require('./users');
const artistsMutations = require('../mutations/artists');
const shopResolvers = require('./shops');
const shopMutations = require('../mutations/shops');
const staffMutations = require('../mutations/staff');
const staffResolvers = require('./staff');
const clientMutations = require('../mutations/clients');
const clientResolvers = require('./clients');
const projectMutations = require('../mutations/projects');
const conversationMutations = require('../mutations/conversations');
const conversationResolvers = require('./conversations');
const messageMutations = require('../mutations/messages');
const messageResolvers = require('./messages');
const projectResolvers = require('./projects');
const appointmentResolvers = require('./appointments');
const appointmentMutations = require('../mutations/appointments');
const bookingRequestResolvers = require('./bookingRequests');
const bookingRequestMutations = require('../mutations/bookingRequests');
const artistShopConnectionResolvers = require('./artistShopConnections');
const analyticsResolvers = require('./analytics');
const depositResolvers = require('./deposits');
const passwordResolvers = require('./passwords');
const passwordMutations = require('../mutations/passwords');
const accountMutations = require('../mutations/accounts');
const depositMutations = require('../mutations/deposits');
const artistShopConnectionMutations = require('../mutations/artistShopConnections');
const shopCutPaymentMutations = require('../mutations/shopCutPayments');
const Artist = require('../../models/Artist');
const Client = require('../../models/Client');
const { DateResolver, DateTimeResolver } = require('graphql-scalars');
const Shop = require('../../models/Shop');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const User = require('../../models/User');
const Appointment = require('../../models/Appointment');
const Project = require('../../models/Project');
const Staff = require('../../models/Staff');
const BookingRequest = require('../../models/BookingRequest');
const { findOrCreateConversationForMembers } = require('../../utils/conversations');
const { ensureTagColor } = require('../../utils/tag-color');
const { getActiveShopIdForArtist } = require('../../utils/artist-shop');

// Both Artist.shop and Artist.shopId need the same answer, and a directory asks for it once per
// row - so it goes through the request's loader, which turns N queries into one. Falls back to a
// direct lookup when there's no loader on the context: every real path has one (index.js and
// test/helpers/testServer.js both build them), but a field resolver silently returning null
// because a context was assembled slightly differently is precisely the class of bug this field
// already caused once.
async function resolveArtistShopId(artist, context) {
  if (context && context.loaders && context.loaders.artistShopId) {
    return context.loaders.artistShopId.load(artist.userId);
  }
  return getActiveShopIdForArtist(artist.userId);
}


module.exports = {
  Date: DateResolver,
  DateTime: DateTimeResolver,
  Query: {
    ...artistsResolvers.Query,
    ...shopResolvers.Query,
    ...staffResolvers.Query,
    ...clientResolvers.Query,
    ...usersResolvers.Query,
    ...conversationResolvers.Query,
    ...messageResolvers.Query,
    ...projectResolvers.Query,
    ...appointmentResolvers.Query,
    ...bookingRequestResolvers.Query,
    ...artistShopConnectionResolvers.Query,
    ...analyticsResolvers.Query,
    ...depositResolvers.Query,
    ...passwordResolvers.Query
  },
  Mutation: {
    ...usersResolvers.Mutation,
    ...artistsMutations,
    ...shopMutations,
    ...staffMutations,
    ...clientMutations,
    ...conversationMutations,
    ...messageMutations,
    ...projectMutations,
    ...appointmentMutations,
    ...bookingRequestMutations,
    ...artistShopConnectionMutations,
    ...shopCutPaymentMutations,
    ...depositMutations,
    ...passwordMutations,
    ...accountMutations
  },
  Project: {
    artist: async(project, args, context, info) => {
      return (await Artist.findOne({userId: project.artistId}));
    },
    // Was Client.findOne({id: project.clientId}) - `id` is a Mongoose *virtual* getter, never a
    // real stored field, so that query filter looked for a document with a literal field named
    // `id` that no Client document has ever had. This always returned null, unconditionally, for
    // every single project - not intermittent, not data-dependent. Confirmed the actual client
    // impact via manual testing: IBCardProjectDetails.jsx reads `project.client.avatar`
    // unconditionally (no null check), so the Projects page has crashed for every real project
    // since this resolver was written. Fixed to the same findById pattern already used correctly
    // two lines below in the `conversation` resolver.
    client: async(project, args, context, info) => {
      return (await Client.findById(project.clientId));
    },
    // Was Conversation.findOne({artistId, clientId}) - Conversation's schema (models/Conversation.js)
    // only ever stores members/createdAt/updatedAt, so artistId/clientId never actually exist on a
    // stored document and this always returned null. The Project detail page's "Messages" panel
    // (client/src/pages/projects/Project.jsx) reads this field for real, so that panel has likely
    // never shown an actual conversation. Fixed to find-or-create by membership instead - project.
    // clientId is the Client sub-document's own _id (see the `client` resolver above), so this
    // resolves the client's actual User._id first to build the right member set. This also means
    // an artist/client pair who already have a conversation from a prior BookingRequest (see
    // mutations/bookingRequests.js) get that same thread here too, instead of a disconnected
    // duplicate.
    conversation: async(project, args, context, info) => {
      const client = await Client.findById(project.clientId).select('userId');
      if (!client) {
        return null;
      }
      return findOrCreateConversationForMembers([project.artistId, client.userId]);
    },
    // --- Deposits ------------------------------------------------------------------------------
    // A deposit is collected at the consult and lives on that appointment (see
    // models/Appointment.js on why it's recorded against the transaction that took it). The
    // consult has no projectId - it predates the Project - so the path here runs
    // Project -> bookingRequestId -> the consult created from that same request.
    //
    // Returned as a resolver rather than a stored field so it can't drift: the deposit's real
    // state lives in one place, and this reads it.
    deposits: async(project) => {
      if (!project.bookingRequestId) {
        return [];
      }
      return Appointment.find({
        bookingRequestId: project.bookingRequestId,
        depositCents: { $gt: 0 },
      }).sort({ depositCollectedAt: 1 });
    },
    depositCollectedCents: async(project) => {
      if (!project.bookingRequestId) {
        return 0;
      }
      const rows = await Appointment.find({
        bookingRequestId: project.bookingRequestId,
        depositCents: { $gt: 0 },
      }).select('depositCents');
      return rows.reduce((sum, row) => sum + (row.depositCents || 0), 0);
    },
    // What's still spendable against a session. Distinct from the total collected, because a
    // deposit that's already been credited is gone - showing only the total would imply money
    // still available that isn't.
    depositAvailableCents: async(project) => {
      if (!project.bookingRequestId) {
        return 0;
      }
      const rows = await Appointment.find({
        bookingRequestId: project.bookingRequestId,
        depositStatus: 'available',
        depositCents: { $gt: 0 },
      }).select('depositCents');
      return rows.reduce((sum, row) => sum + (row.depositCents || 0), 0);
    }
  },
  IBImage: {
    // Same bug as Project.client above, same fix - `id` is a virtual, never a real stored field,
    // so this always returned null. CORRECTION to an earlier version of this comment: this was
    // wrongly assumed to be dead/unused code based on a malformed grep that missed real call
    // sites - ProjectService.js's _FETCH_PROJECT_QUERY/GQL_FETCH_PROJECT_QUERY both select this
    // field, and IBImagesList.jsx reads item.userInfo.firstName unconditionally. This resolver
    // being broken is exactly what crashed that component - found via manual testing.
    userInfo: async(ibImage, arts, context, info) => {
      return (await User.findById(ibImage.userId));
    }
  },
  Staff: {
    shop: async(staff, args, context, info) => {
      return (await Shop.findById(staff.shopId));
    },
    user: async(staff, args, context, info) => {
      return (await User.findById(staff.userId));
    },
    // Staff.avatar (the Mongoose field) is a stale duplicate: it's only ever set once, at
    // creation, and nothing keeps it in sync with the one place a user can actually change their
    // picture (Profile.jsx's updateUser mutation, which only writes User.avatar). This resolver
    // makes the GraphQL field always reflect the live value instead, regardless of what's sitting
    // in the Staff document - every existing query that selects `avatar` on Staff gets the fix
    // for free, no client-side changes needed. See PRODUCTION_ROADMAP.md for the full writeup.
    avatar: async(staff, args, context, info) => {
      const user = await User.findById(staff.userId);
      return user ? user.avatar : staff.avatar;
    }
  },
  Appointment: {
    shop: async(appointment, args, context, info) => {
      return (await Shop.findById(appointment.shopId));
    },
    user: async(appointment, args, context, info) => {
      return (await User.findById(appointment.userId));
    },
    project: async(appointment, args, context, info) => {
      return (await Project.findById(appointment.projectId));
    },
    // Only set for a consult/session created via convertBookingRequest (see
    // models/Appointment.js's own comment) - null for "Other" appointments and the
    // existing-project session path, same as bookingRequestId itself being unset for those.
    bookingRequest: async(appointment, args, context, info) => {
      return appointment.bookingRequestId
        ? (await BookingRequest.findById(appointment.bookingRequestId))
        : null;
    }
  },
  Artist: {
    // Derived from the artist's active ArtistShopConnection rather than read off Artist.shopId.
    // Those were two sources of truth for the same fact, and this resolver read the one that
    // connectArtistToShop doesn't write - so an artist connected through the real flow appeared
    // to the whole client as an INDEPENDENT artist. The client sets Appointment.shopId from this
    // field (see UpdateEventDialog.jsx/AppointmentWizard.jsx), so their sessions were being
    // written with no shop at all: no shop cut, and the revenue missing from the shop's books.
    // See utils/artist-shop.js.
    shop: async(artist, args, context, info) => {
      const shopId = await resolveArtistShopId(artist, context);
      return shopId ? (await Shop.findById(shopId)) : null;
    },
    // Same source as `shop` above. Kept as a field so existing callers that only need the id
    // don't have to fetch the whole Shop, but it is NOT the stored Artist.shopId any more.
    shopId: async(artist, args, context, info) => {
      return resolveArtistShopId(artist, context);
    },
    user: async(artist, args, context, info) => {
      return (await User.findById(artist.userId));
    },
    // See the matching comment on Staff.avatar above - same stale-duplicate problem, same fix.
    avatar: async(artist, args, context, info) => {
      const user = await User.findById(artist.userId);
      return user ? user.avatar : artist.avatar;
    }
  },
  Client: {
    user: async(client, args, context, info) => {
      return (await User.findById(client.userId));
    },
    // See the matching comment on Staff.avatar above - same stale-duplicate problem, same fix.
    avatar: async(client, args, context, info) => {
      const user = await User.findById(client.userId);
      return user ? user.avatar : client.avatar;
    },
    // --- Client dashboard (client/src/components/clientDashboard) -------------------------
    // Resolved on demand rather than denormalized onto Client, so there's nothing to keep in
    // sync when a project or appointment changes.
    //
    // Project.clientId is the Client sub-document's own _id, NOT the client's User._id - see the
    // Project.client resolver above, where the same trap is written up in full. Filtering on
    // client.userId here would match nothing, silently, for every client on the platform.
    projects: async(client) => {
      return Project.find({ clientId: client._id }).sort({ createdAt: -1 });
    },
    // A client's appointments are reached through their projects: Appointment has no clientId of
    // its own, only projectId.
    //
    // Known gap, stated rather than hidden: a consult created from a booking request has no
    // Project at all (see models/Appointment.js's bookingRequestId comment), so it is genuinely
    // unreachable this way and won't appear on the dashboard. Closing that needs a real clientId
    // on Appointment, which is a schema change well beyond this feature.
    appointments: async(client) => {
      const projectIds = await Project.find({ clientId: client._id }).distinct('_id');
      if (projectIds.length === 0) {
        return [];
      }
      return Appointment.find({ projectId: { $in: projectIds } }).sort({ appointmentDate: -1 });
    }
  },
  BookingRequest: {
    client: async(bookingRequest, args, context, info) => {
      return (await Client.findById(bookingRequest.clientId));
    },
    conversation: async(bookingRequest, args, context, info) => {
      // Conversation.messages is already a resolved field below (Conversation.messages) - a
      // client querying `booking { conversation { messages { ... } } }` gets the full thread
      // for free, no separate booking-request-specific message resolver needed.
      return (await Conversation.findById(bookingRequest.conversationId));
    },
    // Null until this request has been converted (resultingAppointmentId only gets set at that
    // point - see convertBookingRequest). Lets a caller go straight from a just-converted
    // BookingRequest to e.g. the new session's Project (appointment.projectId) in the same round
    // trip, rather than a separate getAppointment(resultingAppointmentId) query - see
    // ConsultDetail.jsx's "Convert to Session" action.
    resultingAppointment: async(bookingRequest, args, context, info) => {
      return bookingRequest.resultingAppointmentId
        ? (await Appointment.findById(bookingRequest.resultingAppointmentId))
        : null;
    }
  },
  Conversation: {
    // Sorted by createdAt, not updatedAt. They were the same until editing a message became
    // possible; after that, sorting by updatedAt makes an edited message jump to the bottom of the
    // thread as though it had just been sent. A message's place in a conversation is when it was
    // sent.
    messages: async(conversation, args, context, info) => {
      return (await Message.find({conversationId: conversation.id}).sort({createdAt: 1}))
    },
    membersInfo: async(conversation, args, context, info) => {
      return (await User.find({_id: {$in: conversation.members}}));
    },
    // The CALLER's unread count for this thread, from the per-request memoiser - so a list of a
    // dozen conversations is one aggregation rather than a dozen counts. See utils/loaders.js.
    //
    // Zero rather than a thrown error for an unauthenticated caller: this field hangs off queries
    // that already enforce their own access (getConversationsByMemberId is self-only), and a
    // notification count is not the place to introduce a second, differently-shaped auth failure.
    unreadCount: async(conversation, args, context) => {
      const caller = tryCheckAuth(context);
      if (!caller) {
        return 0;
      }
      const summary = await context.loaders.unread.summaryFor(caller.id);
      return summary.byConversationId.get(String(conversation._id)) || 0;
    },
  },
  Message: {
    // Had three real bugs: (1) `Staff` was never imported in this file, so any message from a
    // staff-type sender threw a ReferenceError the moment this resolver ran; (2) the fallback
    // path returned `userObject`, a variable that doesn't exist anywhere in this file - also a
    // guaranteed ReferenceError, hit whenever the sender's User doc is missing or has a userType
    // outside artist/client/staff; (3) `userInfo.id = userInfo._id` was called unconditionally,
    // which throws if the matching Artist/Client/Staff sub-document doesn't exist (e.g. it was
    // deleted after the message was sent) - all three would have crashed the whole
    // getProject/getConversationsByMemberId query, not just this one field, since a thrown field
    // resolver error propagates up through GraphQL's response.
    user: async(message, args, context, info) => {
      const usr = await User.findById(message.senderId);
      if (!usr) {
        return null;
      }
      let userInfo = null;
      switch (usr.userType) {
        case 'artist':
          userInfo = await Artist.findOne({ userId: usr.id }).select('-user');
          break;
        case 'client':
          userInfo = await Client.findOne({ userId: usr.id }).select('-user');
          break;
        case 'staff':
          userInfo = await Staff.findOne({ userId: usr.id }).select('-user');
          break;
      }
      if (userInfo) {
        userInfo.id = userInfo._id;
      }
      // Spreading usr._doc (the raw Mongoose internal document) loses Mongoose's `id` virtual -
      // the copy only has `_id`, not `id`. User.id is `ID!` (non-null) in the schema, so any
      // query that selects `message.user.id` (not previously exercised by any existing client
      // query, but a completely reasonable one to add) would fail with "Cannot return null for
      // non-nullable field User.id". Setting it explicitly from the real document's `id` virtual
      // fixes this without changing anything else about the returned shape.
      return {
        ...usr._doc,
        id: usr.id,
        userInfo,
      };
    }
  },
  User: {
    // Every artist must have a real tag color, and "they'll get one next time they log in" (the
    // self-heal in resolvers/users.js's login) isn't sufficient on its own: a shop calendar shows
    // every shop-mate's appointments, so artist A can be looking at labels for artists B through
    // G, none of whom have necessarily logged in since the default was fixed. Those labels were
    // rendering white text on the old '#fff' default - invisible, which is what was reported from
    // an artist.jonas login. Healing the *viewer* can't fix the people being *viewed*, so the
    // guarantee is enforced here, on read of the field itself, for whoever is being displayed.
    //
    // Same shape as the Staff.avatar resolver above: the stored value is stale/wrong, so the
    // GraphQL field returns the corrected one and every existing query that selects tagColor gets
    // the fix with no client change. Unlike Staff.avatar this one also writes the corrected value
    // back (see ensureTagColor), so it converges - it's a no-op on every subsequent read for that
    // user rather than recomputing forever. server/scripts/backfill-tag-colors.js does the same
    // thing in bulk for anyone who never happens to be rendered.
    tagColor: async (user) => ensureTagColor(user),
  },
  UserInfo: {
    __resolveType(user, context, info) {
      if(user.hourlyRate) {
        return 'Artist';
      }
      if(user.title) {
        return 'Staff';
      }
      if(!user.hourlyRate && !user.title){
        return 'Client';
      }
    }
  }
};
