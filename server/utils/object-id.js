const mongoose = require('mongoose');

/**
 * Coerce an id to a real ObjectId, for use in AGGREGATION PIPELINES.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY THE FAILURE IS SILENT
 *
 * Mongoose casts strings to ObjectIds automatically for a typed path in find/findOne/
 * countDocuments/updateOne. It does NOT do this inside `Model.aggregate()` - a pipeline is handed
 * to Mongo essentially as written.
 *
 * So `{ senderId: { $ne: "6a73c794f2bc..." } }` behaves completely differently depending on which
 * one you pass it to:
 *
 *   countDocuments  - cast to an ObjectId, compares as intended
 *   aggregate       - stays a string, and an ObjectId is never equal to a string in BSON, so
 *                     `$ne` is ALWAYS true and `$eq` is ALWAYS false
 *
 * Nothing errors. The query runs, returns a number, and the number is wrong.
 *
 * This bit for real: the unread-message badge counted your OWN messages against you, because
 * unreadSummaryForUser aggregates while unreadCountForConversation uses countDocuments. The two
 * gave different answers for the same conversation - but only in threads where you had actually
 * replied, which is why it survived a test suite whose fixtures happened to send every message
 * from one side.
 *
 * If you are building a $match, use this. If you find yourself writing String(id) into a pipeline,
 * that is the bug.
 * ---------------------------------------------------------------------------------------------
 */
function toObjectId(id) {
  if (!id) {
    return id;
  }
  return id instanceof mongoose.Types.ObjectId
    ? id
    : new mongoose.Types.ObjectId(String(id));
}

/** The same, for a list. */
function toObjectIds(ids) {
  return (ids || []).filter(Boolean).map(toObjectId);
}

module.exports = { toObjectId, toObjectIds };
