const Project = require('../../models/Project');

const resolvers = {
  Query: {
    async getProjects(parent, args, context, info ) {
      try {
          //console.log(info);
        const projects = await Project.find().sort({ createdAt: -1 });
        return projects;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getProject(_, { projectId }) {
      try {
        const project = await Project.findById(projectId);
        if (project) {
          return project;
        } throw new Error('Project not found');
      } catch (err) {
        throw new Error(err);
      }
    },
  }
};

module.exports = resolvers;