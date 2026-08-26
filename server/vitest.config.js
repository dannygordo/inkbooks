const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
	test: {
		// Node environment (not jsdom) - this is a plain Express/GraphQL backend, no DOM anywhere.
		environment: 'node',
		// Global setup/teardown for the in-memory MongoDB instance shared across all test files -
		// starting a fresh mongod per file would be needlessly slow (each one takes a couple
		// seconds to spin up).
		globalSetup: './test/globalSetup.js',
		// Gives every test file access to describe/it/expect without importing them explicitly,
		// matching Jest's familiar default (many devs' muscle memory coming from Jest/CRA).
		globals: true,
		setupFiles: ['./test/setup.js'],
		testTimeout: 15000,
		// All test files share one in-memory mongod instance (see globalSetup.js) and each test
		// clears all collections afterEach (see test/setup.js) - running test files in parallel
		// against that same shared database would let one file's cleanup race another file's
		// still-running assertions. Simpler and safer to run files one at a time; this test suite
		// isn't large enough yet for that to matter for speed.
		fileParallelism: false,
		// Same fix as client/vite.config.js's matching test.diff option - without it, a mismatch
		// against a full Mongoose document (or an array of them) can print a diff hundreds of lines
		// long, and a run with several failures scrolls the earliest ones out of a terminal's buffer
		// before the run even finishes.
		diff: {
			truncateThreshold: 40,
		},
	},
});
