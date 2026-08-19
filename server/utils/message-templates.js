/**
 * {{mergeField}} substitution, shared by every feature that renders an outbound client message
 * from an owner-editable template - appointment reminders (utils/reminders.js) and Auto-Responses
 * (utils/auto-responses.js) as of this file's creation.
 *
 * Extracted out of utils/reminders.js unchanged, the moment a second feature needed the exact
 * same substitution - matching this codebase's own extraction convention (utils/money.js,
 * utils/shop-cut.js: pull a helper out once two callers need it verbatim, not preemptively).
 * utils/reminders.js re-exports this for backward compatibility rather than every existing call
 * site needing to change its import.
 *
 * Deliberately not a templating engine - a fixed, small set of known fields, no loops or
 * conditionals, so a regex swap is the whole implementation rather than a dependency and an
 * injection surface for something an artist types into a settings box.
 */
function renderTemplate(template, vars) {
  return String(template || '').replace(/{{\s*(\w+)\s*}}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

module.exports = { renderTemplate };
