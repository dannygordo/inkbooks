/**
 * READ-ONLY diagnostic for a stuck unread badge - "conversation X always shows N unread, no
 * matter what I click or how many times I reload."
 *
 * Written because the leading theory going in (duplicate Conversation documents from the
 * createBookingRequest bug fixed earlier - see merge-duplicate-conversations.js's own header)
 * turned out NOT to be the cause here: that script's dry-run found zero duplicate member-sets.
 * Rather than guess a third time, this dumps the exact raw data the production unread logic
 * (utils/conversation-reads.js) reads from, plus runs that SAME production logic directly, so
 * whatever's actually wrong is visible instead of theorized about.
 *
 * Makes NO writes. Safe to run as many times as you want.
 *
 * Usage (from server/):
 *   node scripts/debug-conversation-unread.js "marta"
 *   node scripts/debug-conversation-unread.js "marta" "haddad"
 *
 * The argument(s) are matched case-insensitively against Client.firstName/lastName/email.
 */

if (typeof globalThis.crypto === 'undefined') {
  const nodeCrypto = require('crypto');
  if (nodeCrypto.webcrypto) {
    globalThis.crypto = nodeCrypto.webcrypto;
  } else {
    console.error(`This script needs Node 16.17+ - detected ${process.version}.`);
    process.exit(1);
  }
}

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env.development') });

const mongoose = require('mongoose');
const Client = require('../models/Client');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { unreadCountForConversation, readRowFor } = require('../utils/conversation-reads');

const searchTerms = process.argv.slice(2);
if (searchTerms.length === 0) {
  console.error('Usage: node scripts/debug-conversation-unread.js <name-or-email-fragment> [more fragments...]');
  process.exit(1);
}

function describeId(raw) {
  if (raw === null || raw === undefined) return `${raw}`;
  return `${raw.toString()} (js-typeof=${typeof raw}, ctor=${raw.constructor && raw.constructor.name})`;
}

async function main() {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('MONGODB is not set - check server/.env.development.');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const regexes = searchTerms.map((t) => new RegExp(t.trim(), 'i'));
  const clients = await Client.find({
    $or: regexes.flatMap((r) => [{ firstName: r }, { lastName: r }, { email: r }]),
  });

  if (clients.length === 0) {
    console.log(`No Client matched ${JSON.stringify(searchTerms)}.`);
    await mongoose.disconnect();
    return;
  }

  for (const client of clients) {
    console.log('='.repeat(100));
    console.log(
      `Client: ${client.firstName} ${client.lastName} <${client.email}> ` +
        `_id=${client._id} userId=${describeId(client.userId)}`,
    );

    const conversations = await Conversation.find({
      members: { $in: [String(client.userId), client.userId] },
    });

    if (conversations.length === 0) {
      console.log('  No Conversation has this client as a member (checked both string and raw-id forms).');
      continue;
    }

    for (const conversation of conversations) {
      console.log('-'.repeat(100));
      console.log(`Conversation ${conversation._id}`);
      console.log(`  createdAt=${conversation.createdAt?.toISOString?.()}  updatedAt=${conversation.updatedAt?.toISOString?.()}`);
      console.log('  members (raw):');
      for (const m of conversation.members || []) {
        console.log(`    - ${describeId(m)}`);
      }
      console.log('  reads (raw):');
      if (!(conversation.reads || []).length) {
        console.log('    (empty - nobody has a read row on this conversation at all)');
      }
      for (const r of conversation.reads || []) {
        console.log(
          `    - userId=${describeId(r.userId)} lastReadAt=${r.lastReadAt ? r.lastReadAt.toISOString() : 'null'} ` +
            `lastNotifiedAt=${r.lastNotifiedAt ? r.lastNotifiedAt.toISOString() : 'null'}`,
        );
      }

      const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
      console.log(`  messages: ${messages.length} total`);
      const last10 = messages.slice(-10);
      for (const msg of last10) {
        const preview = (msg.message || '').slice(0, 50).replace(/\n/g, ' ');
        console.log(
          `    - _id=${msg._id} senderId=${describeId(msg.senderId)} createdAt=${msg.createdAt?.toISOString?.()} ` +
            `imageUrls=${(msg.imageUrls || []).length} text="${preview}"`,
        );
      }

      console.log('  computed unread count per member (using the REAL production function):');
      const memberIds = Array.from(new Set((conversation.members || []).map((m) => String(m))));
      for (const memberId of memberIds) {
        const user = await User.findById(memberId).select('firstName lastName email');
        const row = readRowFor(conversation, memberId);
        const count = await unreadCountForConversation(conversation, memberId);
        console.log(
          `    - ${memberId} (${user ? `${user.firstName} ${user.lastName} <${user.email}>` : 'NO MATCHING USER DOCUMENT'})` +
            ` -> unreadCount=${count}  [their lastReadAt=${row && row.lastReadAt ? row.lastReadAt.toISOString() : 'none'}]`,
        );
      }
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
