import { useMemo } from "react";
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
 * WHAT IT DELIBERATELY DOES NOT CLAIM.
 *
 * Appointment has an appointmentDate and no duration (see server/models/Appointment.js), so a real
 * overlap - "this 3-hour session runs into that one" - IS NOT COMPUTABLE from the data we hold.
 * Anything claiming to detect one would be guessing at a length nobody entered.
 *
 * So the flag below says "close to this", with an explicit window, rather than "conflicts". That is
 * the honest strength of the claim, and it leaves the judgement with the artist, who knows how long
 * their own work takes. The real fix is a duration on Appointment; until that exists, this must not
 * pretend otherwise.
 */

// Two hours either side. Long enough to catch the realistic collision - a session booked at 1pm
// against another at 2pm - without flagging a morning consult when the evening is being booked.
const NEARBY_MS = 2 * 60 * 60 * 1000;

const DaySchedule = ({ artistUserId, date }) => {
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
    return [...items].sort(
      (a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate)
    );
  }, [data]);

  if (!dayKey || loading || appointments.length === 0) {
    // Nothing for a clear day. See the header - an empty state here would be printed under every
    // date field on every booking, and would train people to stop looking at this area entirely.
    return null;
  }

  const chosen = moment(date);
  return (
    <div className="daySchedule">
      <div className="dayScheduleHeader">
        {chosen.format("ddd D MMM")} — {appointments.length} already booked
      </div>
      <ul className="dayScheduleList">
        {appointments.map((appt) => {
          const at = moment(appt.appointmentDate);
          const nearby = Math.abs(at.diff(chosen)) <= NEARBY_MS;
          return (
            <li
              key={appt.id}
              className={nearby ? "dayScheduleItem dayScheduleItemNearby" : "dayScheduleItem"}
            >
              <span className="dayScheduleTime">{at.format("h:mm A")}</span>
              <AppointmentTypeChip type={appt.appointmentType} size="small" />
              <span className="dayScheduleTitle">
                {appt.project?.title || appt.title || "(untitled)"}
              </span>
              {nearby && (
                <span className="dayScheduleNearby" title="Within two hours of the time you picked">
                  close to this
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DaySchedule;
