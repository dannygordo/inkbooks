// Integration tests for the client dashboard's data (Client.projects/appointments field
// resolvers) and for updateClientNotes' authorization.
//
// The rule most worth locking down here is the notes one, because it's a rule about people
// rather than about code shape: a client must not be able to edit notes written about them. The
// value of a note like "cancels a lot" or "needed a break every 20 minutes" comes entirely from
// being a candid internal record - if the subject can rewrite it, artists stop writing honest
// ones, and the feature quietly becomes worthless. getClient deliberately DOES let a client read
// their own row, so "can read their record" and "can edit these notes" have to come apart, and a
// test is the only thing that keeps them apart.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createClientUser,
	createShopAdminUser,
	connectArtistToShop,
	createProject,
	createAppointment,
} = require('../helpers/factories');
const Client = require('../../models/Client');

const GET_CLIENT_DASHBOARD = `
	query GetClientDashboard($clientId: ID!) {
		getClient(clientId: $clientId) {
			id
			projects { id title }
			appointments { id totalCents tipCents appointmentStatus }
			notes { id note author }
		}
	}
`;

const UPDATE_CLIENT_NOTES = `
	mutation UpdateClientNotes($notes: [IBNoteInput], $clientId: ID!) {
		updateClientNotes(notes: $notes, clientId: $clientId) {
			id
			notes { id note author }
		}
	}
`;

function noteInput(overrides = {}) {
	const now = new Date().toISOString();
	return {
		id: '1',
		author: 'Test Artist',
		note: 'Sat well, no breaks needed.',
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

describe('Client.projects / Client.appointments', () => {
	it("returns the client's projects and the appointments booked under them", async () => {
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artist.id, client.id, { title: 'Koi half sleeve' });
		await createAppointment(artist.id, {
			projectId: project.id,
			appointmentStatus: 'completed',
			subtotalCents: 30000,
			tipCents: 6000,
			totalCents: 36000,
		});

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: GET_CLIENT_DASHBOARD, variables: { clientId: client.id } },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getClient.projects).toHaveLength(1);
		expect(data.getClient.projects[0].title).toBe('Koi half sleeve');
		expect(data.getClient.appointments).toHaveLength(1);
		expect(data.getClient.appointments[0].totalCents).toBe(36000);
		expect(data.getClient.appointments[0].tipCents).toBe(6000);
	});

	it("does not leak another client's projects", async () => {
		// Regression guard on the specific trap called out in the resolver: Project.clientId is
		// the Client sub-document's own _id, not the client's User._id. Filtering on the wrong one
		// wouldn't throw - it would silently return the wrong set, or nothing at all.
		const { user: artist } = await createArtistUser();
		const { client: clientA } = await createClientUser();
		const { client: clientB } = await createClientUser();
		await createProject(artist.id, clientA.id, { title: 'A only' });
		await createProject(artist.id, clientB.id, { title: 'B only' });

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: GET_CLIENT_DASHBOARD, variables: { clientId: clientA.id } },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const titles = res.body.singleResult.data.getClient.projects.map((p) => p.title);
		expect(titles).toEqual(['A only']);
	});
});

describe('updateClientNotes', () => {
	it('lets an artist who shares a project with the client add a note', async () => {
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(artist.id, client.id);

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: UPDATE_CLIENT_NOTES, variables: { clientId: client.id, notes: [noteInput()] } },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateClientNotes.notes).toHaveLength(1);
		expect(data.updateClientNotes.notes[0].note).toBe('Sat well, no breaks needed.');
	});

	it('refuses a client editing notes written about them', async () => {
		// The rule this whole test file exists for. Note that getClient DOES let this same user
		// read their own record - the two permissions are deliberately not the same.
		const { user: artist } = await createArtistUser();
		const { user: clientUser, client } = await createClientUser();
		await createProject(artist.id, client.id);
		await Client.findByIdAndUpdate(client.id, { notes: [noteInput({ note: 'Cancels a lot.' })] });

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: UPDATE_CLIENT_NOTES,
				variables: { clientId: client.id, notes: [noteInput({ note: 'Actually great!' })] },
			},
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		const { errors, data } = res.body.singleResult;
		expect(data.updateClientNotes).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);

		const stored = await Client.findById(client.id);
		expect(stored.notes[0].note).toBe('Cancels a lot.');
	});

	it('refuses an artist with no shared project with this client', async () => {
		const { user: unrelatedArtist } = await createArtistUser();
		const { client } = await createClientUser();

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: UPDATE_CLIENT_NOTES, variables: { clientId: client.id, notes: [noteInput()] } },
			{ contextValue: contextWithToken(signTestToken(unrelatedArtist)) },
		);

		const { errors, data } = res.body.singleResult;
		expect(data.updateClientNotes).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	// This asserted "regardless of shared projects" until the global-admin role was removed. A
	// shop admin has no platform-wide reach any more: a Client carries no shopId, so the only
	// thing that makes them this shop's client is a Project with one of its artists.
	it('allows a shop admin whose own shop has a project with this client', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const { client } = await createClientUser();
		await createProject(artistUser.id, client.id);

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: UPDATE_CLIENT_NOTES, variables: { clientId: client.id, notes: [noteInput()] } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.updateClientNotes.notes).toHaveLength(1);
	});

	it('refuses a shop admin with no project connecting their shop to this client', async () => {
		const { user: shopAdmin } = await createShopAdminUser();
		const { client } = await createClientUser();

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: UPDATE_CLIENT_NOTES, variables: { clientId: client.id, notes: [noteInput()] } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors, data } = res.body.singleResult;
		expect(data.updateClientNotes).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});
