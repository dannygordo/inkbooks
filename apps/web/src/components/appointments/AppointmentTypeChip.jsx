// React imported explicitly: under Vitest, @vitejs/plugin-react compiles JSX with the CLASSIC
// runtime, so a component rendered by a test needs React in scope or it throws "React is not
// defined" - in that test's file, not this one. See vite.config.js and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { appointmentTypeStyle, appointmentTypeLabel } from "../../utils/appointmentType";
import { resolveTagColor } from "../../utils/tagColor";
import "./appointmentTypeChip.css";

/**
 * "Consult" or "Session" as a colour-coded chip.
 *
 * A component rather than a CSS class per type, so the colour and the label are chosen in the same
 * place. The alternative - a `.chipConsult` class each caller remembers to apply - is one edit away
 * from a chip labelled Consult in session colours, and nothing would catch that.
 *
 * `personal` swaps the whole treatment, colour AND label: instead of the type's own consult/session
 * palette and its "Consult"/"Session" text, the chip reads "Personal" and renders outlined -
 * transparent fill, border and text in the owner's OWN tagColor (see utils/tagColor.js) - never
 * filled. A personal-calendar entry has no real Consult/Session distinction (see
 * AppointmentWizard.jsx's own comment on why creating one never asks) - `type` still carries an
 * internal value for it (currently 'other'), but that value is never shown; "personal" reads as a
 * property of WHOSE calendar this is on, not as a third kind of appointment alongside the other
 * two.
 */
const AppointmentTypeChip = ({ type, size = "medium", personal = false, tagColor }) => {
  if (!type) {
    return null;
  }
  const { background, text, border } = appointmentTypeStyle(type);
  const style = personal
    ? {
        backgroundColor: "transparent",
        color: resolveTagColor(tagColor),
        borderColor: resolveTagColor(tagColor),
      }
    : { backgroundColor: background, color: text, borderColor: border };
  return (
    <span
      className={`appointmentTypeChip${size === "small" ? " appointmentTypeChipSmall" : ""}${
        personal ? " appointmentTypeChipPersonal" : ""
      }`}
      style={style}
    >
      {personal ? "Personal" : appointmentTypeLabel(type)}
    </span>
  );
};

export default AppointmentTypeChip;
