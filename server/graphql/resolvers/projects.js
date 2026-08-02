const Project = require('../../models/Project');
const Client = require('../../models/Client');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError } = require('../../utils/errors');
const { getShopIdsForUser, getArtistIdsForShops } = require('../../utils/shop-membership');

const resolvers = {
  Query: {
    // Was withAuth with no restriction at all - any authenticated user, including a Client,
    // could list every project (client name/email, artist, notes, reference images, deposit
    // amount) on the entire platform. SHOP_ADMIN-or-better still sees everyone - see the matching
    // comment in resolvers/shops.js. Artist sees only their own projects (same scope
    // getProjectsByArtist already enforces below). Staff sees projects belonging to their own
    // shop's artists. Client sees only their own projects - note Project.clientId is the Client
    // sub-document's own _id, not the client's User._id (see resolvers/index.js's Project.client
    // resolver), so this looks up the caller's own Client doc first.
    getProjects: withAuth(async (_, __, context, info, user) => {
      try {
        let filter = {};
        if (user.role <= Constants.ROLES.SHOP_ADMIN) {
          filter = {};
        } else if (user.role === Constants.ROLES.ARTIST) {
          filter = { artistId: user.id };
        } else if (user.role === Constants.ROLES.SHOP_STAFF) {
          const shopIds = await getShopIdsForUser(user.id);
          const artistIds = await getArtistIdsForShops(shopIds);
          if (artistIds.length === 0) {
            return [];
          }
          filter = { artistId: { $in: artistIds } };
        } else {
          const myClient = await Client.findOne({ userId: user.id }).select('_id');
          if (!myClient) {
            return [];
          }
          filter = { clientId: myClient.id };
        }
        const projects = await Project.find(filter).sort({ createdAt: -1 });
        return projects;
      } catch (err) {
        throw new Error(err);
      }
    }),
    getProject: withAuth(async (_, { projectId }) => {
      try {
        const project = await Project.findById(projectId).sort({ 'notes.createdAt': -1});
        if (project) {
          return project;
        } throw new Error('Project not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
    // Was withAuth with no ownership check at all - any authenticated user could pass an
    // arbitrary artistId and read that artist's active project list. Same "the artist
    // themselves, or shop-admin-or-better" convention as getAppointmentsByArtist
    // (see resolvers/appointments.js) and getArtistShopConnections/getBookingRequests.
    getProjectsByArtist: withAuth(async (_, { artistId }, context, info, user) => {
      if (user.role > Constants.ROLES.SHOP_ADMIN && String(user.id) !== String(artistId)) {
        throw new AuthenticationError('Action not allowed');
      }
      try {
        const projects = await Project.find({artistId: artistId}).sort({createdAt: -1});
        const results = projects.filter((proj) => {
          return (proj.status !== 'completed' && proj.status !== 'closed');
        });
        return results;
      }catch(err) {
        throw new Error(err);
      }
    })
  }
};

module.exports = resolvers;
