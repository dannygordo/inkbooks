// Populates a local development database with a realistic set of data: a shop, a shop admin,
// staff, artists (shop-affiliated and independent), clients, projects, appointments across the
// full shop-cut lifecycle, and conversations/messages. Every seeded user gets a real bcrypt hash
// for the same known password (see DEV_PASSWORD below) so you can log into the actual UI, not
// just query the database directly.
//
// This is strictly local-dev tooling. It connects to whatever MONGODB points at (see
// .env.development - should be mongodb://localhost:27017/inkbooks-dev, never the production
// Atlas cluster) and, by default, WIPES every collection it touches before reseeding, so re-running
// this script always gives you a clean, known state. There is no environment guard beyond that -
// don't point .env.development at a shared/production URI and run this.
//
// Usage (from server/):
//   npm run seed

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env.development') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Shop = require('../models/Shop');
const Staff = require('../models/Staff');
const Artist = require('../models/Artist');
const Client = require('../models/Client');
const ArtistShopConnection = require('../models/ArtistShopConnection');
const Project = require('../models/Project');
const Appointment = require('../models/Appointment');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { Constants } = require('../utils/constants');

// Every seeded account uses this same password - it's local dev data, not real credentials.
const DEV_PASSWORD = 'devpass123';

const mongoUri = (process.env.MONGODB || '').replace(/,\s*$/, '');
if (!mongoUri) {
  throw new Error('MONGODB environment variable is not set - check server/.env.development.');
}
// Cheap guard against accidentally wiping something that isn't the local dev database - this
// script is destructive by design (see header comment), so refuse to run against anything that
// doesn't look like a local Mongo instance.
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(mongoUri)) {
  throw new Error(
    `Refusing to run: MONGODB (${mongoUri.replace(/\/\/.*@/, '//***@')}) doesn't look like a ` +
      'local database. This script wipes every collection it touches - only run it against ' +
      'mongodb://localhost:27017/... .'
  );
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function findOrCreateConversation(memberIds) {
  const sortedIds = Array.from(new Set(memberIds.map(String))).sort();
  let conversation = await Conversation.findOne({
    members: { $all: sortedIds, $size: sortedIds.length },
  });
  if (!conversation) {
    const now = new Date();
    conversation = await new Conversation({ members: sortedIds, createdAt: now, updatedAt: now }).save();
  }
  return conversation;
}

async function seed() {
  console.log(`Connecting to ${mongoUri} ...`);
  await mongoose.connect(mongoUri);

  console.log('Wiping existing collections ...');
  await Promise.all([
    User.deleteMany({}),
    Shop.deleteMany({}),
    Staff.deleteMany({}),
    Artist.deleteMany({}),
    Client.deleteMany({}),
    ArtistShopConnection.deleteMany({}),
    Project.deleteMany({}),
    Appointment.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
  ]);

  const hashedPassword = await bcrypt.hash(DEV_PASSWORD, 12);

  // --- Shop ---------------------------------------------------------------
  const shop = await new Shop({
    name: 'Copper Wolf Tattoo Co.',
    email: 'shop@copperwolf.dev',
    phone: '555-010-0100',
    address: '123 Ink Street',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
    instagram: '@copperwolftattoo',
    website: 'https://copperwolf.dev',
    shopMinimum: 80,
    hourlyRate: 150,
    billingType: 'percentage',
    status: 1,
  }).save();

  // --- Platform Admin (User only - no Staff/Shop tie, matches the convention already used in
  // test/integration/users.test.js: Constants.ROLES.ADMIN is a distinct, more-privileged role from
  // SHOP_ADMIN, with no client-side UI of its own today (no ROLES.ADMIN references anywhere in
  // client/src) - it exists purely as the backend's top role for things like getUsers. Seeded
  // anyway so every real role in the system has a real login, not just the ones with dedicated
  // pages. ---
  await new User({
    username: 'platformadmin',
    email: 'platformadmin@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.ADMIN,
    userType: Constants.USER_TYPE.STAFF,
    firstName: 'Alex',
    lastName: 'Admin',
    hasSetPassword: true,
  }).save();

  // --- Shop Admin (User + Staff) -------------------------------------------
  const shopAdminUser = await new User({
    username: 'shopadmin',
    email: 'shopadmin@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.SHOP_ADMIN,
    userType: Constants.USER_TYPE.STAFF,
    firstName: 'Dana',
    lastName: 'Wolfe',
    hasSetPassword: true,
  }).save();
  await new Staff({
    firstName: 'Dana',
    lastName: 'Wolfe',
    email: shopAdminUser.email,
    phone: '555-010-0101',
    userId: shopAdminUser._id,
    shopId: shop._id,
    status: 1,
    title: 'Owner',
  }).save();

  // --- Shop Staff (front desk) ----------------------------------------------
  const staffUser = await new User({
    username: 'frontdesk',
    email: 'frontdesk@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.SHOP_STAFF,
    userType: Constants.USER_TYPE.STAFF,
    firstName: 'Sam',
    lastName: 'Rivera',
    hasSetPassword: true,
  }).save();
  await new Staff({
    firstName: 'Sam',
    lastName: 'Rivera',
    email: staffUser.email,
    phone: '555-010-0102',
    userId: staffUser._id,
    shopId: shop._id,
    status: 1,
    title: 'Front Desk',
  }).save();

  // --- Artists (shop-affiliated) --------------------------------------------
  const artist1User = await new User({
    username: 'artist.maya',
    email: 'maya@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.ARTIST,
    userType: Constants.USER_TYPE.ARTIST,
    firstName: 'Maya',
    lastName: 'Chen',
    hasSetPassword: true,
  }).save();
  await new Artist({
    firstName: 'Maya',
    lastName: 'Chen',
    email: artist1User.email,
    phone: '555-010-0103',
    userId: artist1User._id,
    shopId: shop._id,
    title: 'Fine Line / Botanical',
    hourlyRate: 175,
    status: Constants.ARTIST_STATUS.ACTIVE,
    startDate: daysAgo(400),
  }).save();
  await new ArtistShopConnection({ artistId: artist1User._id, shopId: shop._id, status: 'active' }).save();

  const artist2User = await new User({
    username: 'artist.jonas',
    email: 'jonas@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.ARTIST,
    userType: Constants.USER_TYPE.ARTIST,
    firstName: 'Jonas',
    lastName: 'Petrov',
    hasSetPassword: true,
  }).save();
  await new Artist({
    firstName: 'Jonas',
    lastName: 'Petrov',
    email: artist2User.email,
    phone: '555-010-0104',
    userId: artist2User._id,
    shopId: shop._id,
    title: 'Traditional / Blackwork',
    hourlyRate: 160,
    status: Constants.ARTIST_STATUS.ACTIVE,
    startDate: daysAgo(200),
  }).save();
  await new ArtistShopConnection({ artistId: artist2User._id, shopId: shop._id, status: 'active' }).save();

  // --- Independent artist (no shop) - exercises the artist-centric tenancy path ---
  const independentArtistUser = await new User({
    username: 'artist.indie',
    email: 'indie@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.ARTIST,
    userType: Constants.USER_TYPE.ARTIST,
    firstName: 'Robin',
    lastName: 'Ashby',
    hasSetPassword: true,
  }).save();
  await new Artist({
    firstName: 'Robin',
    lastName: 'Ashby',
    email: independentArtistUser.email,
    // Deliberately no shopId - that's the whole point of this fixture. userId is NOT optional
    // though (every Artist has a real User account regardless of shop affiliation - see
    // Artist.userId: ID! in typeDefs.js) - this was missing in an earlier version of this script,
    // which crashed getArtists for every Shop-Admin-or-better caller the moment it ran (Mongoose
    // allows userId to be unset, but nothing in this app's real data model ever should).
    userId: independentArtistUser._id,
    phone: '555-010-0105',
    title: 'Guest Spot / Illustrative',
    hourlyRate: 140,
    status: Constants.ARTIST_STATUS.ACTIVE,
    startDate: daysAgo(60),
  }).save();

  // --- Clients ---------------------------------------------------------------
  const clientDefs = [
    { firstName: 'Alex', lastName: 'Kim', email: 'alex.kim@example.dev', phone: '555-010-0201' },
    { firstName: 'Jordan', lastName: 'Lee', email: 'jordan.lee@example.dev', phone: '555-010-0202' },
    { firstName: 'Taylor', lastName: 'Brooks', email: 'taylor.brooks@example.dev', phone: '555-010-0203' },
    { firstName: 'Morgan', lastName: 'Diaz', email: 'morgan.diaz@example.dev', phone: '555-010-0204' },
  ];
  const clients = [];
  for (const def of clientDefs) {
    const clientUser = await new User({
      username: `client.${def.firstName.toLowerCase()}`,
      email: def.email,
      password: hashedPassword,
      role: Constants.ROLES.CLIENT,
      userType: Constants.USER_TYPE.CLIENT,
      firstName: def.firstName,
      lastName: def.lastName,
      hasSetPassword: true,
    }).save();
    const clientDoc = await new Client({
      firstName: def.firstName,
      lastName: def.lastName,
      email: def.email,
      phone: def.phone,
      userId: clientUser._id,
    }).save();
    clients.push({ user: clientUser, client: clientDoc });
  }

  // --- Projects ----------------------------------------------------------
  // Reminder for future edits: Project.clientId stores the Client sub-document's own _id, NOT the
  // client's User._id - see models/Project.js / resolvers/index.js's Project.client resolver.
  // Project.artistId is the artist's own User._id.
  const project1 = await new Project({
    title: 'Botanical sleeve - forearm',
    description: 'Fine-line botanical piece wrapping the left forearm, black and grey.',
    placement: 'Left forearm',
    size: 'Large',
    palette: 'Black and grey',
    artistId: artist1User._id,
    clientId: clients[0].client._id,
    materialsUsed: ['Needles 5RL', 'Black ink - Eternal'],
    notes: [{ author: 'Maya Chen', note: 'Client wants to extend to the elbow in a future session.' }],
    tags: ['fine-line', 'botanical', 'black-and-grey'],
    status: 'in_progress',
    depositAmount: 100,
  }).save();

  const project2 = await new Project({
    title: 'Traditional eagle - chest piece',
    description: 'American traditional eagle, full color, center chest.',
    placement: 'Chest',
    size: 'Medium',
    palette: 'Full color',
    artistId: artist2User._id,
    clientId: clients[1].client._id,
    materialsUsed: ['Needles 9M1', 'Color set - Intenze'],
    notes: [{ author: 'Jonas Petrov', note: 'Stencil approved, first session scheduled.' }],
    tags: ['traditional', 'color'],
    status: 'in_progress',
    depositAmount: 150,
  }).save();

  const project3 = await new Project({
    title: 'Small script tattoo',
    description: 'Single-line script quote, inner wrist.',
    placement: 'Inner wrist',
    size: 'Small',
    palette: 'Black',
    artistId: artist1User._id,
    clientId: clients[2].client._id,
    notes: [],
    tags: ['script', 'small'],
    status: 'completed',
    depositAmount: 40,
  }).save();

  // --- Appointments - covers the full shopCutStatus lifecycle -------------
  await new Appointment({
    appointmentDate: daysFromNow(7),
    projectId: project1._id,
    shopId: shop._id,
    userId: artist1User._id,
    title: 'Botanical sleeve - session 2',
    description: 'Continue linework on forearm piece.',
    total: 450,
    tip: 50,
    shopCutStatus: 'unpaid',
    shopCutAmount: 90,
    appointmentType: 'session',
    appointmentStatus: 'scheduled',
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
  }).save();

  await new Appointment({
    appointmentDate: daysAgo(14),
    projectId: project2._id,
    shopId: shop._id,
    userId: artist2User._id,
    title: 'Eagle chest piece - session 1',
    description: 'Outline and initial color.',
    total: 600,
    tip: 100,
    shopCutStatus: 'pending_confirmation',
    shopCutAmount: 120,
    shopCutPaymentMethod: 'manual',
    shopCutMarkedPaidBy: artist2User._id,
    shopCutMarkedPaidAt: daysAgo(13),
    appointmentType: 'session',
    appointmentStatus: 'completed',
    createdAt: daysAgo(20),
    updatedAt: daysAgo(13),
  }).save();

  await new Appointment({
    appointmentDate: daysAgo(30),
    projectId: project3._id,
    shopId: shop._id,
    userId: artist1User._id,
    title: 'Script tattoo',
    description: 'Single session, completed.',
    total: 150,
    tip: 30,
    shopCutStatus: 'paid',
    shopCutAmount: 30,
    shopCutPaymentMethod: 'square_invoice',
    shopCutConfirmedBy: shopAdminUser._id,
    shopCutConfirmedAt: daysAgo(28),
    appointmentType: 'session',
    appointmentStatus: 'completed',
    createdAt: daysAgo(35),
    updatedAt: daysAgo(28),
  }).save();

  // Independent artist's appointment - no shop involved, nothing owed.
  const project4ClientIndex = 3;
  const independentProject = await new Project({
    title: 'Guest spot illustrative piece',
    description: 'Illustrative color piece, upper arm, done as a guest artist (no shop affiliation).',
    placement: 'Upper arm',
    size: 'Medium',
    palette: 'Full color',
    artistId: independentArtistUser._id,
    clientId: clients[project4ClientIndex].client._id,
    tags: ['illustrative', 'color'],
    status: 'in_progress',
    depositAmount: 100,
  }).save();
  await new Appointment({
    appointmentDate: daysFromNow(14),
    projectId: independentProject._id,
    userId: independentArtistUser._id,
    title: 'Illustrative piece - session 1',
    description: 'First session, no shop cut - independent booking.',
    total: 500,
    tip: 0,
    shopCutStatus: 'none',
    appointmentType: 'session',
    appointmentStatus: 'scheduled',
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  }).save();

  // --- Conversations + Messages --------------------------------------------
  const convo1 = await findOrCreateConversation([artist1User._id, clients[0].user._id]);
  await new Message({
    conversationId: convo1._id,
    senderId: clients[0].user._id,
    message: 'Hi! Excited for the next session, should I shave the area beforehand?',
    createdAt: daysAgo(4),
    updatedAt: daysAgo(4),
  }).save();
  await new Message({
    conversationId: convo1._id,
    senderId: artist1User._id,
    message: "Yes, please shave the forearm the night before if you can. See you Thursday!",
    createdAt: daysAgo(4),
    updatedAt: daysAgo(4),
  }).save();

  const convo2 = await findOrCreateConversation([artist2User._id, clients[1].user._id]);
  await new Message({
    conversationId: convo2._id,
    senderId: artist2User._id,
    message: 'Stencil is ready for the eagle piece - I\'ll have it printed for your session.',
    createdAt: daysAgo(15),
    updatedAt: daysAgo(15),
  }).save();
  await new Message({
    conversationId: convo2._id,
    senderId: clients[1].user._id,
    message: "Can't wait to see it!",
    createdAt: daysAgo(15),
    updatedAt: daysAgo(15),
  }).save();

  await mongoose.disconnect();

  console.log('\nSeed complete. All accounts share the same password:\n');
  console.log(`  Password: ${DEV_PASSWORD}\n`);
  // The login mutation takes USERNAME, not email (see resolvers/users.js's login) - listing
  // username first here since that's the field that actually matters at the login screen.
  console.log('Accounts (log in with username + password, not email):');
  console.log(`  Platform Admin  username: platformadmin  (${'platformadmin@copperwolf.dev'}) - no dedicated UI, backend-only role`);
  console.log(`  Shop Admin      username: shopadmin       (shopadmin@copperwolf.dev)`);
  console.log(`  Shop Staff      username: frontdesk       (frontdesk@copperwolf.dev)`);
  console.log(`  Artist          username: artist.maya     (maya@copperwolf.dev)  - shop-affiliated`);
  console.log(`  Artist          username: artist.jonas    (jonas@copperwolf.dev) - shop-affiliated`);
  console.log(`  Artist          username: artist.indie    (indie@copperwolf.dev) - independent, no shop`);
  console.log(`  Client          username: client.alex     (alex.kim@example.dev)`);
  console.log(`  Client          username: client.jordan   (jordan.lee@example.dev)`);
  console.log(`  Client          username: client.taylor   (taylor.brooks@example.dev)`);
  console.log(`  Client          username: client.morgan   (morgan.diaz@example.dev)`);
  console.log(`\nShop: Copper Wolf Tattoo Co. (${shop._id})`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
