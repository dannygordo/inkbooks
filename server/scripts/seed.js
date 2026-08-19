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
const BookingRequest = require('../models/BookingRequest');
const PasswordToken = require('../models/PasswordToken');
const Form = require('../models/Form');
const FormResponse = require('../models/FormResponse');
// Everything below this line was added later than everything above it (gift cards, adjustments,
// client flags, expenses/income, the shop-cut-rate override table, Square, event/reminder logging)
// and was never folded into the wipe/syncIndexes lists below - same class of gap that BookingRequest/
// PasswordToken already got fixed for (see the wipe comment). Left alone, every one of these
// accumulates orphaned rows pointing at a shop/artist/client id this script just deleted, on every
// single re-run, forever - none of it crashes, so nothing forced the issue until now.
const Adjustment = require('../models/Adjustment');
const ClientFlag = require('../models/ClientFlag');
const ClientFlagType = require('../models/ClientFlagType');
const ExpenseType = require('../models/ExpenseType');
const Expense = require('../models/Expense');
const IncomeType = require('../models/IncomeType');
const Income = require('../models/Income');
const GiftCard = require('../models/GiftCard');
const GiftCardRedemption = require('../models/GiftCardRedemption');
const ShopCutRate = require('../models/ShopCutRate');
const SquareAccount = require('../models/SquareAccount');
const EventLog = require('../models/EventLog');
const ReminderSettings = require('../models/ReminderSettings');
const ReminderLog = require('../models/ReminderLog');
const ClientScheduleEmail = require('../models/ClientScheduleEmail');
const Notification = require('../models/Notification');
const AutoResponse = require('../models/AutoResponse');
const AutoResponseLog = require('../models/AutoResponseLog');
const { Constants } = require('../utils/constants');
const { pickDefaultTagColor } = require('../utils/tag-color');
const { setShopCutRate } = require('../utils/shop-cut');
// Standing convention (per explicit request): a migration script written for existing data is
// ALSO folded into both seed scripts, not left as a separate step someone has to remember to run.
// seedDefaultForms is itself idempotent and additive-only (see its own header comment), so calling
// it here costs nothing extra even though this script also wipes+recreates everything from
// scratch every run - the point is that `npm run seed`/`node scripts/seed-large.js` are always a
// complete, currently-correct database on their own, with no second script to chase down.
const { seedDefaultForms } = require('../utils/seed-default-forms');

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
    // These two were missed, so a re-seed left them behind pointing at users and clients that no
    // longer existed. BookingRequest is the worse of the pair: orphaned requests keep showing up
    // in an artist's inbox referencing a deleted client, which looks like a bug in the inbox
    // rather than leftover data. PasswordToken orphans are only litter - a token whose user is
    // gone can't be redeemed - but there's no reason to keep them either.
    BookingRequest.deleteMany({}),
    PasswordToken.deleteMany({}),
    // Form/FormResponse are wiped for the same reason - without this, re-running the script would
    // hit the partial unique index on {shopId/artistUserId, systemKey} the moment
    // seedDefaultForms tries to write the shop's Booking Request/Consent forms a second time
    // (harmless there, since seedDefaultForms treats that as "already has it" and skips), but any
    // FormResponse left behind from a previous run would still reference a formId/clientId this
    // wipe just deleted.
    Form.deleteMany({}),
    FormResponse.deleteMany({}),
    // Everything below is the same orphan-avoidance wipe, extended to every model added since this
    // list was last updated - see the import comment above. ClientFlagType is the one exception
    // worth calling out: it's platform-wide (shopId: null for every row this script or the app
    // itself ever writes), not scoped to the shop/artists this run just deleted, so wiping it is
    // just clearing the slate before ensureSeeded() rewrites it below, not orphan cleanup.
    Adjustment.deleteMany({}),
    ClientFlag.deleteMany({}),
    ClientFlagType.deleteMany({}),
    ExpenseType.deleteMany({}),
    Expense.deleteMany({}),
    IncomeType.deleteMany({}),
    Income.deleteMany({}),
    GiftCard.deleteMany({}),
    GiftCardRedemption.deleteMany({}),
    ShopCutRate.deleteMany({}),
    SquareAccount.deleteMany({}),
    EventLog.deleteMany({}),
    ReminderSettings.deleteMany({}),
    ReminderLog.deleteMany({}),
    ClientScheduleEmail.deleteMany({}),
    Notification.deleteMany({}),
    AutoResponse.deleteMany({}),
    AutoResponseLog.deleteMany({}),
  ]);

  // deleteMany empties collections but leaves their INDEXES behind, and a stale unique index is a
  // re-seed that fails for a reason nothing in this file explains.
  //
  // Concretely, the one that made this necessary: User used to carry a unique `username`. Drop the
  // field from the schema and every new user writes no username at all - which Mongo stores as the
  // single value `null` for indexing purposes, so the FIRST user seeds fine and the SECOND dies on
  // a duplicate key error naming an index for a field that no longer exists anywhere in the code.
  //
  // syncIndexes() drops any index the schema doesn't declare and builds any it does, so removing a
  // field is a schema edit and nothing more - no manual dropIndex, no "delete the database and
  // start over". Runs after the wipe, on empty collections, where a unique index build can't fail
  // on data that's already there.
  console.log('Syncing indexes (drops any left over from removed fields) ...');
  await Promise.all(
    [
      User, Shop, Staff, Artist, Client, ArtistShopConnection, Project,
      Appointment, Conversation, Message, BookingRequest, PasswordToken, Form, FormResponse,
      Adjustment, ClientFlag, ClientFlagType, ExpenseType, Expense, IncomeType, Income,
      GiftCard, GiftCardRedemption, ShopCutRate, SquareAccount, EventLog, ReminderSettings,
      ReminderLog, ClientScheduleEmail, Notification, AutoResponse, AutoResponseLog,
    ].map((model) => model.syncIndexes()),
  );

  // The app's platform-wide default client-flag types (NO_SHOWED/MOVED_APPOINTMENT/NO_TIP) - see
  // models/ClientFlagType.js. There is no createClientFlagType mutation and no admin UI for these;
  // ClientFlagType.ensureSeeded() (idempotent, $setOnInsert-only) is the ONLY place in the entire
  // codebase that writes them, and until now nothing called it - not this script, not seed-large.js
  // (which hand-rolled its own, different set instead - see that file), and not server boot either.
  // A fresh dev database had zero rows here and the Client Flags feature had nothing to offer.
  await ClientFlagType.ensureSeeded();

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
    // Portland. Seeds User.timezone for anyone who joins, and is never read at send time - see
    // models/User.js on why a person's zone is theirs and not their shop's.
    timezone: 'America/Los_Angeles',
    shopMinimum: 80,
    hourlyRate: 150,
    // The shop takes 20% of session work. Applied to subtotalCents only - never tips, tax or
    // processing fees. See models/Shop.js and utils/shop-cut.js. The seeded appointments below
    // have shopCutCents values consistent with this rate.
    shopCutPercent: 20,
    billingType: 'percentage',
    // Shop.status, which is its own unnamed field - not STAFF_STATUS, which happens to share the
    // value 1.
    status: 1,
  }).save();

  // --- Platform Admin: deliberately NOT seeded any more. ---
  //
  // There used to be a `platformadmin` account here at Constants.ROLES.ADMIN, back when that role
  // could read every shop on the platform. That bypass is gone (see utils/shop-membership.js) and
  // nothing grants cross-shop access, so the account would log in and see an empty app - it has
  // no Staff row, therefore no shop, therefore no data. Seeding a login that appears broken is
  // worse than not seeding it.
  //
  // If cross-shop support access is ever needed, the mechanism is a real Staff row at the shop
  // being helped: time-boxed, revocable, and visible to the shop owner. Not a role.

  // --- Shop Admin (User + Artist + Staff + connection) ----------------------
  //
  // ALL FOUR RECORDS, matching what registerAccount actually produces for a shop signup. This used
  // to create a User with userType STAFF and a Staff row only, which was a second shape of shop
  // admin that no creation path in the real app produces - and the difference was invisible until
  // userType began gating real surfaces. A STAFF-typed admin had no Settings page, and the Square
  // and pricing panels resolved them as an INDEPENDENT artist, so they could not configure their
  // own shop's tax rate at all. A seed that produces a shape the app cannot is worse than no seed:
  // it makes the bug reproducible only for people who used it.
  //
  // The Staff row stays alongside the Artist one. The connection is what puts them on the shop's
  // calendar and in its analytics; the Staff row is what makes them findable as an ADMIN of it.
  // Neither substitutes for the other - see registerAccount's own note.
  const shopAdminUser = await new User({
    email: 'shopadmin@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.SHOP_ADMIN,
    userType: Constants.USER_TYPE.ARTIST,
    firstName: 'Dana',
    lastName: 'Wolfe',
    hasSetPassword: true,
    // Shop-unique among Copper Wolf's members - same picker the real login/calendar self-heal use.
    tagColor: await pickDefaultTagColor(shop._id),
  }).save();
  await new Artist({
    firstName: 'Dana',
    lastName: 'Wolfe',
    email: shopAdminUser.email,
    userId: shopAdminUser._id,
    status: Constants.ARTIST_STATUS.ACTIVE,
    startDate: new Date(),
  }).save();
  await new ArtistShopConnection({
    artistId: shopAdminUser._id,
    shopId: shop._id,
    status: 'active',
    startedAt: new Date(),
    endedAt: null,
  }).save();
  await new Staff({
    firstName: 'Dana',
    lastName: 'Wolfe',
    email: shopAdminUser.email,
    phone: '555-010-0101',
    userId: shopAdminUser._id,
    shopId: shop._id,
    status: Constants.STAFF_STATUS.ACTIVE,
    title: 'Owner',
  }).save();
  // Mirrors what registerAccount now writes for real at signup (see
  // graphql/resolvers/users.js's own comment on this) - the owner never owes their own shop a
  // cut. Dana has no appointments of her own in this fixture today, so nothing currently reads
  // this row, but the shop's own default set above (shopCutPercent: 20) is exactly the value
  // that would silently apply to her if that ever changes without this override existing.
  await setShopCutRate({
    artistUserId: shopAdminUser._id,
    shopId: shop._id,
    percent: 0,
    setByUserId: shopAdminUser._id,
    note: 'Shop owner - does not owe their own shop a cut.',
  });

  // The shop's own Booking Request / Consent forms - what createShop/registerAccount write for
  // real at signup (see utils/seed-default-forms.js). Every shop-affiliated artist below (Maya,
  // Jonas) reaches these through the shop's own forms, not a personal copy - see that file's own
  // header comment on why only the shop and the INDEPENDENT artist further down get their own.
  await seedDefaultForms({ shopId: shop._id }, shopAdminUser._id);

  // A SquareAccount row, DISCONNECTED - matching seed-large.js's own fixture and its own comment on
  // why (no seed can produce a WORKING Square connection; a row that claims one fails with a 500 at
  // charge time instead of a clear "not connected" in Settings). This script previously created no
  // SquareAccount row at all for its shop, which HANDOFF.md flagged as an unresolved question -
  // resolved here in favor of matching seed-large.js rather than leaving the two scripts to disagree
  // on whether "no row" and "disconnected row" are the same thing to every reader of this data.
  await new SquareAccount({ ownerType: 'SHOP', ownerId: shop._id, connected: false }).save();

  // --- Shop Staff (front desk) ----------------------------------------------
  const staffUser = await new User({
    email: 'frontdesk@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.SHOP_STAFF,
    userType: Constants.USER_TYPE.STAFF,
    firstName: 'Sam',
    lastName: 'Rivera',
    hasSetPassword: true,
    tagColor: await pickDefaultTagColor(shop._id),
  }).save();
  await new Staff({
    firstName: 'Sam',
    lastName: 'Rivera',
    email: staffUser.email,
    phone: '555-010-0102',
    userId: staffUser._id,
    shopId: shop._id,
    status: Constants.STAFF_STATUS.ACTIVE,
    title: 'Front Desk',
  }).save();

  // --- Artists (shop-affiliated) --------------------------------------------
  const artist1User = await new User({
    email: 'maya@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.ARTIST,
    userType: Constants.USER_TYPE.ARTIST,
    firstName: 'Maya',
    lastName: 'Chen',
    hasSetPassword: true,
    tagColor: await pickDefaultTagColor(shop._id),
  }).save();
  await new Artist({
    firstName: 'Maya',
    lastName: 'Chen',
    email: artist1User.email,
    // Real booking links, so /book/<slug> is testable straight after a seed rather than needing
    // an artist's ObjectId copied out of the database first. See utils/booking-slug.js.
    bookingSlug: 'maya-chen',
    phone: '555-010-0103',
    userId: artist1User._id,
    title: 'Fine Line / Botanical',
    hourlyRate: 175,
    status: Constants.ARTIST_STATUS.ACTIVE,
    startDate: daysAgo(400),
  }).save();
  await new ArtistShopConnection({ artistId: artist1User._id, shopId: shop._id, status: 'active' }).save();

  const artist2User = await new User({
    email: 'jonas@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.ARTIST,
    userType: Constants.USER_TYPE.ARTIST,
    firstName: 'Jonas',
    lastName: 'Petrov',
    hasSetPassword: true,
    tagColor: await pickDefaultTagColor(shop._id),
  }).save();
  await new Artist({
    firstName: 'Jonas',
    lastName: 'Petrov',
    email: artist2User.email,
    bookingSlug: 'jonas-petrov',
    phone: '555-010-0104',
    userId: artist2User._id,
    title: 'Traditional / Blackwork',
    hourlyRate: 160,
    status: Constants.ARTIST_STATUS.ACTIVE,
    startDate: daysAgo(200),
  }).save();
  await new ArtistShopConnection({ artistId: artist2User._id, shopId: shop._id, status: 'active' }).save();

  // --- Independent artist (no shop) - exercises the artist-centric tenancy path ---
  const independentArtistUser = await new User({
    email: 'indie@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.ARTIST,
    userType: Constants.USER_TYPE.ARTIST,
    firstName: 'Robin',
    lastName: 'Ashby',
    hasSetPassword: true,
    // No shop - independent artists get the same no-shop fallback as everyone else unaffiliated.
    tagColor: await pickDefaultTagColor(null),
  }).save();
  await new Artist({
    firstName: 'Robin',
    lastName: 'Ashby',
    email: independentArtistUser.email,
    bookingSlug: 'robin-ashby',
    // Deliberately no ArtistShopConnection below - that's the whole point of this fixture, and
    // it's now the only thing that would make them shop-affiliated (Artist.shopId is no longer
    // read or written - see utils/artist-shop.js). userId is NOT optional though: every Artist
    // has a real User account regardless of shop affiliation (Artist.userId: ID! in typeDefs.js).
    // It was missing in an earlier version of this script, which crashed getArtists for every
    // Shop-Admin-or-better caller the moment it ran.
    userId: independentArtistUser._id,
    phone: '555-010-0105',
    title: 'Guest Spot / Illustrative',
    hourlyRate: 140,
    status: Constants.ARTIST_STATUS.ACTIVE,
    startDate: daysAgo(60),
  }).save();
  // Her own Booking Request / Consent forms - independent artists have no shop to reach a set
  // through, so they get their own, exactly like registerAccount's no-shop branch does.
  await seedDefaultForms({ artistUserId: independentArtistUser._id }, independentArtistUser._id);
  // Same disconnected SquareAccount as the shop above - an independent artist is their own owner
  // (ownerType: 'ARTIST', ownerId: their own User._id, per SquareAccount's own header comment).
  await new SquareAccount({
    ownerType: 'ARTIST',
    ownerId: independentArtistUser._id,
    connected: false,
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
      email: def.email,
      password: hashedPassword,
      role: Constants.ROLES.CLIENT,
      userType: Constants.USER_TYPE.CLIENT,
      firstName: def.firstName,
      lastName: def.lastName,
      hasSetPassword: true,
      // A client's TAG COLOUR has no shop to be unique within - same no-shop fallback as an
      // independent artist. Separate question from shopIds below, which is about access.
      tagColor: await pickDefaultTagColor(null),
    }).save();
    const clientDoc = await new Client({
      firstName: def.firstName,
      lastName: def.lastName,
      email: def.email,
      phone: def.phone,
      userId: clientUser._id,
      status: Constants.CLIENT_STATUS.ACTIVE,
      // These are the shop's walk-in clients, so they carry the link the client wizard and the
      // public booking form both write in the real app - without it the shop couldn't so much as
      // correct a typo in their email. See models/Client.js.
      shopIds: [shop._id],
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
    palette: 'black',
    artistId: artist1User._id,
    clientId: clients[0].client._id,
    materialsUsed: ['Needles 5RL', 'Black ink - Eternal'],
    notes: [{ author: 'Maya Chen', note: 'Client wants to extend to the elbow in a future session.' }],
    tags: ['fine-line', 'botanical', 'black-and-grey'],
    status: 'in_progress',
  }).save();

  const project2 = await new Project({
    title: 'Traditional eagle - chest piece',
    description: 'American traditional eagle, full color, center chest.',
    placement: 'Chest',
    size: 'Medium',
    palette: 'color',
    artistId: artist2User._id,
    clientId: clients[1].client._id,
    materialsUsed: ['Needles 9M1', 'Color set - Intenze'],
    notes: [{ author: 'Jonas Petrov', note: 'Stencil approved, first session scheduled.' }],
    tags: ['traditional', 'color'],
    status: 'in_progress',
  }).save();

  const project3 = await new Project({
    title: 'Small script tattoo',
    description: 'Single-line script quote, inner wrist.',
    placement: 'Inner wrist',
    size: 'Small',
    palette: 'black',
    artistId: artist1User._id,
    clientId: clients[2].client._id,
    notes: [],
    tags: ['script', 'small'],
    status: 'completed',
  }).save();

  // --- A consult that took a deposit, and the project it spawned ----------
  // Deposits only exist on the appointment that collected them (see models/Appointment.js), and a
  // Project reaches its deposit through the BookingRequest both share. Seeded end to end so the
  // deposit UI has something real to show - without this, every seeded project reads "no deposit
  // taken" and the whole flow is invisible in a fresh database.
  const consultConvo = await findOrCreateConversation([artist1User._id, clients[0].user._id]);
  const depositRequest = await new BookingRequest({
    artistId: artist1User._id,
    clientId: clients[0].client._id,
    conversationId: consultConvo._id,
    guestToken: 'seed-guest-token-botanical-sleeve',
    status: 'session_booked',
    description: 'Fine-line botanical piece wrapping the left forearm.',
    placement: 'Left forearm',
    size: 'Large',
    source: 'public_form',
  }).save();
  // The link that makes the deposit findable from the project.
  await Project.findByIdAndUpdate(project1._id, { bookingRequestId: depositRequest._id });

  await new Appointment({
    appointmentDate: daysAgo(21),
    shopId: shop._id,
    userId: artist1User._id,
    bookingRequestId: depositRequest._id,
    title: 'Consult - Priya Raman',
    appointmentType: 'consult',
    appointmentStatus: 'completed',
    // The deposit IS this appointment's transaction: $100 taken, so subtotal and total are $100
    // and the shop's 20% cut is charged here ($20). That second half is what keeps the shop whole
    // once the deposit is deducted from the final session - see utils/shop-cut.js.
    depositCents: 10000,
    depositStatus: 'available',
    depositCollectedAt: daysAgo(21),
    subtotalCents: 10000,
    totalCents: 10000,
    shopCutCents: 2000,
    shopCutPercentApplied: 20,
    shopCutStatus: 'unpaid',
    createdAt: daysAgo(21),
    updatedAt: daysAgo(21),
  }).save();

  // --- Appointments - covers the full shopCutStatus lifecycle -------------
  await new Appointment({
    appointmentDate: daysFromNow(7),
    projectId: project1._id,
    shopId: shop._id,
    userId: artist1User._id,
    title: 'Botanical sleeve - session 2',
    description: 'Continue linework on forearm piece.',
    // Integer cents - see utils/money.js. $450 work + $50 tip; the shop's 20% cut is computed
    // against the SUBTOTAL only ($450 x 20% = $90), never the tip, so shopCutCents is 9000 and
    // not 10000. That difference is the whole point of storing the components separately.
    subtotalCents: 45000,
    taxCents: 0,
    feeCents: 0,
    tipCents: 5000,
    totalCents: 50000,
    shopCutStatus: 'unpaid',
    shopCutCents: 9000,
    shopCutPercentApplied: 20,
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
    subtotalCents: 60000,
    taxCents: 0,
    feeCents: 0,
    tipCents: 10000,
    totalCents: 70000,
    shopCutStatus: 'pending_confirmation',
    shopCutCents: 12000,
    shopCutPercentApplied: 20,
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
    subtotalCents: 15000,
    taxCents: 0,
    feeCents: 0,
    tipCents: 3000,
    totalCents: 18000,
    shopCutStatus: 'paid',
    shopCutCents: 3000,
    shopCutPercentApplied: 20,
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
    palette: 'color',
    artistId: independentArtistUser._id,
    clientId: clients[project4ClientIndex].client._id,
    tags: ['illustrative', 'color'],
    status: 'in_progress',
  }).save();
  await new Appointment({
    appointmentDate: daysFromNow(14),
    projectId: independentProject._id,
    userId: independentArtistUser._id,
    title: 'Illustrative piece - session 1',
    description: 'First session, no shop cut - independent booking.',
    subtotalCents: 50000,
    taxCents: 0,
    feeCents: 0,
    tipCents: 0,
    totalCents: 50000,
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
  // Email IS the credential now - it's what login() takes and the only identifier any of these
  // accounts has. There used to be a separate username printed alongside, which was the field the
  // login screen actually wanted; the two lists drifting apart is precisely the confusion that
  // made this worth deleting.
  console.log('Accounts (log in with email + password):');
  console.log(`  Shop Admin      shopadmin@copperwolf.dev`);
  console.log(`  Shop Staff      frontdesk@copperwolf.dev`);
  console.log(`  Artist          maya@copperwolf.dev    - shop-affiliated`);
  console.log(`  Artist          jonas@copperwolf.dev   - shop-affiliated`);
  console.log(`  Artist          indie@copperwolf.dev   - independent, no shop`);
  console.log(`  Client          alex.kim@example.dev`);
  console.log(`  Client          jordan.lee@example.dev`);
  console.log(`  Client          taylor.brooks@example.dev`);
  console.log(`  Client          morgan.diaz@example.dev`);
  console.log('\nNotifications: shop admin digests at 8am; artists get theirs immediately.');
  console.log('  Take a deposit as an artist, then check the bell as shopadmin@copperwolf.dev.');
  console.log('  An independent artist gets nothing - there is nobody else to tell.');
  console.log('\nPublic booking pages (no login needed - this is what a client sees):');
  console.log('  http://localhost:3000/book/maya-chen');
  console.log('  http://localhost:3000/book/jonas-petrov');
  console.log('  http://localhost:3000/book/robin-ashby   - independent artist, no shop');
  console.log('\nSubmitted requests land in that artist\'s Booking Requests inbox.');
  console.log('\nPublic consent form pages (same idea, seeded by default for every shop/artist):');
  console.log('  http://localhost:3000/consent/maya-chen');
  console.log('  http://localhost:3000/consent/jonas-petrov');
  console.log('  http://localhost:3000/consent/robin-ashby   - independent artist, own copy');
  console.log(`\nShop: Copper Wolf Tattoo Co. (${shop._id})`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
