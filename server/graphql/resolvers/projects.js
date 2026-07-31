const Project = require('../../models/Project');
const checkAuth = require('../../utils/check-auth');

const resolvers = {
  Query: {
    async getProjects(parent, args, context) {
      checkAuth(context);
      try {
        const projects = await Project.find().sort({ createdAt: -1 });
        return projects;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getProject(_, { projectId }, context) {
      checkAuth(context);
      try {
        const project = await Project.findById(projectId).sort({ 'notes.createdAt': -1});
        if (project) {
          return project;
        } throw new Error('Project not found');
      } catch (err) {
        throw new Error(err);
      }
    },
    async getProjectsByArtist(_, { artistId }, context) {
      checkAuth(context);
      try {
        const projects = await Project.find({artistId: artistId}).sort({createdAt: -1});
        const results = projects.filter((proj) => {
          return (proj.status !== 'completed' && proj.status !== 'closed');
        });
        return results;
      }catch(err) {
        throw new Error(err);
      }
    }
  }
};

module.exports = resolvers;