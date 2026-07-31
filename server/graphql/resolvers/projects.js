const Project = require('../../models/Project');
const withAuth = require('../../utils/with-auth');

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
    getProjectsByArtist: withAuth(async (_, { artistId }) => {
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
