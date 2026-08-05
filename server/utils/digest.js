const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendEmail } = require('./email');
const { digestTimingFor } = require('./notification-preferences');
const { formatCents } = require('./money');

/**
 * The daily digest.
 *
 * Everything a recipient's preferences routed to 'digest' rather than to its own email, rolled into
 * one message at the local hour they chose.
 *
 * The whole reason this exists: a six-artist shop generates 60-80 money and schedule events a week.
 * Individually that is unusable noise and gets filtered to a folder; as one daily summary it is the
 * most useful thing the system produces. Exceptions - a failed payment, an expired Square token -
 * never come through here, because those are IMMEDIATE by category and interrupt on purpose.
 */

/**
 * What hour is it right now for this person?
 *
 * Uses Intl rather than arithmetic on offsets. An offset is wrong twice a year, and the failure is
 * a digest arriving an hour late every March - which nobody reports and everybody notices. Node
 * ships full tz data, so the zone name is enough.
 *
 * An unrecognised zone falls back rather than throwing. A digest that never sends because somebody
 * has a typo in a settings field would be a silent failure of exactly the kind this system exists
 * to catch, and it would be self-inflicted.
 */
function localHour(timezone, at = new Date()) {
  try {
    return Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }).format(at),
    );
  } catch {
    return at.getUTCHours();
  }
}

/** The local calendar date for somebody, as YYYY-MM-DD - the digest's idempotency key. */
function localDateKey(timezone, at = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/**
 * Renders the digest body. Grouped by category, because "here is your money, here is your
 * schedule" is how somebody reads a summary - a flat chronological list of 40 lines is the noise
 * this was supposed to replace.
 */
function renderDigest(notifications) {
  const byCategory = new Map();
  for (const n of notifications) {
    if (!byCategory.has(n.category)) byCategory.set(n.category, []);
    byCategory.get(n.category).push(n);
  }

  const labels = { money: 'Money', schedule: 'Schedule', roster: 'Your team', message: 'Messages' };
  const sections = [];
  const textSections = [];

  for (const [category, rows] of byCategory) {
    const label = labels[category] || category;
    // Money gets a total, because the single most useful number in a shop's daily summary is how
    // much came in - and making somebody add up nine lines to find it defeats the point.
    const total = rows.reduce((sum, r) => sum + (r.amountCents || 0), 0);
    const heading = category === 'money' && total > 0 ? `${label} — ${formatCents(total)}` : label;

    sections.push(
      `<h3>${heading}</h3><ul>${rows
        .map((r) => `<li>${r.title}${r.body ? ` — ${r.body}` : ''}</li>`)
        .join('')}</ul>`,
    );
    textSections.push(
      `${heading}\n${rows.map((r) => `  - ${r.title}${r.body ? ` — ${r.body}` : ''}`).join('\n')}`,
    );
  }

  return { html: sections.join(''), text: textSections.join('\n\n') };
}

/**
 * Sends digests to everybody for whom it is currently their chosen hour.
 *
 * Idempotent through the notifications themselves: rows are flipped from 'digest' to 'sent' as part
 * of sending, so a second run in the same hour finds nothing to send. No separate "last digest
 * sent" field - that would be a second record of a fact the rows already carry, and it could
 * disagree with them.
 *
 * The scheduler's lock stops two INSTANCES racing; this stops the same instance sending twice
 * within an hour. Different problems, both real.
 */
async function sendDailyDigests({ now = new Date(), send = sendEmail } = {}) {
  // Only people who actually have something waiting. Scanning every user hourly would be a table
  // scan on the largest collection to find, almost always, nobody.
  const pendingUserIds = await Notification.distinct('userId', { emailStatus: 'digest' });
  if (pendingUserIds.length === 0) {
    return { sent: 0, considered: 0 };
  }

  const users = await User.find({ _id: { $in: pendingUserIds } }).select(
    'email firstName timezone digestHour',
  );

  let sent = 0;
  let considered = 0;

  for (const user of users) {
    const { timezone, hour } = digestTimingFor(user);
    if (localHour(timezone, now) !== hour) {
      continue;
    }
    considered += 1;

    const rows = await Notification.find({ userId: user._id, emailStatus: 'digest' }).sort({
      createdAt: 1,
    });
    if (rows.length === 0) continue;

    const ids = rows.map((r) => r._id);

    // Claimed BEFORE sending, same as the immediate sweep and for the same reason: a crash after
    // sending but before recording would send the whole digest again next hour.
    const claimed = await Notification.updateMany(
      { _id: { $in: ids }, emailStatus: 'digest' },
      { $set: { emailStatus: 'sent' } },
    );
    if (claimed.modifiedCount === 0) continue;

    try {
      if (!user.email) {
        await Notification.updateMany(
          { _id: { $in: ids } },
          { $set: { emailStatus: 'skipped', emailError: 'no email address' } },
        );
        continue;
      }

      const { html, text } = renderDigest(rows);
      const dateKey = localDateKey(timezone, now);
      const result = await send({
        to: user.email,
        subject: `Your InkBooks summary — ${dateKey}`,
        htmlBody: `<p>Hi ${user.firstName},</p><p>Here is what happened.</p>${html}`,
        textBody: `Hi ${user.firstName},\n\nHere is what happened.\n\n${text}`,
      });

      // Rolled back to 'skipped' when the provider returns nothing - not configured, or rejected.
      // Leaving them 'sent' would claim a digest went out that didn't, and in a dev environment
      // with no mail set up that would be every digest.
      if (!result) {
        await Notification.updateMany(
          { _id: { $in: ids } },
          {
            $set: {
              emailStatus: 'skipped',
              emailError: 'no result from the mail provider - not configured, or rejected',
            },
          },
        );
        continue;
      }
      sent += 1;
    } catch (err) {
      await Notification.updateMany(
        { _id: { $in: ids } },
        { $set: { emailStatus: 'failed', emailError: err.message } },
      );
    }
  }

  return { sent, considered };
}

module.exports = { sendDailyDigests, renderDigest, localHour, localDateKey };
