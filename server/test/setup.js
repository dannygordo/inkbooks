// Runs before every test file (not once globally - that's globalSetup.js, which only starts the
// shared in-memory mongod). This connects Mongoose to that instance and clears all collections
// between individual tests, so one test's data never leaks into the next.
const mongoose = require('mongoose');

beforeAll(async () => {
	await mongoose.connect(process.env.MONGODB_MEMORY_SERVER_URI);
});

afterEach(async () => {
	const collections = mongoose.connection.collections;
	for (const key of Object.keys(collections)) {
		await collections[key].deleteMany({});
	}
});

afterAll(async () => {
	await mongoose.disconnect();
});
