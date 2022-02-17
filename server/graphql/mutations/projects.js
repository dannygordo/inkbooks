const { AuthenticationError, UserInputError } = require('apollo-server');
const Project = require('../../models/Project');
const checkAuth = require('../../utils/check-auth');
const { Constants } = require('../../utils/constants');

module.exports = {
  async createProject(
    _,
    {
        title,
        description,
        artistId,
        clientId,
        referenceImages,
        bodyImages,
        designImages,
        materialsUsed,
        notes,
        tags,
        status,
        depositAmount,
    },
    context,
  ) {
    const user = checkAuth(context);
    if(title.trim() === ''){
        throw new UserInputError('Title cannot be empty');
    }
    if(description.trim() === ''){
        throw new UserInputError('Description cannot be empty');
    }
    const newProject = new Project({
        title,
        description,
        artistId,
        clientId,
        referenceImages,
        bodyImages,
        designImages,
        materialsUsed,
        notes,
        tags,
        status,
        depositAmount,
    });
    if(user.role <= Constants.ROLES.CLIENT) {
      const project = await newProject.save();
      return project;
    }
    throw new AuthenticationError('Action not allowed');
  },
  async deleteProject(_, { projectId }, context) {
    const user = checkAuth(context);
    try {
      const project = Project.findById(projectId);
      //TODO: revisit rule that allows a user to delete an project.  Might want to inactive project instead of delete in order to prevent historical documents from breaking
      //TODO: need to allow only admins or artist on project ability to delete project

      //if authenticated user is an admin then delete is permitted, otherwise an authentication error will be thrown
      if (project && user.role === Constants.ROLES.ADMIN) {
        await project.deleteOne({ projectId });
        return 'Project deleted successfully';
      }
      throw new AuthenticationError('Action not allowed');
    } catch (err) {
      throw new Error(err);
    }
  },
};
