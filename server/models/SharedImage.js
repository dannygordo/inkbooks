const mongoose = require('mongoose');

/**
 * One row per image URL shared via a message in a client-artist conversation - see
 * utils/shared-images.js for how these get created (a message-send side effect, mirroring
 * notifyNewMessage/sendAutoResponseForIncomingMessage's own best-effort pattern in
 * mutations/messages.js) and graphql/resolvers/sharedImages.js for how they're read and written.
 *
 * DELIBERATELY NOT a duplicate of the image itself - url is the same Firebase Storage download
 * URL the original Message.imageUrls entry already points at (see routes/messageUploads.js).
 * This is an INDEX over shared images for the client-dashboard triage list, plus the metadata
 * (tags, assignment) that list needs and Message itself has no reason to carry.
 *
 * assignedProjectId/assignedImageType/assignedAt/assignedByUserId stay on the row rather than
 * being derived by searching every project's image arrays for a matching url, for the same reason
 * Project.bookingRequestId exists instead of a reverse lookup: "which project did this end up on"
 * is a fact about a moment in time (an artist's choice), not something to re-derive - two projects
 * could plausibly hold a copy of the same shared image if this were derived instead of stored,
 * with no way to say which one is "the" assignment. Deliberately NOT removed from this list once
 * assigned either - see the resolver's own comment on why the badge stays visible instead.
 */
const SharedImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, required: true },
  // The Client document's own _id (NOT the client's User._id) - matches Project.clientId's own
  // convention (see graphql/resolvers/index.js's Project.client resolver comment on why that
  // distinction bites).
  clientId: { type: mongoose.Schema.Types.ObjectId, required: true },
  // The artist's User._id - the other half of the conversation, and what scopes shop-admin
  // visibility (see utils/shop-membership.js's canManageClientSharedImages).
  artistId: { type: mongoose.Schema.Types.ObjectId, required: true },
  // Whoever actually sent this message - the client or the artist. Kept separate from
  // clientId/artistId above (which are fixed per conversation) since either side can share images.
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tags: { type: [String], default: [] },
  assignedProjectId: { type: mongoose.Schema.Types.ObjectId },
  assignedImageType: { type: String, enum: ['REFERENCE', 'DESIGN', 'BODY'] },
  assignedAt: { type: Date },
  assignedByUserId: { type: mongoose.Schema.Types.ObjectId },
}, {
  timestamps: true,
});

SharedImageSchema.index({ clientId: 1, createdAt: -1 });
// One row per image per message - recordSharedImagesForMessage's own best-effort call is
// naturally safe to run twice for the same message (nothing currently retries it, but this is
// the same "idempotent by construction" shape as markConversationRead rather than trusting the
// caller never runs twice).
SharedImageSchema.index({ messageId: 1, url: 1 }, { unique: true });
// Global search (utils/search.js) - the only human-authored text field this collection has. Scoped
// there by projectScopeFilter, the same {artistId}/{clientId} shape Project itself uses, since this
// schema deliberately mirrors those two field names for exactly that kind of reuse.
SharedImageSchema.index({ tags: 'text' }, { name: 'SharedImageTextIndex' });

module.exports = mongoose.model('SharedImage', SharedImageSchema);
