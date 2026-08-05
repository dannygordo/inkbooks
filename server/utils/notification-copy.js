const User = require('../models/User');

/**
 * Names for notification copy.
 *
 * Titles and bodies are rendered at WRITE time and stored as text (see models/Notification.js), so
 * a name looked up here is frozen into the row. That is deliberate - the notification records what
 * somebody was told - but it means the lookup has to be safe, because a throw here would take down
 * the mutation that was only trying to record a side effect.
 */

/**
 * A person's display name, or a neutral fallback.
 *
 * Never throws and never returns undefined. `${undefined} collected a deposit` renders the literal
 * word "undefined" into a stored notification, where it is permanent - the row is not re-rendered
 * later, so a bad name is a bad name forever. "Someone" is a worse notification; "undefined" is a
 * broken-looking product.
 */
async function actorName(userId) {
  if (!userId) return 'Someone';
  try {
    const user = await User.findById(userId).select('firstName lastName');
    if (!user) return 'Someone';
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return name || 'Someone';
  } catch {
    return 'Someone';
  }
}

module.exports = { actorName };
