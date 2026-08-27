/**
 * What the signup wizard asks, and what each answer actually does.
 *
 * SEPARATE FROM THE COMPONENT ON PURPOSE. The wording is the substance of this screen - somebody
 * is being asked to make six decisions about a tool they have used for ninety seconds, and the
 * explanation is what makes that possible. Keeping the copy here means it can be read, reviewed
 * and changed without touching layout code, and it makes it obvious at a glance when a setting has
 * been added with no explanation attached.
 *
 * EVERY SETTING HERE IS OPTIONAL AND CHANGEABLE LATER. That is a design rule, not a coincidence:
 * an onboarding wizard that can be abandoned is a wizard people will actually finish, and one that
 * traps somebody on step four because they don't know their shop cut yet is one they close. The
 * account is created at the END of step two and every later step saves independently - see
 * Register.jsx.
 */

/** Which shops/artists exist, and what each account type gets. */
export const ACCOUNT_TYPES = [
  {
    value: "shop",
    title: "I run a shop",
    // Says what the account LETS YOU DO rather than what it is called. "Shop account" tells
    // somebody nothing about whether it's the right one for them.
    blurb:
      "Manage your artists, the shop calendar and the books - and take your own bookings too. Most shop owners tattoo, so you get an artist profile on the same login.",
  },
  {
    value: "artist",
    title: "I'm an independent artist",
    blurb:
      "Your own calendar, clients, projects and booking page. You can join a shop later without making a new account.",
  },
];

/**
 * Notification categories, in the order they matter to a new account.
 *
 * The `what` line names the events, not the category. "Money notifications" is a label; "a deposit
 * taken, a session charged" is the thing somebody can actually decide about.
 */
export const NOTIFICATION_CATEGORIES = [
  {
    key: "moneyEmail",
    label: "Money",
    what: "A deposit taken, a session charged, a shop cut paid.",
    // Named because the defaults genuinely differ by role and an unexplained toggle that starts in
    // different positions for different people reads as a bug.
    shopDefault: "Daily summary",
    artistDefault: "Straight away",
  },
  {
    key: "scheduleEmail",
    label: "Schedule",
    what: "A booking request, a consult booked, an appointment cancelled.",
    shopDefault: "Daily summary",
    artistDefault: "Straight away",
  },
  {
    key: "rosterEmail",
    label: "Roster",
    what: "An artist joining or leaving your shop.",
    shopDefault: "Straight away",
    artistDefault: "Off",
  },
  {
    key: "messageEmail",
    label: "Messages",
    what: "A client replying to you.",
    shopDefault: "Straight away",
    artistDefault: "Straight away",
  },
];

/** Hourly vs flat, explained in terms of how a shop actually quotes work. */
export const BILLING_TYPES = [
  {
    value: "hourly",
    label: "By the hour",
    what: "You quote a rate per hour and the session total follows the time worked.",
  },
  {
    value: "flat",
    label: "A flat price per session",
    what: "You agree a price for the piece up front, regardless of how long the sitting runs.",
  },
];

/**
 * The explanation shown under each field.
 *
 * Written to answer "why are you asking me this", which is the question somebody actually has -
 * not "what format should this be in", which the field itself should make obvious.
 */
export const FIELD_HELP = {
  shopName: "The name clients see on your booking page and in emails from you.",
  bookingSlug:
    "The link you hand out - on a card, in a bio, in a DM. Clients use it to send you a booking request without needing an account.",
  timezone:
    "Used for your daily summary email and for anything that has to happen at a particular hour where you are. We have guessed from your browser.",
  digestHour:
    "When your daily summary arrives, in your own time. Pick a time you actually read email - first thing, or after the shop closes.",
  hourlyRate: "Your default rate. You can still change the price on any individual session.",
  flatRate: "Your default price per sitting. You can still change it on any individual session.",
  shopCutPercent:
    "The shop's percentage of an artist's session work. Applied to the work itself - never to tips, tax or card fees. Set it to 0 if you don't take a cut.",
  shopMinimum: "The smallest amount your shop will book work for. Shown to artists as guidance.",
};

/**
 * Timezone choices.
 *
 * IANA names, never fixed offsets - an offset is wrong for half the year and this feeds the digest
 * scheduler, which has to know about DST (see server/utils/digest.js). The browser's own guess is
 * added at the top of the list at runtime, so the common case is already selected.
 */
export const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Madrid",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

/** The browser's own zone, first, deduplicated. Falls back cleanly where Intl is unavailable. */
export function timezoneOptions() {
  let guess = null;
  try {
    guess = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    guess = null;
  }
  if (!guess) {
    return COMMON_TIMEZONES;
  }
  return [guess, ...COMMON_TIMEZONES.filter((zone) => zone !== guess)];
}

/** "8:00 AM" style labels for the digest hour, 0-23. */
export function digestHourOptions() {
  return Array.from({ length: 24 }, (_, hour) => {
    const suffix = hour < 12 ? "AM" : "PM";
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return { value: hour, label: `${display}:00 ${suffix}` };
  });
}
