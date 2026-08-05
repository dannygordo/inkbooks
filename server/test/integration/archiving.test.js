// Archiving - what "remove this person" means now that the delete mutations are gone.
//
// deleteArtist/deleteStaff/deleteClient removed a row and left everything that pointed at it:
// Project.client is nullable, so a deleted client left projects silently referencing nothing; the
// User row outlived its profile, producing a login with a role and no profile; and appointments
// kept their totals, shop cuts and Square invoice ids with nobody attached. Archiving is the
// honest version of the same action.
//
// The invariant this file exists to protect is the second describe block, not the first. Hiding an
// archived person from a list is the easy half and would be obvious if it broke. The half that
// would NOT be obvious - that would look like a small, plausible number rather than an error - is
// revenue moving because somebody left. A shop's Q3 total must be the same on the day an artist is
// archived as it was the day before. If it isn't, last quarter quietly stops matching what the
// shop actually took, and nothing anywhere says so.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	createClientUser,
	connectArtistToShop,
	createProject,
	createAppointment,
} = require('../helpers/factories');
const Artist = require('../../models/Artist');
const Staff = require('../../models/Staff');
const Client = require('../../models/Client');
const Project = require('../../models/Project');
const Appointment = require('../../models/Appointment');
const { Constants } = require('../../utils/constants');

const ARCHIVE_ARTIST = `mutation A($artistId: ID!) { archiveArtist(artistId: $artistId) { id status } }`;
const UNARCHIVE_ARTIST = `mutation A($artistId: ID!) { unarchiveArtist(artistId: $artistId) { id status } }`;
const ARCHIVE_STAFF = `mutation A($staffId: ID!) { archiveStaff(staffId: $staffId) { id status } }`;
const ARCHIVE_CLIENT = `mutation A($clientId: ID!) { archiveClient(clientId: $clientId) { id status } }`;
const UNARCHIVE_CLIENT = `mutation A($clientId: ID!) { unarchiveClient(clientId: $clientId) { id status } }`;

const GET_ARTISTS = `{ getArtists { id } }`;
const GET_STAFF = `{ getStaff { id } }`;
const GET_CLIENTS = `{ getClients { id } }`;
const GET_ARTISTS_INCLUDING_ARCHIVED = `
	query A($includeArchived: Boolean) { getArtists(includeArchived: $includeArchived) { id } }
`;
const GET_STAFF_INCLUDING_ARCHIVED = `
	query A($includeArchived: Boolean) { getStaff(includeArchived: $includeArchived) { id } }
`;
const GET_CLIENTS_INCLUDING_ARCHIVED = `
	query A($includeArchived: Boolean) { getClients(includeArchived: $includeArchived) { id } }
`;
const GET_ARTISTS_BY_SHOP = `
	query A($shopId: ID!) { getArtistsByShop(shopId: $shopId) { id } }
`;
const SHOP_ANALYTICS = `
	query A($shopId: ID!, $start: DateTime!, $end: DateTime!) {
		getShopAnalytics(shopId: $shopId, start: $start, end: $end) { revenueCents tipsCents }
	}
`;
const ARTIST_ANALYTICS = `
	query A($userId: ID!, $start: DateTime!, $end: DateTime!) {
		getArtistAnalytics(userId: $userId, start: $start, end: $end) { revenueCents }
	}
`;
const APPOINTMENTS_BY_SHOP = `
	query A($shopId: ID!) { getAppointmentsByShop(shopId: $shopId) { id totalCents } }
`;

// Widest range assertValidRange allows (ten years, see resolvers/analytics.js) that still contains
// the fixtures, whose appointmentDate is `new Date()`.
const RANGE = {
	start: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
	end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

/**
 * A shop with one artist who has actually earned money there - a completed $400 session with a $50
 * tip and a $70 shop cut. The money is the point: an archive test against an artist with no
 * history would pass no matter how the analytics were written.
 */
async function shopWithEarningArtist() {
	const { user: shopAdmin, shop } = await createShopAdminUser();
	const { user: artistUser, artist } = await createArtistUser({ artist: { shopId: shop._id } });
	await connectArtistToShop(artistUser.id, shop.id);
	const { client } = await createClientUser({ client: { shopIds: [shop._id] } });
	const project = await createProject(artistUser.id, client.id);
	const appointment = await createAppointment(artistUser.id, {
		shopId: shop._id,
		projectId: project._id,
		appointmentStatus: 'completed',
		totalCents: 40000,
		subtotalCents: 35000,
		tipCents: 5000,
		shopCutCents: 7000,
	});
	return { shopAdmin, shop, artistUser, artist, client, project, appointment };
}

describe('archiving removes someone from the directories', () => {
	it('drops an archived artist from getArtists but keeps the row', async () => {
		const { shopAdmin, artist } = await shopWithEarningArtist();
		const server = createTestServer();

		const before = await server.executeOperation({ query: GET_ARTISTS }, asUser(shopAdmin));
		expect(before.body.singleResult.data.getArtists.map((a) => a.id)).toContain(artist.id);

		const archived = await server.executeOperation(
			{ query: ARCHIVE_ARTIST, variables: { artistId: artist.id } },
			asUser(shopAdmin),
		);
		expect(archived.body.singleResult.errors).toBeUndefined();
		expect(archived.body.singleResult.data.archiveArtist.status).toBe(
			Constants.ARTIST_STATUS.ARCHIVED,
		);

		const after = await server.executeOperation({ query: GET_ARTISTS }, asUser(shopAdmin));
		expect(after.body.singleResult.data.getArtists.map((a) => a.id)).not.toContain(artist.id);

		// Flagged, not removed - the distinction the whole change is about.
		expect(await Artist.findById(artist.id)).not.toBeNull();
	});

	it('drops an archived staff member from getStaff', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { staff } = await createStaffUser(shop.id);
		const server = createTestServer();

		await server.executeOperation(
			{ query: ARCHIVE_STAFF, variables: { staffId: staff.id } },
			asUser(shopAdmin),
		);

		const after = await server.executeOperation({ query: GET_STAFF }, asUser(shopAdmin));
		expect(after.body.singleResult.data.getStaff.map((s) => s.id)).not.toContain(staff.id);
		expect(await Staff.findById(staff.id)).not.toBeNull();
	});

	it('drops an archived client from getClients', async () => {
		const { shopAdmin, client } = await shopWithEarningArtist();
		const server = createTestServer();

		await server.executeOperation(
			{ query: ARCHIVE_CLIENT, variables: { clientId: client.id } },
			asUser(shopAdmin),
		);

		const after = await server.executeOperation({ query: GET_CLIENTS }, asUser(shopAdmin));
		expect(after.body.singleResult.data.getClients.map((c) => c.id)).not.toContain(client.id);
		expect(await Client.findById(client.id)).not.toBeNull();
	});

	it('shows archived people when asked, which is the only way to restore one', async () => {
		// Without this the archive is a one-way door: unarchiveArtist exists, but nothing would be
		// able to find the artist to call it on. The default stays "hidden" - see
		// utils/archiving.js's archiveFilter.
		const { shopAdmin, artist } = await shopWithEarningArtist();
		const server = createTestServer();

		await server.executeOperation(
			{ query: ARCHIVE_ARTIST, variables: { artistId: artist.id } },
			asUser(shopAdmin),
		);

		const hidden = await server.executeOperation({ query: GET_ARTISTS }, asUser(shopAdmin));
		expect(hidden.body.singleResult.data.getArtists.map((a) => a.id)).not.toContain(artist.id);

		const shown = await server.executeOperation(
			{ query: GET_ARTISTS_INCLUDING_ARCHIVED, variables: { includeArchived: true } },
			asUser(shopAdmin),
		);
		expect(shown.body.singleResult.data.getArtists.map((a) => a.id)).toContain(artist.id);
	});

	it('shows archived staff and clients when asked', async () => {
		const { shopAdmin, shop, client } = await shopWithEarningArtist();
		const { staff } = await createStaffUser(shop.id);
		const server = createTestServer();

		await server.executeOperation(
			{ query: ARCHIVE_STAFF, variables: { staffId: staff.id } },
			asUser(shopAdmin),
		);
		await server.executeOperation(
			{ query: ARCHIVE_CLIENT, variables: { clientId: client.id } },
			asUser(shopAdmin),
		);

		const staffShown = await server.executeOperation(
			{ query: GET_STAFF_INCLUDING_ARCHIVED, variables: { includeArchived: true } },
			asUser(shopAdmin),
		);
		expect(staffShown.body.singleResult.data.getStaff.map((s) => s.id)).toContain(staff.id);

		const clientsShown = await server.executeOperation(
			{ query: GET_CLIENTS_INCLUDING_ARCHIVED, variables: { includeArchived: true } },
			asUser(shopAdmin),
		);
		expect(clientsShown.body.singleResult.data.getClients.map((c) => c.id)).toContain(client.id);
	});

	it('keeps an archived artist out of the booking picker even so', async () => {
		// getArtistsByShop feeds "who can this be booked with", and deliberately takes no
		// includeArchived - you should never be able to book new work with someone who's been
		// taken off the roster, whatever a list elsewhere is showing.
		const { shopAdmin, shop, artist } = await shopWithEarningArtist();
		const server = createTestServer();

		await server.executeOperation(
			{ query: ARCHIVE_ARTIST, variables: { artistId: artist.id } },
			asUser(shopAdmin),
		);

		const res = await server.executeOperation(
			{ query: GET_ARTISTS_BY_SHOP, variables: { shopId: shop.id } },
			asUser(shopAdmin),
		);
		expect(res.body.singleResult.data.getArtistsByShop.map((a) => a.id)).not.toContain(artist.id);
	});

	it('brings someone back', async () => {
		const { shopAdmin, artist } = await shopWithEarningArtist();
		const server = createTestServer();

		await server.executeOperation(
			{ query: ARCHIVE_ARTIST, variables: { artistId: artist.id } },
			asUser(shopAdmin),
		);
		const restored = await server.executeOperation(
			{ query: UNARCHIVE_ARTIST, variables: { artistId: artist.id } },
			asUser(shopAdmin),
		);

		expect(restored.body.singleResult.data.unarchiveArtist.status).toBe(
			Constants.ARTIST_STATUS.ACTIVE,
		);
		const after = await server.executeOperation({ query: GET_ARTISTS }, asUser(shopAdmin));
		expect(after.body.singleResult.data.getArtists.map((a) => a.id)).toContain(artist.id);
	});

	it('shows someone with no status set at all, rather than hiding them', async () => {
		// Every row that predates this field is unset. Reading "unset" as anything but active
		// would empty the directories of a live shop the moment this shipped - the failure mode
		// worth a test of its own because it wouldn't look like a bug in archiving, it would look
		// like the app losing its data.
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { artist } = await createArtistUser({ artist: { shopId: shop._id, status: undefined } });
		await Artist.updateOne({ _id: artist._id }, { $unset: { status: 1 } });
		const server = createTestServer();

		const res = await server.executeOperation({ query: GET_ARTISTS }, asUser(shopAdmin));
		expect(res.body.singleResult.data.getArtists.map((a) => a.id)).toContain(artist.id);
	});
});

describe('archiving never touches the money', () => {
	// The invariant. If any of these fail, someone has added a status filter to
	// utils/analytics.js and a shop's historical revenue now changes when staff turn over.
	it("leaves shop revenue identical after archiving the artist who earned it", async () => {
		const { shopAdmin, shop, artist } = await shopWithEarningArtist();
		const server = createTestServer();

		const before = await server.executeOperation(
			{ query: SHOP_ANALYTICS, variables: { shopId: shop.id, ...RANGE } },
			asUser(shopAdmin),
		);
		const beforeFigures = before.body.singleResult.data.getShopAnalytics;
		expect(beforeFigures.revenueCents).toBe(40000);
		expect(beforeFigures.tipsCents).toBe(5000);

		await server.executeOperation(
			{ query: ARCHIVE_ARTIST, variables: { artistId: artist.id } },
			asUser(shopAdmin),
		);

		const after = await server.executeOperation(
			{ query: SHOP_ANALYTICS, variables: { shopId: shop.id, ...RANGE } },
			asUser(shopAdmin),
		);
		expect(after.body.singleResult.data.getShopAnalytics).toEqual(beforeFigures);
	});

	it("leaves shop revenue identical after archiving the client who paid it", async () => {
		const { shopAdmin, shop, client } = await shopWithEarningArtist();
		const server = createTestServer();

		const before = await server.executeOperation(
			{ query: SHOP_ANALYTICS, variables: { shopId: shop.id, ...RANGE } },
			asUser(shopAdmin),
		);
		const beforeFigures = before.body.singleResult.data.getShopAnalytics;

		await server.executeOperation(
			{ query: ARCHIVE_CLIENT, variables: { clientId: client.id } },
			asUser(shopAdmin),
		);

		const after = await server.executeOperation(
			{ query: SHOP_ANALYTICS, variables: { shopId: shop.id, ...RANGE } },
			asUser(shopAdmin),
		);
		expect(after.body.singleResult.data.getShopAnalytics).toEqual(beforeFigures);
		expect(beforeFigures.revenueCents).toBe(40000);
	});

	it("still reports an archived artist's own earnings", async () => {
		// Their dashboard figure has to keep working too - an artist who left is still owed an
		// accurate record of what they made, and the shop still needs it to settle up.
		const { shopAdmin, artistUser, artist } = await shopWithEarningArtist();
		const server = createTestServer();

		await server.executeOperation(
			{ query: ARCHIVE_ARTIST, variables: { artistId: artist.id } },
			asUser(shopAdmin),
		);

		const res = await server.executeOperation(
			{ query: ARTIST_ANALYTICS, variables: { userId: artistUser.id, ...RANGE } },
			asUser(shopAdmin),
		);
		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.getArtistAnalytics.revenueCents).toBe(40000);
	});

	it("keeps an archived artist's appointments on the shop calendar", async () => {
		// The calendar has no artist filter any more (see client Sidebar.jsx), so nothing is
		// hiding these - but that's a client-side fact, and this is the server-side half of it.
		const { shopAdmin, shop, artist, appointment } = await shopWithEarningArtist();
		const server = createTestServer();

		await server.executeOperation(
			{ query: ARCHIVE_ARTIST, variables: { artistId: artist.id } },
			asUser(shopAdmin),
		);

		const res = await server.executeOperation(
			{ query: APPOINTMENTS_BY_SHOP, variables: { shopId: shop.id } },
			asUser(shopAdmin),
		);
		expect(res.body.singleResult.data.getAppointmentsByShop.map((a) => a.id)).toContain(
			appointment.id,
		);
	});

	it("leaves an archived client's projects and appointments intact", async () => {
		const { shopAdmin, client, project, appointment } = await shopWithEarningArtist();
		const server = createTestServer();

		await server.executeOperation(
			{ query: ARCHIVE_CLIENT, variables: { clientId: client.id } },
			asUser(shopAdmin),
		);

		// The specific corruption deleteClient used to cause: Project.client is nullable, so a
		// removed client left this pointing at nothing without any error.
		const storedProject = await Project.findById(project.id);
		expect(String(storedProject.clientId)).toBe(String(client.id));
		expect(await Client.findById(storedProject.clientId)).not.toBeNull();

		const storedAppointment = await Appointment.findById(appointment.id);
		expect(storedAppointment.totalCents).toBe(40000);
		expect(storedAppointment.shopCutCents).toBe(7000);
	});

	it('lets an unarchived client be found again', async () => {
		const { shopAdmin, client } = await shopWithEarningArtist();
		const server = createTestServer();

		await server.executeOperation(
			{ query: ARCHIVE_CLIENT, variables: { clientId: client.id } },
			asUser(shopAdmin),
		);
		await server.executeOperation(
			{ query: UNARCHIVE_CLIENT, variables: { clientId: client.id } },
			asUser(shopAdmin),
		);

		const after = await server.executeOperation({ query: GET_CLIENTS }, asUser(shopAdmin));
		expect(after.body.singleResult.data.getClients.map((c) => c.id)).toContain(client.id);
	});
});

describe('archiving respects the shop boundary', () => {
	it("refuses a shop admin archiving another shop's artist", async () => {
		const { artist } = await shopWithEarningArtist();
		const { user: outsideAdmin } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: ARCHIVE_ARTIST, variables: { artistId: artist.id } },
			asUser(outsideAdmin),
		);

		expect(res.body.singleResult.data.archiveArtist).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
		const stored = await Artist.findById(artist.id);
		expect(stored.status).not.toBe(Constants.ARTIST_STATUS.ARCHIVED);
	});

	it("refuses a shop admin archiving another shop's client", async () => {
		const { client } = await shopWithEarningArtist();
		const { user: outsideAdmin } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: ARCHIVE_CLIENT, variables: { clientId: client.id } },
			asUser(outsideAdmin),
		);

		expect(res.body.singleResult.data.archiveClient).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});

	it('refuses a caller below shop admin', async () => {
		const { shop, artist } = await shopWithEarningArtist();
		const { user: staff } = await createStaffUser(shop.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: ARCHIVE_ARTIST, variables: { artistId: artist.id } },
			asUser(staff),
		);

		expect(res.body.singleResult.data.archiveArtist).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});
});
