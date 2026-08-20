const SharedImage = require('../../models/SharedImage');
const Client = require('../../models/Client');
const Project = require('../../models/Project');
const withAuth = require('../../utils/with-auth');
const { UserInputError } = require('../../utils/errors');
const { assertCanManageClientSharedImages } = require('../../utils/shop-membership');

/**
 * The client-dashboard shared-images triage list: every image shared via a message (by either
 * side of a client-artist conversation - see utils/shared-images.js for how a SharedImage row
 * gets created), plus the ability to tag one, file it onto a project, or drop it from the list.
 *
 * Reuses client/src/components/ibImagesList/IBImagesList.jsx - the same component the project
 * image lists already use for tagging/lightbox/delete - which is why SharedImage's GraphQL shape
 * (typeDefs.js) mirrors IBImage's field names rather than inventing new ones. Its `userInfo`/
 * `assignedProject` field resolvers live in resolvers/index.js alongside IBImage's own, same
 * convention as every other custom-type field resolver in this codebase.
 */
const VALID_IMAGE_TYPES = ['REFERENCE', 'DESIGN', 'BODY'];
const PROJECT_FIELD_FOR_IMAGE_TYPE = {
  REFERENCE: 'referenceImages',
  DESIGN: 'designImages',
  BODY: 'bodyImages',
};

module.exports = {
  Query: {
    getSharedImagesForClient: withAuth(async (_, { clientId }, context, info, user) => {
      const client = await Client.findById(clientId);
      await assertCanManageClientSharedImages(user, client);
      return SharedImage.find({ clientId }).sort({ createdAt: -1 });
    }),

    getProjectsForClient: withAuth(async (_, { clientId }, context, info, user) => {
      const client = await Client.findById(clientId);
      await assertCanManageClientSharedImages(user, client);
      return Project.find({ clientId }).sort({ createdAt: -1 });
    }),
  },

  Mutation: {
    assignSharedImageToProject: withAuth(
      async (_, { sharedImageId, projectId, imageType }, context, info, user) => {
        if (!VALID_IMAGE_TYPES.includes(imageType)) {
          throw new UserInputError('Errors', {
            errors: { imageType: 'Must be one of REFERENCE, DESIGN, BODY.' },
          });
        }
        const sharedImage = await SharedImage.findById(sharedImageId);
        if (!sharedImage) {
          throw new UserInputError('Errors', { errors: { sharedImageId: 'Image not found.' } });
        }
        const client = await Client.findById(sharedImage.clientId);
        await assertCanManageClientSharedImages(user, client);

        const project = await Project.findById(projectId).select('clientId');
        // Cross-client assignment isn't a UI path today, but the mutation itself is the real
        // boundary - see this file's own header comment on why every row here is re-checked
        // rather than trusted from how the caller says they got here.
        if (!project || String(project.clientId) !== String(sharedImage.clientId)) {
          throw new UserInputError('Errors', {
            errors: { projectId: "That project doesn't belong to this image's client." },
          });
        }

        const field = PROJECT_FIELD_FOR_IMAGE_TYPE[imageType];
        const now = new Date();
        // Copies the URL into the project's own list - a real IBImage subdocument, not a
        // reference - so the project page keeps working exactly as it does today even if this
        // SharedImage row is later removed from the client-dashboard list (removeSharedImageFromList
        // below never touches a project's own copy).
        await Project.updateOne(
          { _id: projectId },
          {
            $push: {
              [field]: {
                url: sharedImage.url,
                userId: sharedImage.senderId,
                tags: sharedImage.tags,
                createdAt: sharedImage.createdAt,
                updatedAt: now,
              },
            },
          },
        );

        sharedImage.assignedProjectId = projectId;
        sharedImage.assignedImageType = imageType;
        sharedImage.assignedAt = now;
        sharedImage.assignedByUserId = user.id;
        await sharedImage.save();
        return sharedImage;
      },
    ),

    updateSharedImageTags: withAuth(async (_, { sharedImageId, tags }, context, info, user) => {
      const sharedImage = await SharedImage.findById(sharedImageId);
      if (!sharedImage) {
        throw new UserInputError('Errors', { errors: { sharedImageId: 'Image not found.' } });
      }
      const client = await Client.findById(sharedImage.clientId);
      await assertCanManageClientSharedImages(user, client);
      sharedImage.tags = tags;
      await sharedImage.save();
      return sharedImage;
    }),

    removeSharedImageFromList: withAuth(async (_, { sharedImageId }, context, info, user) => {
      const sharedImage = await SharedImage.findById(sharedImageId);
      if (!sharedImage) {
        // Already gone - same idempotent-delete convention as the rest of this codebase (e.g.
        // markConversationUnreadForUser's own "nothing to do" no-op).
        return true;
      }
      const client = await Client.findById(sharedImage.clientId);
      await assertCanManageClientSharedImages(user, client);
      await SharedImage.deleteOne({ _id: sharedImageId });
      return true;
    }),
  },
};
