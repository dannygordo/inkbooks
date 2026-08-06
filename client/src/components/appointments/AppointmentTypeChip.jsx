// React imported explicitly: under Vitest, @vitejs/plugin-react compiles JSX with the CLASSIC
// runtime, so a component rendered by a test needs React in scope or it throws "React is not
// defined" - in that test's file, not this one. See vite.config.js and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { appointmentTypeStyle, appointmentTypeLabel } from "../../utils/appointmentType";
import "./appointmentTypeChip.css";

/**
 * "Consult" or "Session" as a colour-coded chip.
 *
 * A component rather than a CSS class per type, so the colour and the label are chosen in the same
 * place. The alternative - a `.chipConsult` class each caller remembers to apply - is one edit away
 * from a chip labelled Consult in session colours, and nothing would catch that.
 */
const AppointmentTypeChip = ({ type, size = "medium" }) => {
  if (!type) {
    return null;
  }
  const { background, text, border } = appointmentTypeStyle(type);
  return (
    <span
      className={`appointmentTypeChip${size === "small" ? " appointmentTypeChipSmall" : ""}`}
      style={{ backgroundColor: background, color: text, borderColor: border }}
    >
      {appointmentTypeLabel(type)}
    </span>
  );
};

export default AppointmentTypeChip;
