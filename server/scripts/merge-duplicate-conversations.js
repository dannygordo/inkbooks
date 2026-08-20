/**
 * Merges duplicate Conversation documents - two or more conversations that share the exact same
 * member set - into one, and re-points every foreign key that referenced the duplicate(s).
 *
 * WHY THIS EXISTS. mutations/bookingRequests.js's createBookingRequest used to create a brand new
 * Conversation on every call, unconditionally - `new Conversation({members: [...]}).save()` -
 * rather than reusing an existing thread between the same artist and client the way
 * utils/conversations.js's findOrCreateConversationForMembers already does for every OTHER path
 * that opens a conversation (Project.conversation, getProjectConversation). A client who submitted
 * a second booking request to an artist they already had a thread with (a real re-inquiry, or
 * simply testing the form twice) got a second, disconnected Conversation for the exact same two
 * people. That mutation has been fixed to call findOrCreateConversationForMembers instead - this
 * script is the one-time cleanup for duplicates it already created before that fix landed.
 *
 * THE SYMPTOM THIS CAUSES. getConversationsByMemberId (resolvers/conversations.js) lists every
 * Conversation a user belongs to as its own row, so a duplicate pair shows up as two rows with the
 * same displayed name. Whichever one keeps receiving real traffic looks normal; the other sits
 * there with whatever unread state it was last left in, and no amount of opening "that person's
 * name" can ever clear it if the row being looked at and the row real messages flow through are
 * two different documents. This is what was reported as "the first client in the list is never
 * marked read" - marking THAT row read genuinely worked, it just wasn't the row that mattered.
 *
 * THE MERGE. For each set of Conversations sharing an identical member set: the OLDEST
 * (createdAt) is kept as the canonical thread - the one findOrCreateConversationForMembers would
 * have found and reused if the creation bug had never existed. Every Message, BookingRequest, and
 * SharedImage pointing at a duplicate's conversationId is re-pointed at the keeper. Each member's
 * read state (Conversation.reads) is merged across every copy, keeping whichever lastReadAt/
 * lastNotifiedAt is LATER per user - so merging can only make a thread look as read as either
 * side already genuinely knew it to be, never less. The keeper's updatedAt becomes the newest
 * updatedAt across every copy being merged, so its position in a sorted list doesn't regress.
 * The duplicate Conversation documents are deleted once everything they carried has moved.
 *
 * Usage (from server/):
 *   node scripts/merge-duplicate-conversations.js            # apply
 *   node scripts/merge-duplicate-conversations.js --dry-run  # report only, write nothing
 *
 * Requires MONGODB in the environment, same as the app itself - loaded from .env.development
 * below (same as scripts/seed.js) rather than assumed already exported, since this is normally
 * run by hand from a fresh shell that hasn't sourced the app's own env.
 */
// The MongoDB driver bundled under mongoose (node_modules/mongoose/node_modules/mongodb) reads
// globalThis.crypto directly (used internally for session ids - see the ServerSession/uuidV4
// stack in the ReferenceError this throws without it). Node only puts the Web Crypto API on the
// global object by default from v19 onward; node:crypto has exposed the same implementation as
// `webcrypto` since v16.17, just not wired onto `global` before then. Wired up here rather than
// requiring whoever runs this one-off script to also be on the exact Node version the app's own
// server process happens to run under (npm scripts/nodemon can pin a version a bare `node
// scripts/...` invocation from a fresh shell won't inherit).
if (typeof globalThis.crypto === 'undefined') {
  const nodeCrypto = require('crypto');
  if (nodeCrypto.webcrypto) {
    globalThis.crypto = nodeCrypto.webcrypto;
  } else {
    console.error(
      `This script needs Node 16.17+ for Web Crypto support - detected ${process.version}. ` +
        'Upgrade Node (or switch to whatever Node version the rest of this project runs under, ' +
        'e.g. via nvm) and try again.',
    );
    process.exit(1);
  }
}

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env.development') });

const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const BookingRequest = require('../models/BookingRequest');
const SharedImage = require('../models/SharedImage');

const DRY_RUN = process.argv.includes('--dry-run');

function laterDate(a, b) {
  if (!a) return b || undefined;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

function memberSetKey(members) {
  return Array.from(new Set((members || []).map(String))).sort().join(',');
}

async function main() {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error(
      'MONGODB is not set. This should be loaded automatically from server/.env.development - ' +
        'confirm that file exists and defines MONGODB, and that this script is being run from ' +
        'inside server/ (its path to .env.development is relative to this file, not your shell).',
    );
    process.exit(1);
  }
  await mongoose.connect(uri);

  const conversations = await Conversation.find({}).select('_id members reads createdAt updatedAt');
  const groups = new Map();
  for (const conversation of conversations) {
    const key = memberSetKey(conversation.members);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(conversation);
  }

  let groupsWithDuplicates = 0;
  let conversationsDeleted = 0;
  let messagesReassigned = 0;
  let bookingRequestsReassigned = 0;
  let sharedImagesReassigned = 0;

  for (const [key, group] of groups) {
    if (group.length < 2) {
      continue;
    }
    groupsWithDuplicates += 1;

    const sorted = [...group].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    );
    const keeper = sorted[0];
    const duplicates = sorted.slice(1);
    const duplicateIds = duplicates.map((d) => d._id);

    console.log(
      `[merge] members ${key}: keeping ${keeper._id} (oldest, created ${keeper.createdAt?.toISOString?.() || keeper.createdAt}), ` +
        `merging ${duplicateIds.length} duplicate(s): ${duplicateIds.join(', ')}`,
    );

    if (DRY_RUN) {
      const [msgCount, brCount, siCount] = await Promise.all([
        Message.countDocuments({ conversationId: { $in: duplicateIds } }),
        BookingRequest.countDocuments({ conversationId: { $in: duplicateIds } }),
        SharedImage.countDocuments({ conversationId: { $in: duplicateIds } }),
      ]);
      console.log(
        `  would reassign ${msgCount} message(s), ${brCount} booking request(s), ${siCount} shared image(s)`,
      );
      continue;
    }

    const [msgResult, brResult, siResult] = await Promise.all([
      Message.updateMany(
        { conversationId: { $in: duplicateIds } },
        { $set: { conversationId: keeper._id } },
      ),
      BookingRequest.updateMany(
        { conversationId: { $in: duplicateIds } },
        { $set: { conversationId: keeper._id } },
      ),
      SharedImage.updateMany(
        { conversationId: { $in: duplicateIds } },
        { $set: { conversationId: keeper._id } },
      ),
    ]);
    messagesReassigned += msgResult.modifiedCount || 0;
    bookingRequestsReassigned += brResult.modifiedCount || 0;
    sharedImagesReassigned += siResult.modifiedCount || 0;

    // Merge read state across every copy - the keeper's own rows plus every duplicate's - per
    // member, keeping whichever lastReadAt/lastNotifiedAt is LATER. See this file's own header
    // comment on why later-wins is the only safe direction to merge in.
    const mergedReads = new Map();
    for (const conversation of group) {
      for (const row of conversation.reads || []) {
        const userId = String(row.userId);
        const existing = mergedReads.get(userId) || {};
        mergedReads.set(userId, {
          userId: row.userId,
          lastReadAt: laterDate(existing.lastReadAt, row.lastReadAt),
          lastNotifiedAt: laterDate(existing.lastNotifiedAt, row.lastNotifiedAt),
        });
      }
    }
    const newestUpdatedAt = group.reduce(
      (max, c) => (new Date(c.updatedAt) > new Date(max) ? c.updatedAt : max),
      keeper.updatedAt,
    );

    await Conversation.updateOne(
      { _id: keeper._id },
      { $set: { reads: Array.from(mergedReads.values()), updatedAt: newestUpdatedAt } },
    );
    await Conversation.deleteMany({ _id: { $in: duplicateIds } });
    conversationsDeleted += duplicateIds.length;
  }

  console.log('---');
  console.log(`Member-sets with duplicates: ${groupsWithDuplicates}`);
  if (DRY_RUN) {
    console.log('Dry run - nothing was written.');
  } else {
    console.log(`Conversations deleted: ${conversationsDeleted}`);
    console.log(`Messages reassigned: ${messagesReassigned}`);
    console.log(`BookingRequests reassigned: ${bookingRequestsReassigned}`);
    console.log(`SharedImages reassigned: ${sharedImagesReassigned}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
