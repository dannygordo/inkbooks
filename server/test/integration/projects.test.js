// Integration tests for Project mutations - createProject (open to any authenticated user, since
// Constants.ROLES.CLIENT is the least-privileged role and withAuth's minRole check is "at least
// this privileged"), deleteProject (Admin-only), and the ownership-or-SHOP_ADMIN check shared by
// updateProject/updateProjectNotes/updateProjectTags (see mutations/projects.js's own comment on
// why that OR can't be expressed as a single withAuth minRole).
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createUser, createArtistUser, createClientUser, createProject } = require('../helpers/factories');
const { Constants } = require('../../utils/constants');

const CREATE_PROJECT = `
	mutation CreateProject($title: String!, $description: String!, $artistId: ID!, $clientId: ID!, $status: String!) {
		createProject(title: $title, description: $description, artistId: $artistId, clientId: $clientId, status: $status) {
			id
			title
			status
		}
	}
`;

const UPDATE_PROJECT = `
	mutation UpdateProject($project: ProjectInput) {
		updateProject(project: $project) {
			id
			title
		}
	}
`;

const UPDATE_PROJECT_NOTES = `
	mutation UpdateProjectNotes($projectId: ID!, $notes: [IBNoteInput]) {
		updateProjectNotes(projectId: $projectId, notes: $notes) {
			id
		}
	}
`;

const DELETE_PROJECT = `
	mutation DeleteProject($projectId: ID!) {
		deleteProject(projectId: $projectId)
	}
`;

const GET_PROJECTS_BY_ARTIST = `
	query GetProjectsByArtist($artistId: ID!) {
		getProjectsByArtist(artistId: $artistId) { id }
	}
`;

describe('createProject', () => {
	it('rejects an unauthenticated call', async () => {
		const { artist } = await createArtistUser();
		const { client } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_PROJECT,
				variables: {
					title: 'New sleeve',
					description: 'Full sleeve, black and grey',
					artistId: artist.userId.toString(),
					clientId: client.id,
					status: 'open',
				},
			},
			{ contextValue: contextWithToken() },
		);

		// createProject(...): Project! is non-null in the schema, so a thrown resolver error nulls
		// out `data` itself, not just `data.createProject` - see the equivalent note in
		// test/integration/auth.test.js.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Authentication header must be provided/);
	});

	it('allows any authenticated user to create a project (CLIENT is the loosest gate)', async () => {
		const { user: clientUser, client } = await createClientUser();
		const { artist } = await createArtistUser();
		const token = signTestToken(clientUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_PROJECT,
				variables: {
					title: 'New sleeve',
					description: 'Full sleeve, black and grey',
					artistId: artist.userId.toString(),
					clientId: client.id,
					status: 'open',
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createProject.title).toBe('New sleeve');
	});

	it('rejects a status value outside the real enum', async () => {
		const { user: clientUser, client } = await createClientUser();
		const { artist } = await createArtistUser();
		const token = signTestToken(clientUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_PROJECT,
				variables: {
					title: 'New sleeve',
					description: 'Full sleeve, black and grey',
					artistId: artist.userId.toString(),
					clientId: client.id,
					status: 'not-a-real-status',
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors).toBeDefined();
	});
});

describe('updateProject / updateProjectNotes ownership', () => {
	it('allows the assigned artist to update their own project', async () => {
		const { user: artistUser, artist } = await createArtistUser();
		const { client } = await createClientUser();
		// artistId on Project stores the artist's own User._id - see resolvers/index.js's Project
		// resolver and factories.js's own comment on this.
		const project = await createProject(artistUser.id, client.id);
		const token = signTestToken(artistUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_PROJECT,
				variables: {
					project: {
						id: project.id,
						title: 'Updated title',
						description: project.description,
						artistId: artistUser.id,
						clientId: client.id,
						status: 'in_progress',
					},
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateProject.title).toBe('Updated title');
	});

	it('rejects an unrelated artist updating someone else\'s project', async () => {
		const { user: ownerArtist } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(ownerArtist.id, client.id);
		const token = signTestToken(otherArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_PROJECT,
				variables: {
					project: {
						id: project.id,
						title: 'Hijacked title',
						description: project.description,
						artistId: ownerArtist.id,
						clientId: client.id,
						status: 'in_progress',
					},
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.updateProject).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('allows a SHOP_ADMIN-or-better user to update any project regardless of assigned artist', async () => {
		const { user: ownerArtist } = await createArtistUser();
		const { client } = await createClientUser();
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const project = await createProject(ownerArtist.id, client.id);
		const token = signTestToken(admin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_PROJECT_NOTES,
				variables: { projectId: project.id, notes: [{ id: '000000000000000000000000', author: 'Admin', note: 'Reviewed' }] },
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateProjectNotes.id).toBe(project.id);
	});

	// Regression test for a real bug found via manual testing (see PRODUCTION_ROADMAP.md): the seed
	// script originally set Project.palette to a display label ('Black and grey', 'Full color',
	// 'Black') rather than updateProjectInputSchema's real enum values ('black'/'color' - the same
	// values client/src/constants/app.js's PROJECT_PALETTE_OPTIONS dropdown actually sends). That
	// meant every seeded project failed updateProject validation - with the generic
	// UserInputError('Errors', {...}) message - the instant anything touched it (e.g. saving an
	// uploaded image, which round-trips the whole project through updateProject). Fixed in
	// seed.js; this test guards against the enum itself ever drifting from the dropdown again.
	it('rejects a palette value that is a display label instead of the real enum value', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const token = signTestToken(artistUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_PROJECT,
				variables: {
					project: {
						id: project.id,
						title: project.title,
						description: project.description,
						artistId: artistUser.id,
						clientId: client.id,
						status: 'in_progress',
						palette: 'Black and grey',
					},
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.updateProject).toBeNull();
		expect(errors[0].message).toBe('Errors');
	});

	it('accepts the real dropdown enum value for palette', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const token = signTestToken(artistUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: UPDATE_PROJECT,
				variables: {
					project: {
						id: project.id,
						title: project.title,
						description: project.description,
						artistId: artistUser.id,
						clientId: client.id,
						status: 'in_progress',
						palette: 'black',
					},
				},
			},
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateProject.id).toBe(project.id);
	});
});

describe('deleteProject: Admin-only', () => {
	it('rejects a non-Admin caller, even the assigned artist', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const token = signTestToken(artistUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_PROJECT, variables: { projectId: project.id } },
			{ contextValue: contextWithToken(token) },
		);

		// deleteProject(...): String! is non-null in the schema, so a thrown resolver error nulls
		// out `data` itself, not just `data.deleteProject`.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('allows an Admin to delete a project', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const project = await createProject(artistUser.id, client.id);
		const token = signTestToken(admin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_PROJECT, variables: { projectId: project.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.deleteProject).toMatch(/deleted successfully/);
	});
});

describe('getProjectsByArtist: ownership', () => {
	it('allows an artist to read their own project list', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(artistUser.id, client.id);
		const token = signTestToken(artistUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECTS_BY_ARTIST, variables: { artistId: artistUser.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getProjectsByArtist).toHaveLength(1);
	});

	it('rejects a different artist reading someone else\'s project list', async () => {
		const { user: ownerArtist } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(ownerArtist.id, client.id);
		const token = signTestToken(otherArtist);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECTS_BY_ARTIST, variables: { artistId: ownerArtist.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getProjectsByArtist).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('rejects a Client guessing an artist id to read their financials/project list', async () => {
		const { user: ownerArtist } = await createArtistUser();
		const { user: clientUser, client } = await createClientUser();
		await createProject(ownerArtist.id, client.id);
		const token = signTestToken(clientUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECTS_BY_ARTIST, variables: { artistId: ownerArtist.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getProjectsByArtist).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('allows a SHOP_ADMIN-or-better user to read any artist\'s project list', async () => {
		const { user: ownerArtist } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(ownerArtist.id, client.id);
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const token = signTestToken(admin);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECTS_BY_ARTIST, variables: { artistId: ownerArtist.id } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getProjectsByArtist).toHaveLength(1);
	});
});

// Regression test for a real bug found via manual testing against seeded local data: clicking
// Projects crashed client-side with "Cannot read properties of null (reading 'avatar')" in
// IBCardProjectDetails.jsx, which reads `project.client.avatar` unconditionally. Root cause:
// resolvers/index.js's Project.client resolver did `Client.findOne({id: project.clientId})` -
// `id` is a Mongoose *virtual* getter, never a real stored field, so that filter matched nothing,
// ever, for any project. Fixed to `Client.findById(project.clientId)`. This test selects `client`
// on a real getProjects response and confirms it actually resolves to the real Client document,
// not null - the exact shape that would have caught this originally (ProjectService.js's real
// FETCH_PROJECTS_QUERY does select `client { ... }` the same way).
describe('Project.client field resolver', () => {
	const GET_PROJECTS = `{ getProjects { id client { id firstName lastName } } }`;

	it('resolves the actual Client sub-document, not null', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECTS },
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		const found = data.getProjects.find((p) => p.id === project.id);
		expect(found).toBeDefined();
		expect(found.client).not.toBeNull();
		expect(found.client.id).toBe(client.id);
	});
});
