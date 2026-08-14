const Project = require('../../models/Project');
const Client = require('../../models/Client');
const withAuth = require('../../utils/with-auth');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
const {
  assertCanManageArtist,
  canManageArtist,
  projectScopeFilter,
} = require('../../utils/shop-membership');
const { paginate, normalizePage } = require('../../utils/pagination');

function emptyProjectPage(page) {
  const { limit, offset } = normalizePage(page);
  return { items: [], pageInfo: { totalCount: 0, hasMore: false, limit, offset } };
}

const resolvers = {
  Query: {
    // Was withAuth with no restriction at all - any authenticated user, including a Client,
    // could list every project (client name/email, artist, notes, reference images, deposit
    // amount) on the entire platform. SHOP_ADMIN-or-better still sees everyone - see the matching
    // comment in resolvers/shops.js. Artist sees only their own projects (same scope
    // getProjectsByArtist already enforces below). Staff sees projects belonging to their own
    // shop's artists. Client sees only their own projects - note Project.clientId is the Client
    // sub-document's own _id, not the client's User._id (see resolvers/index.js's Project.client
    // resolver), so this looks up the caller's own Client doc first.
    getProjects: withAuth(async (_, { page }, context, info, user) => {
      try {
        // See projectScopeFilter's own comment (utils/shop-membership.js) - the same scoping
        // search's project search reuses, so there is exactly one place that answers "which
        // projects can this person see."
        const filter = await projectScopeFilter(user);
        if (!filter) {
          return emptyProjectPage(page);
        }
        return await paginate(Project, filter, { sort: { createdAt: -1 }, page });
      } catch (err) {
        rethrow(err);
      }
    }),
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // projectId and read that project's full detail (client PII, notes, reference images,
    // deposit amount). Allowed: shop-admin-or-better sharing a shop with the assigned artist, the
    // assigned artist themselves, or the client the project belongs to - same scope as
    // getProjects above, just for a single project instead of a list.
    //
    // THE "isShopStaff" CHECK USED TO IGNORE ROLE ENTIRELY - it asked only "does this caller share
    // a shop with the project's artist", which is true for every artist connected to that shop, not
    // just staff/admins. That let any artist at a shop open any other artist's project - client
    // PII, notes, images and deposit figures included - by clicking their row on a shared
    // appointments list. Replaced with canManageArtist, the same role-aware check
    // getProjectsByArtist below already uses for the list version of this same question - a shop
    // admin sharing the artist's shop still gets in; a fellow artist does not.
    getProject: withAuth(async (_, { projectId }, context, info, user) => {
      try {
        const project = await Project.findById(projectId).sort({ 'notes.createdAt': -1});
        if (!project) {
          throw new UserInputError('Errors', { errors: { projectId: 'Project not found.' } });
        }
        if (String(user.id) !== String(project.artistId)) {
          const myClient = await Client.findOne({ userId: user.id }).select('_id');
          const isOwnClient = myClient && String(myClient.id) === String(project.clientId);
          if (!isOwnClient && !(await canManageArtist(user, project.artistId))) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        return project;
      } catch (err) {
        rethrow(err);
      }
    }),
    // Was withAuth with no ownership check at all - any authenticated user could pass an
    // arbitrary artistId and read that artist's active project list. Same "the artist
    // themselves, or shop-admin-or-better" convention as getAppointmentsByArtist
    // (see resolvers/appointments.js) and getArtistShopConnections/getBookingRequests.
    getProjectsByArtist: withAuth(async (_, { artistId }, context, info, user) => {
      // Was "shop-admin-or-better, or the artist themselves", which let any shop admin list any
      // artist's projects. Now a shop admin has to actually share a shop with them.
      await assertCanManageArtist(user, artistId);
      try {
        const projects = await Project.find({artistId: artistId}).sort({createdAt: -1});
        const results = projects.filter((proj) => {
          return (proj.status !== 'completed' && proj.status !== 'closed');
        });
        return results;
      }catch(err) {
        rethrow(err);
      }
    })
  }
};

module.exports = resolvers;
