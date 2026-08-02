const Project = require('../../models/Project');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError } = require('../../utils/errors');

const resolvers = {
  Query: {
    getProjects: withAuth(async () => {
      try {
        const projects = await Project.find().sort({ createdAt: -1 });
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
