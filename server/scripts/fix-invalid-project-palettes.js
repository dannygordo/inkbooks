// One-off repair for projects seeded with a display-label palette ('Black and grey', 'Full
// colour', 'Blackwork', 'Muted colour') instead of the real ProjectInput enum value ('black' /
// 'color') - a bug that lived in seed-large.js's PALETTES array (now fixed there) but already
// wrote bad data into any database seeded before that fix.
//
// Why this needs fixing rather than just re-seeding: server/utils/validation.js's
// updateProjectInputSchema enforces palette as z.enum(['black', 'color']).nullish(), but
// Mongoose's own schema (models/Project.js) has no such constraint, so a bad value like
// 'Blackwork' saves silently at seed time. The problem shows up later: every updateProject call
// echoes the project's CURRENT palette value back as part of its payload (see
// pages/projects/Project.jsx and IBProgressListProject.jsx - neither send a palette change, they
// just pass through what's already there), and zod rejects it. That means a project seeded with
// one of these labels can never be saved again through ANY field - not just palette - since the
// invalid value it keeps echoing back fails validation before anything else about the request is
// even looked at. This surfaced as a "Invalid option: expected one of black|color" error on a
// reference image upload, which had nothing to do with the image itself.
//
// This only touches Project.palette. It does not wipe or reseed anything else.
//
// Usage (from server/):
//   node scripts/fix-invalid-project-palettes.js
//   node scripts/fix-invalid-project-palettes.js --dry-run   (report only, writes nothing)

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env.development') });

const mongoose = require('mongoose');
const Project = require('../models/Project');

const mongoUri = (process.env.MONGODB || '').replace(/,\s*$/, '');
if (!mongoUri) {
  throw new Error('MONGODB environment variable is not set - check server/.env.development.');
}
// Same guard as seed.js/seed-large.js - this script writes to the database, so refuse to run
// against anything that doesn't look like a local Mongo instance.
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(mongoUri)) {
  throw new Error(
    `Refusing to run: MONGODB (${mongoUri.replace(/\/\/.*@/, '//***@')}) doesn't look like a ` +
      'local database. Only run this against mongodb://localhost:27017/... .'
  );
}

const VALID_PALETTES = new Set(['black', 'color']);

// Known legacy display labels mapped to the real enum value they were standing in for. Anything
// not in this map (a typo, a future label nobody's accounted for) gets nulled out rather than
// guessed at - null is a legal, already-supported "no palette chosen" state (see
// IBProjectPalettesSelect.jsx), and guessing wrong would silently mislabel a real project.
const LEGACY_LABEL_MAP = {
  'Black and grey': 'black',
  Blackwork: 'black',
  'Full colour': 'color',
  'Full color': 'color',
  'Muted colour': 'color',
  'Muted color': 'color',
};

async function run() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`Connecting to ${mongoUri} ...`);
  await mongoose.connect(mongoUri);

  const projects = await Project.find({}).select('_id title palette');
  const bad = projects.filter((p) => p.palette != null && !VALID_PALETTES.has(p.palette));

  if (bad.length === 0) {
    console.log('No projects with an invalid palette value found. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${bad.length} project(s) with an invalid palette value:`);
  for (const project of bad) {
    const mapped = LEGACY_LABEL_MAP[project.palette] ?? null;
    console.log(
      `  ${project._id}  "${project.title}"  palette: ${JSON.stringify(project.palette)} -> ${JSON.stringify(mapped)}`
    );
    if (!dryRun) {
      await Project.updateOne({ _id: project._id }, { $set: { palette: mapped } });
    }
  }

  if (dryRun) {
    console.log('\n--dry-run: no changes written.');
  } else {
    console.log(`\nUpdated ${bad.length} project(s).`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
