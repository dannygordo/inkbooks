import { MenuItem, TextField } from "@mui/material";
import "./durationPicker.css";

/**
 * How long an appointment runs: an HOURS field and a MINUTES field.
 *
 * This was a single select of preset lengths. The presets were labelled in hours ("4 hr", "1 hr
 * 30") so nobody was doing arithmetic - but a fixed list is a guess at every length a shop will
 * ever book, and being wrong about that means an artist cannot enter the appointment they actually
 * have. Two fields cost one extra control and remove the ceiling entirely.
 *
 * WHY NOT A FROM/TO PAIR. It was the other option on the table, and it loses something: an end
 * time silently changes meaning when the start moves. Drag a booking an hour later and a stored
 * end makes it an hour shorter, while a duration survives intact. A duration is also what people
 * decide first - "this is a four hour sitting" is true before the day is picked. The model stores
 * minutes for the same reason (see server/models/Appointment.js) and the end is derived.
 *
 * MINUTES ARE THE STORAGE UNIT, HOURS AND MINUTES ARE THE INTERFACE. The split happens here and
 * nowhere else, so no caller ever has to do the multiplication - which is exactly where a 4.5-hour
 * sitting becomes a 4-minute one.
 */

// Quarter hours. A tattoo booking is not accurate to the minute, and offering that precision
// invites false precision downstream - "these overlap by four minutes" is not a problem anyone
// has. The hours field is a free number, so any total is still reachable.
const MINUTE_STEPS = [0, 15, 30, 45];

// Mirrors server/models/Appointment.js's DEFAULT_DURATION_MINUTES. Duplicated across the boundary
// rather than fetched, because a form needs a value before it can talk to anything - but the SERVER
// is the authority: omitting durationMinutes entirely still gets the right default, so the two
// drifting shows up as a mildly stale pre-selection rather than as wrong data.
export const CONSULT_DEFAULT_MINUTES = 45;
export const SESSION_DEFAULT_MINUTES = 180;

/** A human label for a stored minute count - "4 hr 30", "45 min". */
export function describeDuration(minutes) {
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

const DurationPicker = ({ value, onChange, size = "small" }) => {
  const totalMinutes = value || 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Both halves recombine here, so a caller only ever sees a total. Guarded against NaN because an
  // emptied number input reports "" - Number("") is 0, but Number("abc") is NaN, and a NaN total
  // would sail through as a real value and land in the database.
  const emit = (nextHours, nextMinutes) => {
    const h = Number.isFinite(nextHours) ? Math.max(0, nextHours) : 0;
    const m = Number.isFinite(nextMinutes) ? Math.max(0, nextMinutes) : 0;
    onChange(h * 60 + m);
  };

  // A stored value off the quarter-hour - a seed, a script, a shop that used to allow anything -
  // gets its own option rather than rendering blank, which would read as "no length set" and
  // invite someone to overwrite a deliberate value.
  const minuteOptions = MINUTE_STEPS.includes(minutes)
    ? MINUTE_STEPS
    : [...MINUTE_STEPS, minutes].sort((a, b) => a - b);

  return (
    <div className="durationPicker">
      <TextField
        type="number"
        size={size}
        label="Hours"
        value={hours}
        onChange={(e) => emit(parseInt(e.target.value, 10), minutes)}
        // No upper bound in the UI beyond the server's own 24-hour ceiling (validation.js) - a
        // long sitting is a real thing and this should not be the component that decides how long
        // is too long.
        inputProps={{ min: 0, max: 23, step: 1 }}
        sx={{ width: 86 }}
      />
      <TextField
        select
        size={size}
        label="Minutes"
        value={minutes}
        onChange={(e) => emit(hours, Number(e.target.value))}
        sx={{ width: 96 }}
      >
        {minuteOptions.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    </div>
  );
};

export default DurationPicker;
