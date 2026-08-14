const withAuth = require('../../utils/with-auth');
const { searchAll } = require('../../utils/search');

module.exports = {
  Query: {
    search: withAuth(async (_, { query, limit }, context, info, user) =>
      searchAll(user, query, limit),
    ),
  },
};
