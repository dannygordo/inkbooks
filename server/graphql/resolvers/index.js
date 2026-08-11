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
const notificationResolvers = require('./notifications');
const messageMutations = require('../mutations/messages');
const messageResolvers = require('./messages');
const projectResolvers = require('./projects');
const appointmentResolvers = require('./appointments');
const appointmentMutations = require('../mutations/appointments');
const bookingRequestResolvers = require('./bookingRequests');
const bookingRequestMutations = require('../mutations/bookingRequests');
const artistShopConnectionResolvers = require('./artistShopConnections');
const shopCutRateResolvers = require('./shopCutRates');
const analyticsResolvers = require('./analytics');
const depositResolvers = require('./deposits');
const passwordResolvers = require('./passwords');
const passwordMutations = require('../mutations/passwords');
const accountMutations = require('../mutations/accounts');
const depositMutations = require('../mutations/deposits');
const artistShopConnectionMutations = require('../mutations/artistShopConnections');
const shopCutPaymentMutations = require('../mutations/shopCutPayments');
const { Constants } = require('../../utils/constants');
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
const { findAccountForOwner } = require('../../utils/square-account');

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
    ...shopCutRateResolvers.Query,
    ...analyticsResolvers.Query,
    ...depositResolvers.Query,
    ...passwordResolvers.Query,
    ...notificationResolvers.Query
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
    ...shopCutRateResolvers.Mutation,
    ...shopCutPaymentMutations,
    ...depositMutations,
    ...passwordMutations,
    ...accountMutations,
    ...notificationResolvers.Mutation
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
    // Resolved rather than read straight off the document, because both fields are non-null in the
    // schema and a record written BEFORE durationMinutes existed has no value for it. A Mongoose
    // default applies on save, not on read - so an old appointment would come back undefined and
    // GraphQL would null out the whole query rather than that one field. The dev database gets
    // re-seeded, but "every historical row is fine" is not a thing worth betting a page on.
    durationMinutes: (appointment) =>
      appointment.durationMinutes || Appointment.defaultDurationFor(appointment.appointmentType),
    // Derived from start + duration. Computed here as well as in the model's virtual so it survives
    // a .lean() query, which drops virtuals silently.
    appointmentEnd: (appointment) => {
      const minutes =
        appointment.durationMinutes || Appointment.defaultDurationFor(appointment.appointmentType);
      return new Date(new Date(appointment.appointmentDate).getTime() + minutes * 60 * 1000);
    },
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
  // The three Square fields on Shop are now DERIVED from SquareAccount (DECISIONS.md M9) rather
  // than stored on the shop document. The GraphQL contract is deliberately unchanged - Shop.jsx
  // and ShopService.js both already ask for these three by name, and breaking the schema to move a
  // server-side storage detail would make the client pay for a decision it has no stake in.
  //
  // Only the non-secret fields, exactly as before: the encrypted tokens never leave the server.
  Shop: {
    squareConnected: async (shop) => {
      const account = await findAccountForOwner('SHOP', shop._id);
      return Boolean(account && account.connected);
    },
    squareLocationId: async (shop) => {
      const account = await findAccountForOwner('SHOP', shop._id);
      return account ? account.locationId || null : null;
    },
    squareConnectedAt: async (shop) => {
      const account = await findAccountForOwner('SHOP', shop._id);
      return account ? account.connectedAt || null : null;
    },
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
      // Unscoped ('all') deliberately. This answers about ONE conversation that the caller has
      // already been handed, so it must be right regardless of which section that conversation
      // belongs to - the booking-request list needs a real count for its threads just as the
      // messenger does. The section badges are the scoped ones; this is not a badge.
      const summary = await context.loaders.unread.summaryFor(caller.id, 'all');
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
    // THE PROFILE LOOKUP THAT USED TO LIVE HERE IS GONE. This was the third hand-written copy of
    // "which record is this user's userInfo" - a three-branch switch identical in intent to the one
    // in login() and to the one registerAccount forgot to write, which is how that bug happened.
    // User.userInfo is a field resolver now (below), so returning the document is enough, and the
    // lookup only runs when the field is actually selected rather than on every message in a
    // thread.
    //
    // The Mongoose document is returned directly rather than spread. The old version spread
    // `usr._doc` and then had to put `id` back by hand, because spreading loses Mongoose's `id`
    // virtual and User.id is `ID!` - a copy that drops a non-nullable field is a strange shape to
    // hand to GraphQL when the original is right there.
    user: async (message) => User.findById(message.senderId)
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

    /**
     * The Artist / Staff / Client record behind this account.
     *
     * A FIELD RESOLVER, not something each mutation assembles for itself. login() used to build
     * this by hand and put it on its return object, which meant the rule "a User's userInfo is the
     * profile row matching its userType" lived inside one resolver. registerAccount then returned
     * `{ ...newUser._doc, id, accessToken, firebaseToken }` with no userInfo at all - and nothing
     * failed. GraphQL happily returned null for a nullable field, so a freshly signed-up account
     * reached the dashboard with userInfo undefined, Settings decided it wasn't an artist
     * ("Nothing to configure here yet for this account type") and the only fix was logging out and
     * back in, because logging in was the one code path that knew how to fill it. Every future
     * mutation that returns a User would have had the same hole available to it.
     *
     * Defined once, here, it is now impossible to return a User that can't produce its own
     * userInfo, whatever created it.
     *
     * `parent` may be a Mongoose document (getUser) or a plain object spread from one (login,
     * registerAccount), so the id is read from either shape.
     *
     * NULL IS A LEGITIMATE ANSWER. The seeded `platformadmin` is userType STAFF with deliberately
     * no Staff row; an earlier version crashed on exactly that, so the absence is returned rather
     * than thrown. Callers already optional-chain (user.userInfo?.shop?.id appears throughout the
     * client).
     */
    userInfo: async (parent) => {
      const profileModelByType = {
        [Constants.USER_TYPE.ARTIST]: Artist,
        [Constants.USER_TYPE.CLIENT]: Client,
        [Constants.USER_TYPE.STAFF]: Staff,
      };
      const ProfileModel = profileModelByType[parent.userType];
      if (!ProfileModel) {
        return null;
      }
      const userId = parent._id || parent.id;
      if (!userId) {
        return null;
      }
      return ProfileModel.findOne({ userId }).select('-user');
    },
  },
  UserInfo: {
    /**
     * Which of the three profile types this record is.
     *
     * KEYED OFF THE COLLECTION IT CAME FROM, not off whether a field happens to be filled in. The
     * previous version returned 'Artist' only when `hourlyRate` was truthy - and Artist.hourlyRate
     * has no default (see models/Artist.js), so a brand new artist who hasn't set a rate yet fell
     * through to the `!hourlyRate && !title` branch and was reported as a Client. Every
     * `... on Artist { shop { id } }` fragment then matched nothing, so the shop id the wizard and
     * the client read off userInfo was silently absent. An artist who charges a flat rate rather
     * than an hourly one hit the same thing permanently.
     *
     * That is the general failure mode of shape-sniffing: it makes an OPTIONAL field load-bearing
     * for identity, so leaving it blank changes what you are. Mongoose documents already carry the
     * answer on `constructor.modelName`, which is not optional and cannot be blank.
     *
     * The old heuristic is kept only as a fallback for plain objects (test fixtures and anything
     * hand-built), and `title` is checked before `hourlyRate` there so a rate-less Staff row still
     * resolves correctly.
     */
    __resolveType(userInfo) {
      const modelName = userInfo?.constructor?.modelName;
      if (modelName === 'Artist' || modelName === 'Staff' || modelName === 'Client') {
        return modelName;
      }
      if (userInfo?.title) {
        return 'Staff';
      }
      if (userInfo?.hourlyRate || userInfo?.bookingSlug || userInfo?.billingType) {
        return 'Artist';
      }
      return 'Client';
    }
  }
};
