/**
 * Backfills User.tagColor for every account that never got a real one.
 *
 * Why this exists on top of the two runtime self-heals (login() in graphql/resolvers/users.js,
 * and the User.tagColor field resolver in graphql/resolvers/index.js): both of those are lazy -
 * they only fix a user at the moment that user logs in, or at the moment someone happens to
 * render them. That leaves anyone who hasn't logged in and hasn't appeared on a calendar sitting
 * on a broken value indefinitely, and it means the very first shop calendar load after a deploy
 * pays for N shop-membership lookups inline. This fixes the whole collection in one pass, up
 * front, so the runtime paths become genuinely no-op.
 *
 * "Never got a real one" means one of the values in UNSET_TAG_COLORS (see utils/tag-color.js):
 * undefined, null, '', or a white that came from the old hardcoded Register.jsx default. A color
 * someone deliberately picked is never touched, even if it happens to collide with a shop-mate -
 * this is about repairing a bad default, not overriding people's choices.
 *
 * Colors are assigned one user at a time, sequentially and NOT in parallel, because
 * pickDefaultTagColor reads the colors currently in use at that user's shop to pick an unused
 * one. Running these concurrently would have every unset artist at the same shop read the same
 * "already taken" set and get handed the same color - the exact collision this is meant to avoid.
 *
 * Usage (from server/):
 *   node scripts/backfill-tag-colors.js            # apply
 *   node scripts/backfill-tag-colors.js --dry-run  # report only, write nothing
 *
 * Requires MONGODB in the environment, same as the app itself.
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const { isUnsetTagColor, pickDefaultTagColor } = require('../utils/tag-color');
const { getShopIdsForUser } = require('../utils/shop-membership');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('MONGODB is not set - export it before running this script.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected.${DRY_RUN ? ' DRY RUN - nothing will be written.' : ''}`);

  // Queried by hand rather than with a $in on UNSET_TAG_COLORS, because a Mongo $in can't express
  // "field is missing entirely" and "field is one of these values" as cleanly as the existing
  // isUnsetTagColor predicate already does in one place. Fetching the candidates broadly and
  // filtering in JS keeps a single definition of "unset" instead of a second one drifting here.
  const candidates = await User.find({
    $or: [
      { tagColor: { $exists: false } },
      { tagColor: null },
      { tagColor: { $in: ['', '#fff', '#ffffff', '#FFF', '#FFFFFF'] } },
    ],
  });

  const needsFix = candidates.filter((u) => isUnsetTagColor(u.tagColor));
  console.log(`${needsFix.length} user(s) need a tag color.`);

  let fixed = 0;
  for (const user of needsFix) {
    const shopIds = await getShopIdsForUser(user.id);
    const color = await pickDefaultTagColor(shopIds[0], user.id);
    console.log(
      `  ${user.username} (${user.userType}) ${user.tagColor ?? '<unset>'} -> ${color}`,
    );
    if (!DRY_RUN) {
      user.tagColor = color;
      await user.save();
      fixed += 1;
    }
  }

  console.log(DRY_RUN ? 'Dry run complete - no changes written.' : `Done. ${fixed} user(s) updated.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
