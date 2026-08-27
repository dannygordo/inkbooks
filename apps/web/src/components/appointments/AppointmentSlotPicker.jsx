// React imported explicitly: under Vitest, @vitejs/plugin-react compiles JSX with the CLASSIC
// runtime, so a component rendered by a test needs React in scope or it throws "React is not
// defined" - in that test's file, not this one. See vite.config.js and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import IBDateTimePicker from "../inputs/IBDateTimePicker";
import DurationPicker from "./DurationPicker";
import DaySchedule from "./DaySchedule";
import "./appointmentSlotPicker.css";

/**
 * When an appointment is, how long it runs, and what it collides with.
 *
 * ONE COMPONENT FOR ALL FOUR BOOKING SURFACES - the calendar wizard (consult, session, other), the
 * calendar's edit dialog, a project's "add session" form, and the booking-request conversion form.
 *
 * They were four separate date fields. The conflict check and the duration input got built for one
 * of them, which meant an artist booking from the project page could see their day and an artist
 * booking the same session from the calendar could not - the same decision, made blind or informed
 * depending on which screen they happened to start from. That is exactly the kind of inconsistency
 * that makes people distrust a tool: it is not wrong anywhere, it is just absent in three places
 * out of four.
 *
 * Bundling the three controls also keeps them honest with each other. The schedule below can only
 * compute an overlap if it knows the length of what is being booked, so a surface that has a date
 * picker but no duration picker cannot show conflicts at all - and separate components make that an
 * easy thing to forget at a call site.
 */
const AppointmentSlotPicker = ({
  label = "Date & time",
  date,
  onDateChange,
  durationMinutes,
  onDurationChange,
  artistUserId,
  // The appointment being EDITED, so the day's schedule doesn't list it and then flag it as
  // clashing with itself. Absent when creating - there is nothing to exclude yet.
  excludeAppointmentId,
}) => (
  <div className="appointmentSlotPicker">
    <div className="appointmentSlotPickerRow">
      <IBDateTimePicker label={label} val={date} setVal={onDateChange} />
      <DurationPicker value={durationMinutes} onChange={onDurationChange} />
    </div>
    <DaySchedule
      artistUserId={artistUserId}
      date={date}
      durationMinutes={durationMinutes}
      excludeAppointmentId={excludeAppointmentId}
    />
  </div>
);

export default AppointmentSlotPicker;
