import React from "react";
import "./formField.css";

/**
 * The register wizard's field convention (see register.css's Field, which this mirrors exactly
 * under app-wide class names), shared so a modal doesn't need to reinvent it - see formField.css's
 * own header comment on why this is a sibling file rather than a shared import between the two.
 *
 * A REAL <label htmlFor>, not MUI's floating label - the visible label sits above the help text,
 * which sits above the control, so the field reads in the order the decision is made. `id` is
 * therefore required, not decorative: it's the only thing tying the label to the control, and the
 * control itself (an IBInput/TextField/Select/whatever) should be passed with NO label prop of its
 * own - two labels for one field is worse than the floating-label look this replaces.
 */
const FormField = ({ id, label, help, children }) => (
	<div className="ibField">
		<label className="ibFieldLabel" htmlFor={id}>
			{label}
		</label>
		{help && <p className="ibFieldHelp">{help}</p>}
		<div className="ibFieldControl">{children}</div>
	</div>
);

export default FormField;
