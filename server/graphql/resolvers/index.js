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
const projectResolvers = require('./projects');
const Artist = require('../../models/Artist');
const Client = require('../../models/Client');
const { DateResolver } = require('graphql-scalars');
const Shop = require('../../models/Shop');

module.exports = {
  Date: DateResolver,
  Query: {
    ...artistsResolvers.Query,
    ...shopResolvers.Query,
    ...staffResolvers.Query,
    ...clientResolvers.Query,
    ...usersResolvers.Query,
    ...projectResolvers.Query,
  },
  Mutation: {
    ...usersResolvers.Mutation,
    ...artistsMutations,
    ...shopMutations,
    ...staffMutations,
    ...clientMutations,
    ...projectMutations,
  },
  Project: {
    artist: async(project, args, context, info) => {
      return (await Artist.findOne({id: project.artistId}));
    },
    client: async(project, args, context, info) => {
      return (await Client.findOne({id: project.clientId}));
    }
  },
  Staff: {
    shop: async(staff, args, context, info) => {
      return (await Shop.findById(staff.shopId));
    }
  }
};
