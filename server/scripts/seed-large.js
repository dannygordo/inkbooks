// Populates a local development database with enough data that every list, dashboard, filter and
// report has something real to show. Where scripts/seed.js creates roughly one of everything - a
// hand-written fixture you can read end to end - this creates a shop that has been running for four
// months.
//
// WHY BOTH EXIST. seed.js is for reading: every record is written by hand with a comment saying
// what it demonstrates, and you can hold the whole thing in your head. It cannot show you an
// N+1 query, a pagination off-by-one, a dashboard that is slow, or a chart with one bar. This one
// cannot be read that way and is not meant to be - it is for looking at the app under load.
//
// THE MONEY IS COMPUTED BY THE REAL CODE, not by this file. computeChargeBreakdown and applyShopCut
// are imported and used exactly as the charge path uses them, so the seeded figures obey M2, M3,
// M5, M8 and M11 by construction. A seed that does its own arithmetic is a second implementation of
// the money rules that nothing tests and that drifts the first time a rule changes - and this
// codebase has already paid for a second source of truth more than once.
//
// Shape (see the CONFIG block below to change any of it):
//   - one shop, four months of history, three weeks of future bookings
//   - six artists: five at the shop (one of whom is the owner - see DECISIONS.md S0) and one
//     independent
//   - $180/hr, $100 deposits, a 40% shop cut, 2-5 hour sessions, 2-3 sessions per project, about
//     six sessions per artist per week
//
// Usage (from server/):
//   node scripts/seed-large.js
//
// Strictly local-dev tooling, and destructive: it wipes every collection it touches, exactly like
// seed.js, and refuses to run against anything that does not look like a local Mongo instance.

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
const ShopCutRate = require('../models/ShopCutRate');
const SquareAccount = require('../models/SquareAccount');
const Project = require('../models/Project');
const Appointment = require('../models/Appointment');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const BookingRequest = require('../models/BookingRequest');
const ClientFlag = require('../models/ClientFlag');
const ClientFlagType = require('../models/ClientFlagType');
const PasswordToken = require('../models/PasswordToken');
const Notification = require('../models/Notification');
const { Constants } = require('../utils/constants');
const { TAG_COLORS } = require('../utils/tag-color');
const { computeChargeBreakdown } = require('../utils/square-pricing');
const { applyShopCut, setShopCutRate } = require('../utils/shop-cut');

// ---------------------------------------------------------------------------------------------
// CONFIG - the numbers this was asked for, in one place so they can be turned up or down.
// ---------------------------------------------------------------------------------------------
const CONFIG = {
  hourlyRateDollars: 180,
  depositCents: 10000, // $100
  shopCutPercent: 40,
  // Sales tax, in basis points (M8). 9.4% - Washington-ish, and deliberately not a round number so
  // rounding shows up in the figures rather than hiding behind whole dollars.
  shopTaxBasisPoints: 940,
  // The independent artist bills somewhere else, so her rate differs. Two different rates in the
  // data is the only way to notice a screen that hardcodes one.
  independentTaxBasisPoints: 890,
  feeOffsetCentsPerHour: 600, // $6/hr (M5)
  sessionHoursMin: 2,
  sessionHoursMax: 5,
  sessionsPerProjectMin: 2,
  sessionsPerProjectMax: 3,
  sessionsPerArtistPerWeek: 6,
  weeksOfHistory: 16,
  weeksOfFuture: 3,
};

const DEV_PASSWORD = 'devpass123';

const mongoUri = (process.env.MONGODB || '').replace(/,\s*$/, '');
if (!mongoUri) {
  throw new Error('MONGODB environment variable is not set - check server/.env.development.');
}
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(mongoUri)) {
  throw new Error(
    `Refusing to run: MONGODB (${mongoUri.replace(/\/\/.*@/, '//***@')}) doesn't look like a ` +
      'local database. This script wipes every collection it touches - only run it against ' +
      'mongodb://localhost:27017/... .'
  );
}

// ---------------------------------------------------------------------------------------------
// Deterministic randomness. A seeded PRNG rather than Math.random, so two runs produce the same
// database - "it looked wrong yesterday" is only worth investigating if yesterday is reproducible.
// ---------------------------------------------------------------------------------------------
let rngState = 20260811;
function rnd() {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}
function randInt(min, max) {
  return min + Math.floor(rnd() * (max - min + 1));
}
function pick(list) {
  return list[Math.floor(rnd() * list.length)];
}
function chance(p) {
  return rnd() < p;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10 + randInt(0, 7), pick([0, 15, 30, 45]), 0, 0);
  return d;
}

const FIRST_NAMES = [
  'Priya', 'Marcus', 'Elena', 'Dwayne', 'Rosa', 'Tomas', 'Aisha', 'Nils', 'Camille', 'Jonah',
  'Yuki', 'Ade', 'Freya', 'Ravi', 'Lena', 'Osman', 'Marta', 'Kofi', 'Ingrid', 'Diego',
  'Noor', 'Callum', 'Sasha', 'Bo', 'Imogen', 'Rafael', 'Thandi', 'Emil', 'Suki', 'Hugo',
];
const LAST_NAMES = [
  'Raman', 'Boateng', 'Vasquez', 'Okafor', 'Lindqvist', 'Moreau', 'Haddad', 'Nakamura', 'Silva',
  'Fitzgerald', 'Duarte', 'Novak', 'Adeyemi', 'Kowalski', 'Ferreira', 'Bianchi', 'Sorensen',
  'Mwangi', 'Petrov', 'Delgado',
];
const PROJECT_TITLES = [
  'Botanical half sleeve', 'Blackwork raven', 'Neo-trad fox', 'Fine-line florals',
  'Japanese koi backpiece', 'Geometric forearm', 'Watercolour hummingbird', 'Ornamental sternum',
  'Portrait cover-up', 'Traditional swallow pair', 'Script ribcage', 'Dotwork mandala',
  'Snake and peony', 'Illustrative wolf', 'Art nouveau thigh piece', 'Micro-realism eye',
];
const PLACEMENTS = ['Left forearm', 'Right thigh', 'Upper back', 'Ribcage', 'Sternum', 'Calf'];
// Real ProjectInput enum values (server/utils/validation.js's updateProjectInputSchema), not
// display labels - the same class of bug PRODUCTION_ROADMAP.md documents already having been
// fixed once in seed.js, apparently missed here. Mongoose's own schema (models/Project.js) has no
// enum constraint on palette, so seeding a display label like 'Blackwork' saved without
// complaint - but every subsequent updateProject call echoes the project's current palette value
// back as part of its payload (see pages/projects/Project.jsx and IBProgressListProject.jsx), and
// the GraphQL layer's zod validation does enforce the enum. The result: any project seeded with
// one of these old labels could never be saved again, through ANY field - not just palette -
// since the invalid value it kept echoing back failed validation before the resolver looked at
// anything else. Found via a live "Invalid option: expected one of black|color" error on a
// reference image upload, which is why it surfaced there first.
const PALETTES = ['black', 'color'];

let nameCounter = 0;
function uniqueName() {
  nameCounter += 1;
  return {
    firstName: pick(FIRST_NAMES),
    lastName: pick(LAST_NAMES),
    tag: nameCounter,
  };
}

async function main() {
  await mongoose.connect(mongoUri);
  console.log(`Connected to ${mongoUri}`);

  const MODELS = [
    User, Shop, Staff, Artist, Client, ArtistShopConnection, ShopCutRate, SquareAccount,
    Project, Appointment, Conversation, Message, BookingRequest, ClientFlag, ClientFlagType,
    PasswordToken, Notification,
  ];

  console.log('Wiping existing collections ...');
  await Promise.all(MODELS.map((m) => m.deleteMany({})));
  // deleteMany leaves indexes behind, and a stale unique index is a re-seed that fails for a reason
  // nothing in this file explains. Same reasoning as seed.js - see its own note.
  console.log('Syncing indexes ...');
  await Promise.all(MODELS.map((m) => m.syncIndexes()));

  const hashedPassword = await bcrypt.hash(DEV_PASSWORD, 12);

  // --- The shop --------------------------------------------------------------------------------
  const shop = await new Shop({
    name: 'Copper Wolf Tattoo',
    email: 'hello@copperwolf.dev',
    phone: '555-010-0100',
    address: '114 Foundry Street',
    city: 'Tacoma',
    state: 'WA',
    zip: '98402',
    website: 'https://copperwolf.dev',
    hourlyRate: CONFIG.hourlyRateDollars, // DOLLARS - see utils/square-pricing.js on the boundary
    shopCutPercent: CONFIG.shopCutPercent,
    billingType: 'hourly',
    taxRateBasisPoints: CONFIG.shopTaxBasisPoints,
    squareFeeOffsetCents: CONFIG.feeOffsetCentsPerHour,
    status: 1,
  }).save();

  // A SquareAccount row, DISCONNECTED.
  //
  // This used to seed connected: true with a placeholder token, and that was wrong in the way that
  // costs somebody an afternoon. No seed can produce a working Square connection - the credentials
  // come from a real OAuth handshake with a real seller - so a row claiming one is a row the app
  // cannot tell apart from the genuine article until money is supposed to move, at which point it
  // failed with a 500 while charging a client's card.
  //
  // Disconnected is the truth, and the truth is also the more useful fixture: the Square panel says
  // "not connected", and a charge is refused up front with a message naming who has to fix it,
  // instead of a server error at the till. Connect a real Square SANDBOX seller through Settings to
  // exercise the charge path for real - HANDOFF's Next item 1.
  await new SquareAccount({
    ownerType: 'SHOP',
    ownerId: shop._id,
    connected: false,
  }).save();

  // --- Client flag types (C2) ------------------------------------------------------------------
  // NO_SHOWED is system-generated; the rest are the admin-managed table the design calls for.
  await ClientFlagType.insertMany([
    { key: 'NO_SHOWED', label: 'No-showed', systemGenerated: true, active: true,
      description: 'Raised automatically when a session is marked no-show.', createdAt: new Date() },
    { key: 'CHRONIC_LATE', label: 'Often late', systemGenerated: false, active: true,
      description: 'Turns up 20+ minutes late.', createdAt: new Date() },
    { key: 'HAGGLES', label: 'Haggles on price', systemGenerated: false, active: true,
      description: '', createdAt: new Date() },
    { key: 'GREAT_SITTER', label: 'Great sitter', systemGenerated: false, active: true,
      description: 'Sits well through long sessions.', createdAt: new Date() },
  ]);

  // --- People ----------------------------------------------------------------------------------
  // Six artists: five at the shop, one independent. The FIRST of the five is the shop's owner and
  // also tattoos - see DECISIONS.md S0, which is the shape registerAccount produces and the only
  // one the app supports.
  const artistSpecs = [
    { key: 'owner', firstName: 'Dana', lastName: 'Wolfe', role: Constants.ROLES.SHOP_ADMIN,
      email: 'shopadmin@copperwolf.dev', title: 'Owner', slug: 'dana-wolfe' },
    { key: 'artist2', firstName: 'Mika', lastName: 'Sorensen', role: Constants.ROLES.ARTIST,
      email: 'mika@copperwolf.dev', slug: 'mika-sorensen' },
    { key: 'artist3', firstName: 'Andre', lastName: 'Okafor', role: Constants.ROLES.ARTIST,
      email: 'andre@copperwolf.dev', slug: 'andre-okafor' },
    { key: 'artist4', firstName: 'Beatriz', lastName: 'Duarte', role: Constants.ROLES.ARTIST,
      email: 'beatriz@copperwolf.dev', slug: 'beatriz-duarte' },
    { key: 'artist5', firstName: 'Soren', lastName: 'Novak', role: Constants.ROLES.ARTIST,
      email: 'soren@copperwolf.dev', slug: 'soren-novak' },
    { key: 'independent', firstName: 'June', lastName: 'Haddad', role: Constants.ROLES.ARTIST,
      email: 'june@independent.dev', slug: 'june-haddad', independent: true },
  ];

  // tagColor is assigned by INDEX here, not via pickDefaultTagColor(shop._id) - that function
  // picks a color unused by anyone currently in getMemberUserIdsForShop (Staff + active
  // ArtistShopConnection rows for this shop), but this loop creates every shop artist's User
  // BEFORE any of their ArtistShopConnection/Staff rows exist (those come later - the
  // Memberships block below, and the owner's Staff row further down). Every call therefore saw
  // zero existing members and returned the same first color: every shop artist logged in with
  // the identical tagColor, which is exactly the "everyone's records are the same color" report.
  // A plain index into the same palette sidesteps the ordering dependency entirely rather than
  // reshuffling the rest of this script to interleave connection-creation with user-creation
  // (which the Soren two-interval logic and the shop-cut-rate loop below both need done as a
  // separate, complete-artists-array pass anyway).
  let shopArtistColorIndex = 0;
  const artists = [];
  for (const spec of artistSpecs) {
    const user = await new User({
      email: spec.email,
      password: hashedPassword,
      role: spec.role,
      userType: Constants.USER_TYPE.ARTIST,
      firstName: spec.firstName,
      lastName: spec.lastName,
      hasSetPassword: true,
      hourlyRate: CONFIG.hourlyRateDollars,
      billingType: 'hourly',
      tagColor: spec.independent
        ? undefined
        : TAG_COLORS[shopArtistColorIndex++ % TAG_COLORS.length],
    }).save();

    const artist = await new Artist({
      firstName: spec.firstName,
      lastName: spec.lastName,
      email: spec.email,
      userId: user._id,
      bookingSlug: spec.slug,
      status: Constants.ARTIST_STATUS.ACTIVE,
      hourlyRate: CONFIG.hourlyRateDollars,
      billingType: 'hourly',
      startDate: daysAgo(CONFIG.weeksOfHistory * 7 + 30),
      // Only meaningful for the independent artist - a connected one resolves to the shop's (M8).
      // Set on all six anyway, so switching someone to independent in the UI does not silently
      // leave them collecting no tax.
      taxRateBasisPoints: spec.independent
        ? CONFIG.independentTaxBasisPoints
        : CONFIG.shopTaxBasisPoints,
      squareFeeOffsetCents: CONFIG.feeOffsetCentsPerHour,
    }).save();

    artists.push({ ...spec, user, artist });
  }

  const owner = artists.find((a) => a.key === 'owner');
  const independent = artists.find((a) => a.independent);
  const shopArtists = artists.filter((a) => !a.independent);

  // The owner is an admin AND an artist - both records, exactly as registerAccount writes them.
  await new Staff({
    firstName: owner.firstName,
    lastName: owner.lastName,
    email: owner.email,
    phone: '555-010-0101',
    userId: owner.user._id,
    shopId: shop._id,
    status: Constants.STAFF_STATUS.ACTIVE,
    title: 'Owner',
  }).save();

  // A front-desk account, so the SHOP_STAFF role has a real user behind it.
  //
  // Still the index counter, not pickDefaultTagColor(shop._id) - at this point only the owner's
  // Staff row exists (just above); Mika/Andre/Beatriz/Soren's ArtistShopConnection rows are still
  // a few lines away (the Memberships block below), so a DB-driven lookup here would only exclude
  // the owner's color and could still collide with one of theirs.
  const frontDeskUser = await new User({
    email: 'frontdesk@copperwolf.dev',
    password: hashedPassword,
    role: Constants.ROLES.SHOP_STAFF,
    userType: Constants.USER_TYPE.STAFF,
    firstName: 'Sam',
    lastName: 'Rivera',
    hasSetPassword: true,
    tagColor: TAG_COLORS[shopArtistColorIndex++ % TAG_COLORS.length],
  }).save();
  await new Staff({
    firstName: 'Sam', lastName: 'Rivera', email: frontDeskUser.email, phone: '555-010-0102',
    userId: frontDeskUser._id, shopId: shop._id, status: Constants.STAFF_STATUS.ACTIVE,
    title: 'Front desk',
  }).save();

  // --- Memberships (A2) ------------------------------------------------------------------------
  // Intervals, not flags. One artist has TWO rows - they left and came back - which is the case the
  // old single-row model could not express and the only way to see the interval logic working.
  const historyStart = daysAgo(CONFIG.weeksOfHistory * 7);
  for (const a of shopArtists) {
    await new ArtistShopConnection({
      artistId: a.user._id,
      shopId: shop._id,
      status: 'active',
      startedAt: historyStart,
      endedAt: null,
      rateSource: 'shop',
    }).save();
  }
  // Soren left for six weeks in the middle and came back. His earlier interval is closed; the open
  // one above is the current period.
  const sorenLeft = daysAgo(CONFIG.weeksOfHistory * 7 - 20);
  const sorenReturned = daysAgo(CONFIG.weeksOfHistory * 7 - 62);
  const soren = artists.find((a) => a.key === 'artist5');
  await ArtistShopConnection.updateOne(
    { artistId: soren.user._id, endedAt: null },
    { $set: { startedAt: sorenReturned } },
  );
  await new ArtistShopConnection({
    artistId: soren.user._id,
    shopId: shop._id,
    status: 'disconnected',
    startedAt: historyStart,
    endedAt: sorenLeft,
    disconnectedAt: sorenLeft,
    rateSource: 'shop',
  }).save();

  // --- Shop cut rates (M1, M7) -----------------------------------------------------------------
  // Effective-dated and append-only. Every HIRED artist starts at 40%; two of them change
  // part-way through, so a cut computed on an old session must resolve to the old rate. That is
  // not visible at all without at least one artist having two rows.
  //
  // The owner is deliberately excluded from this loop - shopArtists includes her (she's a real
  // Artist row like everyone else, per DECISIONS.md S0), but giving her the shop's opening rate
  // here would put her on the hook for 40% of her own chair, which the real registerAccount flow
  // no longer does (see graphql/resolvers/users.js) since it now writes her a 0% row at signup.
  // A seed producing a shape the app itself doesn't is worse than no seed - see this file's own
  // header note on that. Her own 0% row is written separately, right below.
  const hiredArtists = shopArtists.filter((a) => a.key !== 'owner');
  for (const a of hiredArtists) {
    await setShopCutRate({
      artistUserId: a.user._id,
      shopId: shop._id,
      percent: CONFIG.shopCutPercent,
      setByUserId: owner.user._id,
      effectiveFrom: historyStart,
      note: 'Opening rate.',
    });
  }
  // Mirrors what registerAccount now writes for real at signup - see that resolver's own comment
  // on why this has to be an explicit row rather than left to fall through to Shop.shopCutPercent
  // (set to a real 40% - CONFIG.shopCutPercent - on the Shop document itself, near the top of
  // this file - a fallback that would otherwise silently catch the owner too).
  await setShopCutRate({
    artistUserId: owner.user._id,
    shopId: shop._id,
    percent: 0,
    setByUserId: owner.user._id,
    effectiveFrom: historyStart,
    note: 'Shop owner - does not owe their own shop a cut.',
  });
  await setShopCutRate({
    artistUserId: artists.find((a) => a.key === 'artist2').user._id,
    shopId: shop._id,
    percent: 35,
    setByUserId: owner.user._id,
    effectiveFrom: daysAgo(45),
    note: 'Renegotiated after two years.',
  });
  await setShopCutRate({
    artistUserId: artists.find((a) => a.key === 'artist4').user._id,
    shopId: shop._id,
    percent: 45,
    setByUserId: owner.user._id,
    effectiveFrom: daysAgo(30),
    note: 'Moved to the front room.',
  });

  // The independent artist's own row, so both owner types exist in the data (M9). Disconnected for
  // the same reason as the shop's - see the note above.
  await new SquareAccount({
    ownerType: 'ARTIST',
    ownerId: independent.user._id,
    connected: false,
  }).save();

  // --- Clients ---------------------------------------------------------------------------------
  // Roughly two projects per client, so repeat business exists and a client detail page has more
  // than one thing on it.
  const totalSessions =
    artists.length * CONFIG.sessionsPerArtistPerWeek * (CONFIG.weeksOfHistory + CONFIG.weeksOfFuture);
  const avgSessionsPerProject = (CONFIG.sessionsPerProjectMin + CONFIG.sessionsPerProjectMax) / 2;
  const totalProjects = Math.round(totalSessions / avgSessionsPerProject);
  const totalClients = Math.round(totalProjects / 2);

  console.log(
    `Planning ~${totalProjects} projects and ~${totalSessions} sessions across ${totalClients} clients ...`,
  );

  const clients = [];
  for (let i = 0; i < totalClients; i++) {
    const n = uniqueName();
    const user = await new User({
      email: `client${n.tag}@example.dev`,
      password: hashedPassword,
      role: Constants.ROLES.CLIENT,
      userType: Constants.USER_TYPE.CLIENT,
      firstName: n.firstName,
      lastName: n.lastName,
      hasSetPassword: true,
    }).save();
    const client = await new Client({
      firstName: n.firstName,
      lastName: n.lastName,
      email: user.email,
      phone: `555-02${String(i).padStart(2, '0')}`,
      userId: user._id,
      // Shop-linked for most, but not all: a client of the independent artist has no shop, and
      // that is the harder case for every access check.
      shopIds: [],
      status: Constants.CLIENT_STATUS.ACTIVE,
    }).save();
    clients.push({ user, client });
  }

  // ---------------------------------------------------------------------------------------------
  // Projects, consults and sessions.
  //
  // Each project runs: a consult that takes a $100 deposit, then 2-3 sessions. The FIRST session
  // applies the deposit as a credit; the rest do not. Dates walk backwards from today so history
  // and future bookings both exist.
  // ---------------------------------------------------------------------------------------------
  const HOUR_CENTS = CONFIG.hourlyRateDollars * 100;
  let sessionsMade = 0;
  let consultsMade = 0;
  let projectsMade = 0;
  const noShowFlagged = [];

  // Where each artist's next appointment goes, walking forward from the start of history. Six
  // sessions a week is roughly one every 1.2 days of a working week; spacing is jittered so the
  // calendar does not look like a grid.
  const cursor = new Map(artists.map((a) => [a.key, CONFIG.weeksOfHistory * 7]));

  const perArtistProjects = Math.ceil(totalProjects / artists.length);

  for (const a of artists) {
    const isIndependent = Boolean(a.independent);
    const taxBp = isIndependent ? CONFIG.independentTaxBasisPoints : CONFIG.shopTaxBasisPoints;

    for (let p = 0; p < perArtistProjects; p++) {
      const c = pick(clients);
      if (!isIndependent && !c.client.shopIds.some((id) => String(id) === String(shop._id))) {
        c.client.shopIds.push(shop._id);
        await c.client.save();
      }

      const consultDaysAgo = cursor.get(a.key);
      if (consultDaysAgo < -CONFIG.weeksOfFuture * 7) {
        break;
      }

      // createdAt/updatedAt are required on this model rather than being Mongoose timestamps -
      // omitting them fails validation, which is the sort of thing a seed only finds by running.
      const conversation = await new Conversation({
        members: [String(a.user._id), String(c.user._id)].sort(),
        createdAt: daysAgo(consultDaysAgo + 7),
        updatedAt: daysAgo(consultDaysAgo + 7),
      }).save();
      const bookingRequest = await new BookingRequest({
        artistId: a.user._id,
        clientId: c.client._id,
        conversationId: conversation._id,
        guestToken: `seed-token-${a.key}-${p}`,
        firstName: c.client.firstName,
        lastName: c.client.lastName,
        email: c.client.email,
        phone: c.client.phone,
        description: 'Seeded booking request.',
        status: 'session_booked',
        createdAt: daysAgo(consultDaysAgo + 7),
        updatedAt: daysAgo(consultDaysAgo + 7),
      }).save();

      const project = await new Project({
        title: pick(PROJECT_TITLES),
        description: 'Seeded project.',
        placement: pick(PLACEMENTS),
        palette: pick(PALETTES),
        size: pick(['Small', 'Medium', 'Large']),
        artistId: a.user._id,
        clientId: c.client._id,
        status: 'in_progress',
        tags: chance(0.4) ? [pick(['cover-up', 'walk-in', 'referral', 'touch-up'])] : [],
        bookingRequestId: bookingRequest._id,
        createdAt: daysAgo(consultDaysAgo + 7),
        updatedAt: daysAgo(consultDaysAgo + 7),
      }).save();
      projectsMade += 1;

      // --- The consult, which takes the deposit ------------------------------------------------
      //
      // A DEPOSIT IS ITS OWN TRANSACTION AND IS TAXED (M11). Priced by the same function the charge
      // route uses, with the offset applied about half the time - it is offered, never automatic.
      const consultDate = daysAgo(consultDaysAgo);
      const consultIsPast = consultDate <= new Date();
      const depositTakesOffset = chance(0.5);
      const depositBreakdown = computeChargeBreakdown({
        subtotalCents: CONFIG.depositCents,
        hourlyRateCents: HOUR_CENTS,
        feeOffsetPerHourCents: CONFIG.feeOffsetCentsPerHour,
        taxRateBasisPoints: taxBp,
        applyFeeOffset: depositTakesOffset,
      });

      const consult = new Appointment({
        appointmentDate: consultDate,
        shopId: isIndependent ? undefined : shop._id,
        userId: a.user._id,
        bookingRequestId: bookingRequest._id,
        title: `Consult - ${c.client.firstName} ${c.client.lastName}`,
        appointmentType: 'consult',
        appointmentStatus: consultIsPast ? 'completed' : 'scheduled',
        durationMinutes: 30,
        // The deposit IS this appointment's transaction (M3): subtotal is the deposit, so the shop
        // takes its cut here and not again when the deposit is applied.
        depositCents: CONFIG.depositCents,
        depositStatus: consultIsPast ? 'available' : 'pending',
        depositCollectedAt: consultIsPast ? consultDate : undefined,
        depositPaymentMethod: 'square',
        depositSquarePaymentId: consultIsPast ? `seed-payment-${a.key}-${p}` : undefined,
        subtotalCents: CONFIG.depositCents,
        taxCents: depositBreakdown.taxCents,
        feeCents: depositBreakdown.feeOffsetCents,
        totalCents: depositBreakdown.amountDueCents,
        createdAt: daysAgo(consultDaysAgo + 1),
        updatedAt: daysAgo(consultDaysAgo + 1),
      });
      await applyShopCut(consult);
      await consult.save();
      consultsMade += 1;

      // --- Sessions ----------------------------------------------------------------------------
      const sessionCount = randInt(CONFIG.sessionsPerProjectMin, CONFIG.sessionsPerProjectMax);
      let depositSpent = !consultIsPast; // a pending deposit is not spendable
      let dayCursor = consultDaysAgo - randInt(5, 12);

      for (let s = 0; s < sessionCount; s++) {
        const hours = randInt(CONFIG.sessionHoursMin, CONFIG.sessionHoursMax);
        const subtotalCents = hours * HOUR_CENTS;
        const sessionDate = daysAgo(dayCursor);
        const isPast = sessionDate <= new Date();

        // A handful of sessions go wrong, because a system where nothing ever does is a system
        // whose failure paths are never looked at.
        let status = isPast ? 'completed' : 'scheduled';
        if (isPast && chance(0.04)) status = 'no_show';
        else if (isPast && chance(0.03)) status = 'cancelled';

        const applyDeposit = !depositSpent && isPast && status === 'completed';
        const takesOffset = chance(0.45);
        const tipCents = isPast && status === 'completed' && chance(0.55)
          ? pick([2000, 3000, 4000, 5000, 7500, 10000])
          : 0;

        const breakdown = computeChargeBreakdown({
          subtotalCents,
          hourlyRateCents: HOUR_CENTS,
          feeOffsetPerHourCents: CONFIG.feeOffsetCentsPerHour,
          taxRateBasisPoints: taxBp,
          applyFeeOffset: takesOffset,
          // The deposit comes off the SUBTOTAL before tax (M8), because it was taxed when it was
          // collected. computeChargeBreakdown is what enforces that - this only says whether one
          // is being applied.
          depositCreditCents: applyDeposit ? CONFIG.depositCents : 0,
          tipCents,
        });

        const appointment = new Appointment({
          appointmentDate: sessionDate,
          projectId: project._id,
          shopId: isIndependent ? undefined : shop._id,
          userId: a.user._id,
          title: `${project.title} - session ${s + 1}`,
          description: 'Seeded session.',
          appointmentType: 'session',
          appointmentStatus: status,
          durationMinutes: hours * 60,
          subtotalCents: status === 'completed' ? subtotalCents : 0,
          taxCents: status === 'completed' ? breakdown.taxCents : 0,
          feeCents: status === 'completed' ? breakdown.feeOffsetCents : 0,
          tipCents: status === 'completed' ? breakdown.tipCents : 0,
          totalCents: status === 'completed' ? breakdown.amountDueCents : 0,
          depositCreditCents: applyDeposit ? CONFIG.depositCents : 0,
          depositCreditFromAppointmentId: applyDeposit ? consult._id : undefined,
          squarePaymentId:
            status === 'completed' ? `seed-payment-${a.key}-${p}-${s}` : undefined,
          accumulatedSeconds: status === 'completed' ? hours * 3600 : 0,
          timerStatus: 'stopped',
          createdAt: daysAgo(dayCursor + 3),
          updatedAt: daysAgo(dayCursor + 3),
        });
        await applyShopCut(appointment);

        // The shop-cut lifecycle, spread across the statuses so the payout dashboard and the
        // confirmations queue both have rows. Only for completed, shop-affiliated work with a cut.
        if (!isIndependent && status === 'completed' && appointment.shopCutCents > 0) {
          const roll = rnd();
          if (roll < 0.45) {
            appointment.shopCutStatus = 'paid';
            appointment.shopCutPaymentMethod = 'manual';
            appointment.shopCutMarkedPaidBy = a.user._id;
            appointment.shopCutMarkedPaidAt = daysAgo(dayCursor - 2);
            appointment.shopCutConfirmedBy = owner.user._id;
            appointment.shopCutConfirmedAt = daysAgo(dayCursor - 1);
          } else if (roll < 0.6) {
            appointment.shopCutStatus = 'pending_confirmation';
            appointment.shopCutPaymentMethod = 'manual';
            appointment.shopCutMarkedPaidBy = a.user._id;
            appointment.shopCutMarkedPaidAt = daysAgo(dayCursor - 2);
          } else if (roll < 0.72) {
            appointment.shopCutStatus = 'invoice_sent';
            appointment.shopCutPaymentMethod = 'square_invoice';
            appointment.shopCutSquareInvoiceId = `seed-invoice-${a.key}-${p}-${s}`;
          }
          // the rest stay 'unpaid', which is what the payout dashboard is for
        }

        await appointment.save();
        sessionsMade += 1;

        if (applyDeposit) {
          depositSpent = true;
          consult.depositStatus = 'applied';
          consult.depositAppliedToAppointmentId = appointment._id;
          consult.depositAppliedAt = sessionDate;
          consult.depositAppliedBy = a.user._id;
          await consult.save();
        }

        // A no-show raises a flag, never deletes one (C2), with the denormalised counter on the
        // client that lets an appointment list render a badge without a join per row.
        if (status === 'no_show') {
          await new ClientFlag({
            clientId: c.client._id,
            typeKey: 'NO_SHOWED',
            appointmentId: appointment._id,
            shopId: isIndependent ? null : shop._id,
            createdByUserId: null,
            systemGenerated: true,
            note: '',
            createdAt: sessionDate,
          }).save();
          noShowFlagged.push(c.client._id);
        }

        dayCursor -= randInt(10, 24);
      }

      // Some projects are finished (P1: closed on zero open sessions).
      if (chance(0.35) && consultDaysAgo > 60) {
        project.status = 'completed';
        await project.save();
      }

      // A short thread per project, so the messenger has real conversations in it.
      const messageCount = randInt(2, 5);
      for (let m = 0; m < messageCount; m++) {
        const fromClient = m % 2 === 0;
        await new Message({
          conversationId: conversation._id,
          senderId: fromClient ? c.user._id : a.user._id,
          message: fromClient
            ? pick(['Can we shift by an hour?', 'Loved the last session!', 'Sending refs now.'])
            : pick(['Sounds good.', 'Booked you in.', 'Bring snacks, it is a long one.']),
          createdAt: daysAgo(consultDaysAgo - m),
          updatedAt: daysAgo(consultDaysAgo - m),
        }).save();
      }

      // Six sessions a week per artist, jittered.
      cursor.set(a.key, dayCursor - randInt(2, 6));
    }
  }

  // Denormalised flag counters (C2) - written once at the end rather than incrementally, since the
  // seed knows the totals and the read path only ever reads them.
  const flagCountsByClient = new Map();
  for (const clientId of noShowFlagged) {
    const key = String(clientId);
    flagCountsByClient.set(key, (flagCountsByClient.get(key) || 0) + 1);
  }
  for (const [clientId, count] of flagCountsByClient) {
    await Client.updateOne({ _id: clientId }, { $set: { flagCounts: { NO_SHOWED: count } } });
  }

  // A few hand-raised flags too, so the non-automatic path is represented.
  for (const c of clients.slice(0, 8)) {
    if (chance(0.5)) {
      await new ClientFlag({
        clientId: c.client._id,
        typeKey: pick(['CHRONIC_LATE', 'HAGGLES', 'GREAT_SITTER']),
        appointmentId: null,
        shopId: shop._id,
        createdByUserId: owner.user._id,
        systemGenerated: false,
        note: 'Noted at the desk.',
        createdAt: daysAgo(randInt(5, 60)),
      }).save();
    }
  }

  // A handful of archived records, so the archive filters have something to hide and reveal.
  for (const c of clients.slice(-6)) {
    c.client.status = Constants.CLIENT_STATUS.ARCHIVED;
    await c.client.save();
  }

  const counts = {
    shops: await Shop.countDocuments(),
    users: await User.countDocuments(),
    artists: await Artist.countDocuments(),
    clients: await Client.countDocuments(),
    projects: await Project.countDocuments(),
    consults: await Appointment.countDocuments({ appointmentType: 'consult' }),
    sessions: await Appointment.countDocuments({ appointmentType: 'session' }),
    unpaidCuts: await Appointment.countDocuments({ shopCutStatus: 'unpaid' }),
    pendingConfirmation: await Appointment.countDocuments({ shopCutStatus: 'pending_confirmation' }),
    flags: await ClientFlag.countDocuments(),
    rates: await ShopCutRate.countDocuments(),
    messages: await Message.countDocuments(),
  };

  console.log('\nSeeded:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }
  console.log(
    '\nSquare is NOT connected, for either owner - no seed can produce working credentials.' +
      '\nThe seeded appointments carry the money a real charge would have written, but taking a' +
      '\nNEW payment needs a real Square sandbox seller connected through Settings first.',
  );
  console.log(`\nEvery account's password is: ${DEV_PASSWORD}`);
  console.log('  owner/admin  shopadmin@copperwolf.dev');
  console.log('  artist       mika@copperwolf.dev');
  console.log('  independent  june@independent.dev');
  console.log('  front desk   frontdesk@copperwolf.dev');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
