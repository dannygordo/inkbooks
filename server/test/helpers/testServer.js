// Builds a fresh ApolloServer instance wired to the app's real typeDefs/resolvers, matching
// index.js's construction exactly - no separate "test schema," so a passing test actually
// reflects the real server. Each test file gets its own instance via createTestServer() rather
// than a shared module-level singleton, so tests can't accidentally leak Apollo-level state
// (e.g. plugin state) across files.
const { ApolloServer } = require('@apollo/server');
const { DateTypeDefs } = require('graphql-scalars');
const ibTypeDefs = require('../../graphql/typeDefs');
const resolvers = require('../../graphql/resolvers');
const { createLoaders } = require('../../utils/loaders');

function createTestServer() {
	return new ApolloServer({
		typeDefs: [ibTypeDefs, DateTypeDefs],
		resolvers,
	});
}

// Builds the exact context shape utils/check-auth.js expects (context.req.headers.authorization)
// - see index.js's `context: async ({ req }) => ({ req })`. Pass a token from
// test/helpers/auth.js's signTestToken(), or omit for an unauthenticated request.
function contextWithToken(token) {
	return {
		req: {
			headers: token ? { authorization: `Bearer ${token}` } : {},
		},
		// Matching index.js: fresh per operation. Field resolvers that batch through a loader fall
		// back to a direct query when it's absent (see resolvers/index.js), so a context built
		// without this still works - but then the tests wouldn't be exercising the path the real
		// server takes, which is the whole reason this helper mirrors index.js in the first place.
		loaders: createLoaders(),
	};
}

module.exports = { createTestServer, contextWithToken };
