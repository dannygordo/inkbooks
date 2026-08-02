// Runs once for the whole test run (not per file) - starting a real mongod per file would add a
// couple of seconds to every single test file. mongodb-memory-server downloads and runs a real,
// ephemeral MongoDB binary - this is a genuine integration test against real MongoDB query/index
// behavior, not a mock, while never touching the real Atlas cluster this app talks to in
// production. Vitest passes process.env mutations made here down to every test file's process.
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

module.exports = async function setup() {
	mongod = await MongoMemoryServer.create();
	process.env.MONGODB_MEMORY_SERVER_URI = mongod.getUri();
	// Tests never touch real Square, Firebase, or email credentials - these are dummy values just
	// so code paths that read process.env.X don't blow up on undefined. Anything that actually
	// asserts on Square/token-crypto/etc. behavior sets its own real values in that test file.
	process.env.SECRET_KEY = 'test-secret-key-do-not-use-in-production';
	process.env.NODE_ENV = 'DEVELOPMENT';

	return async function teardown() {
		if (mongod) {
			await mongod.stop();
		}
	};
};
