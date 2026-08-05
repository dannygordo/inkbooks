const { Constants } = require('./constants');

/**
 * What somebody hears about, and where.
 *
 * Two rules do most of the work:
 *
 *   1. **In-app is never optional.** Only email can be switched off. The inbox is also the record -
 *      "did we tell the shop about that payment" has to stay answerable - and a preference that
 *      silently dropped rows would make it not. Muting is about what reaches you at work, not
 *      about erasing what happened.
 *
 *   2. **Absent means "the default for your role", not "off".** Defaults are computed here rather
 *      than written into every user at creation, so changing one later actually changes it for
 *      everybody instead of only for accounts made after the change. A user who has never touched
 *      settings should get today's sensible behaviour, not the behaviour that was sensible when
 *      they signed up.
 */

// Whether a category is emailed immediately, rolled into the daily digest, or not emailed at all.
// This is the "normal flow digests, exceptions interrupt" rule from NOTIFICATIONS_DESIGN.md §6,
// expressed as data rather than as branches at each emit site.
const IMMEDIATE = 'immediate';
const DIGEST = 'digest';
const OFF = 'off';

/**
 * Role-appropriate defaults.
 *
 * The shop admin's money default is DIGEST, not off and not immediate. A six-artist shop generates
 * 60-80 money events a week; individually that is unusable noise, and as one daily summary it is
 * the most useful thing the system produces. A solo artist generates a handful, so nothing needs
 * rolling up for them.
 *
 * Staff money is OFF - a front desk manages the schedule, not the books.
 */
function defaultsForRole(user) {
  const isShopAdmin = user.role <= Constants.ROLES.SHOP_ADMIN;
  const isStaff = user.role === Constants.ROLES.SHOP_STAFF;
  const isClient = user.role === Constants.ROLES.CLIENT;

  if (isClient) {
    // Clients get receipts and reminders. Their notifications are transactional and few, so
    // everything they do get is immediate; there is nothing to roll up.
    return { money: IMMEDIATE, schedule: IMMEDIATE, roster: OFF, message: IMMEDIATE };
  }
  if (isStaff) {
    return { money: OFF, schedule: IMMEDIATE, roster: OFF, message: IMMEDIATE };
  }
  if (isShopAdmin) {
    return { money: DIGEST, schedule: DIGEST, roster: IMMEDIATE, message: IMMEDIATE };
  }
  // Artists - shop-connected or solo. Low enough volume that everything can arrive as it happens.
  return { money: IMMEDIATE, schedule: IMMEDIATE, roster: IMMEDIATE, message: IMMEDIATE };
}

/**
 * How this category should reach this user by email: immediate, digest, or not at all.
 *
 * An explicit `false` in notificationPrefs always wins and always means OFF. An explicit `true`
 * means "email me", and the ROLE decides whether that is immediately or in the digest - somebody
 * turning money email on is asking to hear about money, not asking to be interrupted 80 times a
 * week. Leaving it alone means the role default.
 */
function emailModeFor(user, category) {
  const prefs = (user && user.notificationPrefs) || {};
  const key = `${category}Email`;
  const defaults = defaultsForRole(user);

  if (prefs[key] === false) {
    return OFF;
  }
  if (prefs[key] === true) {
    // On, at whatever cadence suits their role. A shop admin who enables money email gets the
    // digest, because 80 immediate emails a week is what they'd be asking for otherwise and is
    // not what they mean.
    return defaults[category] === OFF ? IMMEDIATE : defaults[category];
  }
  return defaults[category] || OFF;
}

/** Convenience: is this category emailed at all, by any cadence? */
function wantsEmail(user, category) {
  return emailModeFor(user, category) !== OFF;
}

/**
 * The digest hour and zone to use for somebody, with fallbacks.
 *
 * The chain is: what they set, then a sane default. `America/Los_Angeles` is the last resort so an
 * invited account that has never logged in - and therefore has no browser to have detected a zone
 * from - still has a valid boundary rather than a null one that would make every date computation
 * produce garbage.
 */
function digestTimingFor(user) {
  return {
    timezone: (user && user.timezone) || 'America/Los_Angeles',
    hour: Number.isInteger(user && user.digestHour) ? user.digestHour : 8,
  };
}

module.exports = {
  IMMEDIATE,
  DIGEST,
  OFF,
  defaultsForRole,
  emailModeFor,
  wantsEmail,
  digestTimingFor,
};
