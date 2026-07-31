const Project = require('../../models/Project');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const { updateProjectInputSchema, createProjectInputSchema, validate } = require('../../utils/validation');

module.exports = {
  createProject: withAuth(async (
    _,
    {
        title,
        description,
        placement,
        size,
        palette,
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
  ) => {
    // Supersedes the old manual title/description empty-string checks - createProjectInputSchema
    // covers those plus the enum/non-negative checks updateProject already had.
    const { valid, errors } = validate(createProjectInputSchema, {
      title, description, placement, size, palette, artistId, clientId, referenceImages,
      bodyImages, designImages, materialsUsed, notes, tags, status, depositAmount,
    });
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    const newProject = new Project({
        title,
        description,
        placement,
        size,
        palette,
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
    const project = await newProject.save();
    return project;
  }, Constants.ROLES.CLIENT),
  deleteProject: withAuth(async (_, { projectId }) => {
    try {
      const project = await Project.findById(projectId);
      //TODO: revisit rule that allows a user to delete an project.  Might want to inactive project instead of delete in order to prevent historical documents from breaking
      if (project) {
        await Project.deleteOne({ _id: projectId });
        return 'Project deleted successfully';
      }
      throw new Error('Project not found');
    } catch (err) {
      throw new Error(err);
    }
  }, Constants.ROLES.ADMIN),
  // NOTE on project.artistId: per the Project resolver in resolvers/index.js
  // (Artist.findOne({ userId: project.artistId })), artistId stores the artist's *User* _id,
  // not the Artist collection's own _id - so comparing it directly against the JWT's user.id
  // correctly identifies "is this the artist assigned to the project." This OR-ownership check
  // can't be expressed as a single withAuth minRole, so it stays inline.
  updateProject: withAuth(async (_, args, context, info, user) => {
    const project = args.project;
    const { valid, errors } = validate(updateProjectInputSchema, project);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    try{
      const existingProject = await Project.findById(project.id);
      if (
        existingProject &&
        (user.role <= Constants.ROLES.SHOP_ADMIN || String(user.id) === String(existingProject.artistId))
      ) {
        const res = await Project.findByIdAndUpdate({_id: project.id}, project, {new: true});
        return res;
      }
      throw new AuthenticationError('Action not allowed');
    } catch (err) {
        throw new Error(err);
    }
  }),
  updateProjectNotes: withAuth(async (_, { notes, projectId }, context, info, user) => {
    try {
      const existingProject = await Project.findById(projectId);
      if (
        existingProject &&
        (user.role <= Constants.ROLES.SHOP_ADMIN || String(user.id) === String(existingProject.artistId))
      ) {
        const res = await Project.findByIdAndUpdate({_id: projectId}, {notes: notes}, {new: true});
        return res;
      }
      throw new AuthenticationError('Action not allowed');
    } catch( err ) {
      throw new Error(err);
    }
  }),
  updateProjectTags: withAuth(async (_, { tags, projectId }, context, info, user) => {
    try {
      const existingProject = await Project.findById(projectId);
      if (
        existingProject &&
        (user.role <= Constants.ROLES.SHOP_ADMIN || String(user.id) === String(existingProject.artistId))
      ) {
        const res = await Project.findByIdAndUpdate({_id: projectId}, {tags: tags}, {new: true});
        return res;
      }
      throw new AuthenticationError('Action not allowed');
    } catch (err) {
      throw new Error(err);
    }
  })
};
