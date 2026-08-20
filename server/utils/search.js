const Client = require('../models/Client');
const Project = require('../models/Project');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const SharedImage = require('../models/SharedImage');
const { clientScopeFilter, projectScopeFilter } = require('./shop-membership');

/**
 * Global search: Clients, Projects, Messages, and shared-images-by-tag, grouped by type, scoped
 * to what the caller could otherwise already list.
 *
 * NO NEW AUTHORIZATION RULES. Clients and Projects are scoped by clientScopeFilter/
 * projectScopeFilter (utils/shop-membership.js) - the exact same filters getClients/getProjects
 * apply, extracted specifically so search can reuse them rather than reimplement a second, subtly
 * different version of "what can this person see." SharedImage reuses projectScopeFilter's own
 * {artistId}/{clientId} filter unchanged rather than a fourth scope function - SharedImage carries
 * the same two field names Project does for exactly this reuse (see models/SharedImage.js), and
 * that shape already matches canManageClientSharedImages' per-record rule (an artist with a project
 * for this client, or a shop admin/staff at one of the client's shops) at the bulk-filter level.
 * Messages have no equivalent existing list query to reuse, so conversationScopeFilter below is
 * search-specific - see its own comment for why it's the conservative reading rather than the
 * fuller one canAccessConversation allows.
 */

// Per type, when the caller doesn't ask for a specific amount - the app bar's live dropdown,
// which wants results small enough to stay scannable inline. The dedicated /search results page
// (client/src/pages/search/Search.jsx) asks for more explicitly via the `limit` argument.
const RESULTS_PER_TYPE = 8;

// However large a page is allowed to ask for. Not unbounded - "search" is still a query over
// three collections run on every keystroke's worth of debounce, and an arbitrary limit from the
// caller is an arbitrary amount of extra find/sort work per type.
const MAX_RESULTS_PER_TYPE = 50;

function clampLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1) {
    return RESULTS_PER_TYPE;
  }
  return Math.min(limit, MAX_RESULTS_PER_TYPE);
}

/**
 * Which conversations a caller may search the CONTENTS of.
 *
 * DELIBERATELY NARROWER than canAccessConversation (utils/shop-membership.js), which also admits
 * a shop-admin-or-better who shares a shop with a member even if the admin isn't in the
 * conversation themselves. That rule is right for opening one conversation someone already linked
 * you to; it is the wrong default for a search box that will happily surface message CONTENT the
 * admin has never been shown. Restricting to conversations the caller is literally a member of is
 * the safe direction to be wrong in - it can only under-return, never leak a thread nobody put
 * this person in. A shop admin who needs to search a conversation they're not part of still has
 * ordinary access to it through the Messenger's own existing rules; this just isn't the box that
 * grants that.
 */
async function conversationScopeFilter(user) {
  const conversationIds = await Conversation.find({ members: user.id }).distinct('_id');
  return conversationIds.length ? { conversationId: { $in: conversationIds } } : null;
}

// $text is valid combined with other top-level filter keys (it just can't be nested inside an
// $or/$nor) - so { ...scope, $text: {...} } is a normal, valid Mongo filter as long as `scope`
// itself is a plain object of AND'd conditions, which is exactly what clientScopeFilter/
// projectScopeFilter/conversationScopeFilter each return.
function textSearch(model, scope, query, limit) {
  return model
    .find({ ...scope, $text: { $search: query } }, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit);
}

/**
 * The search itself. Three independent, scoped, ranked lookups, run in parallel and returned
 * grouped by type - never interleaved into one ranked list, since "which kind of thing is this"
 * is exactly what someone scanning results needs to know first (the ask this shipped from named
 * it explicitly: "grouped by type").
 *
 * `limit` is per type, not total - the app bar dropdown omits it (falls back to
 * RESULTS_PER_TYPE); the /search results page passes a larger one explicitly.
 */
async function searchAll(user, rawQuery, rawLimit) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    return { clients: [], projects: [], messages: [], images: [] };
  }
  const limit = clampLimit(rawLimit);

  const [clientScope, projectScope, conversationScope] = await Promise.all([
    clientScopeFilter(user),
    projectScopeFilter(user),
    conversationScopeFilter(user),
  ]);

  const [clients, projects, messages, images] = await Promise.all([
    clientScope ? textSearch(Client, clientScope, query, limit) : [],
    projectScope ? textSearch(Project, projectScope, query, limit) : [],
    conversationScope ? textSearch(Message, conversationScope, query, limit) : [],
    // Same scope Projects use - see this file's own header comment on why that's valid reuse here.
    projectScope ? textSearch(SharedImage, projectScope, query, limit) : [],
  ]);

  return { clients, projects, messages, images };
}

module.exports = { searchAll, conversationScopeFilter, RESULTS_PER_TYPE, MAX_RESULTS_PER_TYPE };
