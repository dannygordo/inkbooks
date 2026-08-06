/**
 * What a consult and a session look like, defined once.
 *
 * These two words appear on the dashboard lists, the calendar, the project page and the
 * appointments list. If each surface picks its own colour they drift, and the cost is specific:
 * colour is a shortcut people learn once and then stop reading the label for. A teal consult on
 * one screen and an amber consult on the next teaches nothing, and worse, it teaches something
 * wrong for the length of time it takes to notice.
 *
 * CHOOSING THE COLOURS
 *
 * Not red/green. Those read as bad/good, and neither a consult nor a session is a status - they're
 * kinds of work. Red also collides with the unread badges and error text already on these screens,
 * which is where an urgent colour should stay.
 *
 * Indigo for a session and amber for a consult, because:
 *   - They differ in HUE and in LIGHTNESS, so they stay distinguishable in greyscale and for the
 *     ~8% of men with red-green colour blindness. Two colours that only differ in hue fail both.
 *   - Both are muted rather than saturated. These chips sit in a list next to money figures; a
 *     bright chip would out-shout the number that actually matters.
 *   - The tinted-background/dark-text pairing keeps text contrast above 4.5:1 (WCAG AA) instead of
 *     relying on white-on-mid-tone, which fails at small sizes.
 *
 * Session is the heavier colour on purpose: it's the appointment with money attached.
 */
export const APPOINTMENT_TYPE_STYLES = {
  consult: {
    label: "Consult",
    background: "#fdf0d5",
    text: "#8a5a00",
    border: "#f0d9a8",
  },
  session: {
    label: "Session",
    background: "#e6e8f7",
    text: "#3b3f8f",
    border: "#c9cdf0",
  },
};

// Anything unrecognised, so a new appointment type renders as itself in grey rather than as an
// invisible chip or a crash. Deliberately neutral: an unknown thing should not borrow the meaning
// of a known one.
const FALLBACK = {
  background: "#eeeeee",
  text: "#555555",
  border: "#dddddd",
};

/** The chip styling for an appointment type, never undefined. */
export function appointmentTypeStyle(type) {
  return APPOINTMENT_TYPE_STYLES[type] || FALLBACK;
}

/** "consult" -> "Consult". Falls back to the raw value rather than to an empty chip. */
export function appointmentTypeLabel(type) {
  const known = APPOINTMENT_TYPE_STYLES[type];
  if (known) {
    return known.label;
  }
  if (!type) {
    return "";
  }
  return String(type).charAt(0).toUpperCase() + String(type).slice(1);
}
