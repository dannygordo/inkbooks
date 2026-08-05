const Project = require('../../models/Project');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const { updateProjectInputSchema, createProjectInputSchema, validate } = require('../../utils/validation');
const { canManageArtist } = require('../../utils/shop-membership');

// IBImageInput/IBNoteInput's `id` field is GraphQL's name for the field, but Mongoose subdocuments
// use `_id` as their real identity (`id` is only a computed virtual, never a settable schema path -
// same distinction as the Project.client/IBImage.userInfo resolver bugs fixed elsewhere in this
// file's history). Every previous updateProject call sent `id` straight through unchanged, which
// Mongoose's strict-mode casting silently drops as an unrecognized path, auto-generating a brand
// new `_id` for every element of referenceImages/designImages/notes on every single save - not just
// newly-added ones. Confirmed empirically via `Project.schema.path('referenceImages').cast(...)`
// while debugging a real image-upload crash - see PRODUCTION_ROADMAP.md's "known gap" entry.
// Remapping id -> _id here lets Mongoose recognize and preserve each existing subdocument's real
// identity across edits, and lets a genuinely new item's client-generated id (see
// IBProgressItemProject.jsx's `new ObjectID()`) become its real, stable _id instead of being
// discarded and replaced with a random one.
function remapIdToMongoId(items) {
  if (!items) {
    return items;
  }
  return items.map(({ id, ...rest }) => ({ ...rest, _id: id }));
}

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
        referenceImages: remapIdToMongoId(referenceImages),
        bodyImages,
        designImages: remapIdToMongoId(designImages),
        materialsUsed,
        notes: remapIdToMongoId(notes),
        tags,
        status,
        depositAmount,
    });
    const project = await newProject.save();
    return project;
  }, Constants.ROLES.CLIENT),
  // Was ADMIN-gated, i.e. reachable only by the global role that no longer exists. Now the
  // project's own artist, or a shop admin at that artist's shop.
  deleteProject: withAuth(async (_, { projectId }, context, info, user) => {
    try {
      const project = await Project.findById(projectId);
      if (project && !(await canManageArtist(user, project.artistId))) {
        throw new AuthenticationError('Action not allowed');
      }
      //TODO: revisit rule that allows a user to delete an project.  Might want to inactive project instead of delete in order to prevent historical documents from breaking
      if (project) {
        await Project.deleteOne({ _id: projectId });
        return 'Project deleted successfully';
      }
      throw new Error('Project not found');
    } catch (err) {
      throw new Error(err);
    }
  }),
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
        (await canManageArtist(user, existingProject.artistId))
      ) {
        const projectUpdate = {
          ...project,
          referenceImages: remapIdToMongoId(project.referenceImages),
          designImages: remapIdToMongoId(project.designImages),
          notes: remapIdToMongoId(project.notes),
        };
        const res = await Project.findByIdAndUpdate({_id: project.id}, projectUpdate, {new: true});
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
        (await canManageArtist(user, existingProject.artistId))
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
        (await canManageArtist(user, existingProject.artistId))
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
