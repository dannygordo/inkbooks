import { MenuItem, TextField } from "@mui/material";

/**
 * How long an appointment runs.
 *
 * A SELECT OF REALISTIC LENGTHS, not a free number field. Two reasons:
 *
 * People do not think in minutes, they think in "an hour" or "the afternoon", and a bare number
 * input asks them to convert - which is exactly where someone types 3 meaning three hours and books
 * a three-minute session. The options carry their own units and that mistake becomes unavailable.
 *
 * It also keeps the values coarse on purpose. A tattoo booking is not accurate to the minute, and
 * offering that precision invites false precision in the conflict checker downstream - "these
 * overlap by four minutes" is not a real problem anyone has.
 *
 * "Other" is deliberately absent for now. If a shop genuinely needs 7 hours 20, that is worth
 * hearing about rather than guessing at, and the field accepts any integer server-side
 * (validation.js) so nothing here is a hard ceiling on the data.
 */

// Fifteen-minute steps up to two hours, then half-hours. Follows how the lengths actually cluster:
// consults vary in quarters of an hour, sittings in halves, and nobody books six hours and fifteen.
export const DURATION_OPTIONS = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1 hr" },
  { minutes: 90, label: "1 hr 30" },
  { minutes: 120, label: "2 hr" },
  { minutes: 180, label: "3 hr" },
  { minutes: 240, label: "4 hr" },
  { minutes: 300, label: "5 hr" },
  { minutes: 360, label: "6 hr" },
  { minutes: 480, label: "8 hr" },
];

// Mirrors server/models/Appointment.js's DEFAULT_DURATION_MINUTES. Duplicated across the boundary
// rather than fetched, because a form needs a value before it can talk to anything - but the SERVER
// is the authority: omitting durationMinutes entirely still gets the right default, so the two
// drifting shows up as a mildly stale pre-selection rather than as wrong data.
export const CONSULT_DEFAULT_MINUTES = 45;
export const SESSION_DEFAULT_MINUTES = 180;

/** A human label for a stored minute count, falling back gracefully to a raw value. */
export function describeDuration(minutes) {
  const known = DURATION_OPTIONS.find((o) => o.minutes === minutes);
  if (known) {
    return known.label;
  }
  if (!minutes) {
    return "";
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) {
    return `${rest} min`;
  }
  return rest ? `${hours} hr ${rest}` : `${hours} hr`;
}

const DurationPicker = ({ value, onChange, label = "Length", size = "small" }) => {
  // A stored value outside the list - set by a script, a seed, or a future free-text field - gets
  // its own option rather than silently rendering as blank, which would read as "no length set"
  // and invite someone to overwrite a deliberate value.
  const options = DURATION_OPTIONS.some((o) => o.minutes === value)
    ? DURATION_OPTIONS
    : [...DURATION_OPTIONS, { minutes: value, label: describeDuration(value) }].sort(
        (a, b) => a.minutes - b.minutes
      );

  return (
    <TextField
      select
      size={size}
      label={label}
      value={value || ""}
      onChange={(e) => onChange(Number(e.target.value))}
      sx={{ minWidth: 120 }}
    >
      {options.map((option) => (
        <MenuItem key={option.minutes} value={option.minutes}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
};

export default DurationPicker;
