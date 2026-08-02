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
const { findOrCreateConversationForMembers } = require('../../utils/conversations');

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
    ...artistShopConnectionResolvers.Query
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
    ...shopCutPaymentMutations
  },
  Project: {
    artist: async(project, args, context, info) => {
      return (await Artist.findOne({userId: project.artistId}));
    },
    client: async(project, args, context, info) => {
      return (await Client.findOne({id: project.clientId}));
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
    }
  },
  IBImage: {
    userInfo: async(ibImage, arts, context, info) => {
      return (await User.findOne({id: ibImage.userId}));
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
    }
  },
  Artist: {
    shop: async(artist, args, context, info) => {
      return (await Shop.findById(artist.shopId));
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
    }
  },
  Conversation: {
    messages: async(conversation, args, context, info) => {
      return (await Message.find({conversationId: conversation.id}).sort({updatedAt: 1}))
    },
    membersInfo: async(conversation, args, context, info) => {
      return (await User.find({_id: {$in: conversation.members}}));
    }
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
