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
const Artist = require('../../models/Artist');
const Client = require('../../models/Client');
const { DateResolver, DateTimeResolver } = require('graphql-scalars');
const Shop = require('../../models/Shop'); 
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const User = require('../../models/User');

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
  },
  Project: {
    artist: async(project, args, context, info) => {
      return (await Artist.findOne({id: project.artistId}));
    },
    client: async(project, args, context, info) => {
      return (await Client.findOne({id: project.clientId}));
    },
    conversation: async(project, args, context, info) => {
      return (await Conversation.findOne({$and: [{artistId: project.artistId, clientId: project.clientId}]}));
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
    }
  },
  Artist: {
    shop: async(artist, args, context, info) => {
      return (await Shop.findById(artist.shopId));
    },
    user: async(artist, args, context, info) => {
      return (await User.findById(artist.userId));
    }
  },
  Client: {
    user: async(client, args, context, info) => {
      return (await User.findById(client.userId));
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
    user: async(message, args, context, info) => {
      let usr =  (await User.findById(message.senderId));
      if(usr) {
        let userInfo = {};
        switch(usr.userType) {
          case 'artist':
            userInfo = await Artist.findOne({userId: usr.id}).select('-user');
            userInfo.id = userInfo._id;
            return {
              ...usr._doc,
              userInfo: userInfo
            };
          case 'client':
            userInfo = await Client.findOne({userId: usr.id}).select('-user');
            userInfo.id = userInfo._id;
            return {
              ...usr._doc,
              userInfo: userInfo
            }
          case 'staff':
            userInfo = await Staff.findOne({userId: usr.id}).select('-user');
            userInfo.id = userInfo._id;
            return {
              ...usr._doc,
              userInfo: userInfo
            }
        }
        
      }
      return userObject;
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
