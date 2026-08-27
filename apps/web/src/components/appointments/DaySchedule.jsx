// React imported explicitly: under Vitest, @vitejs/plugin-react compiles JSX with the CLASSIC
// runtime, so a component rendered by a test needs React in scope or it throws "React is not
// defined" - in that test's file, not this one. See vite.config.js and
// scripts/check-react-in-tested-components.mjs.
import React, { useMemo } from "react";
import moment from "moment";
import { AppointmentService } from "../../services/AppointmentService";
import AppointmentTypeChip from "./AppointmentTypeChip";
import "./daySchedule.css";

/**
 * What this artist already has booked on a given day.
 *
 * WHY THIS IS NOT A CALENDAR.
 *
 * The obvious version of "let the artist see their schedule while booking" is a mini month view
 * embedded in the form. It answers the wrong question. Nobody double-books a DAY - they double-book
 * two o'clock - and a month grid small enough to fit in a form cannot show times at all. It also
 * scales badly here: this form books several sittings at once, and confirming four dates on one
 * calendar means four navigations.
 *
 * The question actually being asked is "am I free then", about the date already chosen. So this
 * shows that day's bookings, with times, inline, and says nothing at all when the day is clear -
 * silence is the correct output for the common case, and a panel that renders "0 appointments"
 * every time is noise the eye learns to skip.
 *
 * WHAT IT CLAIMS, AND WHY IT CAN NOW.
 *
 * This used to say "close to this" against a hand-picked two-hour window, because Appointment held
 * only a point in time - a 3-hour session and a 20-minute touch-up were the same instant, so a real
 * overlap was not computable and anything stronger would have been a guess at a length nobody
 * entered.
 *
 * Appointment now carries durationMinutes, so "overlaps" is a fact: two half-open intervals
 * [start, start+duration) either intersect or they don't. The word on screen changed because the
 * data changed, not because the wording got braver.
 */

/**
 * Do two half-open intervals intersect?
 *
 * Half-open on purpose: an appointment ending at 3:00 and another starting at 3:00 do NOT overlap.
 * Treating the boundary as a clash would flag every back-to-back booking, which is the normal way
 * a working day is filled, and a warning that fires on the correct behaviour is one people learn
 * to click past.
 */
function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

const DaySchedule = ({ artistUserId, date, durationMinutes, excludeAppointmentId }) => {
  // Half-open [startOfDay, nextDay), the same convention the calendar and the server's analytics
  // use. Memoised on the DAY, not on the moment: the picker fires on every keystroke of the time
  // field, and keying the range on the raw value would refetch on each one.
  const dayKey = date && moment(date).isValid() ? moment(date).format("YYYY-MM-DD") : null;
  const range = useMemo(() => {
    if (!dayKey) {
      return null;
    }
    const start = moment(dayKey, "YYYY-MM-DD").startOf("day");
    return {
      from: start.toISOString(),
      to: start.clone().add(1, "day").toISOString(),
    };
  }, [dayKey]);

  const { data, loading } = AppointmentService.getAppointmentsByArtistForCalendar(
    artistUserId,
    range
  );

  const appointments = useMemo(() => {
    const items = data?.getAppointmentsByArtist?.items || [];
    return items
      // When EDITING, the appointment being moved is on this day too - and it overlaps itself
      // perfectly. Without this, every edit opens showing a conflict against the thing you are
      // editing, which is both useless and the fastest way to teach someone to ignore the warning.
      .filter((appt) => !excludeAppointmentId || String(appt.id) !== String(excludeAppointmentId))
      .slice()
      .sort((a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate));
  }, [data, excludeAppointmentId]);

  if (!dayKey || loading || appointments.length === 0) {
    // Nothing for a clear day. See the header - an empty state here would be printed under every
    // date field on every booking, and would train people to stop looking at this area entirely.
    return null;
  }

  const chosenStart = moment(date).valueOf();
  const chosenEnd = chosenStart + (durationMinutes || 0) * 60 * 1000;

  const rows = appointments.map((appt) => {
    const start = moment(appt.appointmentDate);
    const end = moment(appt.appointmentEnd || appt.appointmentDate);
    return {
      appt,
      start,
      end,
      // Only meaningful once we know how long the NEW appointment is. Without a duration for it
      // there is no interval to intersect, so this shows the day and claims nothing.
      clashes:
        durationMinutes > 0 &&
        overlaps(chosenStart, chosenEnd, start.valueOf(), end.valueOf()),
    };
  });
  const clashCount = rows.filter((r) => r.clashes).length;

  return (
    <div className={clashCount > 0 ? "daySchedule dayScheduleClashing" : "daySchedule"}>
      <div className="dayScheduleHeader">
        {moment(date).format("ddd D MMM")} — {appointments.length} already booked
        {clashCount > 0 && (
          <span className="dayScheduleClashSummary">
            {clashCount} {clashCount === 1 ? "conflict" : "conflicts"}
          </span>
        )}
      </div>
      <ul className="dayScheduleList">
        {rows.map(({ appt, start, end, clashes }) => (
          <li
            key={appt.id}
            className={clashes ? "dayScheduleItem dayScheduleItemClash" : "dayScheduleItem"}
          >
            {/* Both ends now, not just the start. The start alone was never enough to judge a
                clash by eye, which is most of why this needed a duration at all. */}
            <span className="dayScheduleTime">
              {start.format("h:mm A")} – {end.format("h:mm A")}
            </span>
            <AppointmentTypeChip type={appt.appointmentType} size="small" />
            <span className="dayScheduleTitle">
              {appt.project?.title || appt.title || "(untitled)"}
            </span>
            {clashes && (
              <span className="dayScheduleClash" title="Overlaps the session you are booking">
                overlaps
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DaySchedule;
