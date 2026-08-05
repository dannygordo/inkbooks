import React, { useState } from "react";
import { DialogActions, DialogContent, Button } from "@mui/material";
import IBInput from "../inputs/IBInput";
import "./entityWizard.css";

/**
 * The shell all three creation wizards run on - client, artist, staff.
 *
 * One shell rather than three, for the same reason EntityList replaced six card components: three
 * near-identical stepped forms is how you end up with three slightly different validation rules
 * and three slightly different ways of reporting the same error. Each wizard supplies its steps
 * and its submit; everything about being a wizard lives here.
 *
 * WHAT A STEP IS. `{ title, subtitle, fields: [{ name, label, type, required, helperText }] }`.
 * Fields are declared rather than passed as JSX so the shell can validate them - a step that
 * hands over arbitrary children can't be checked before advancing, which is exactly what makes
 * multi-step forms frustrating: you find out on the last screen that the first one was wrong.
 *
 * Values live here and are passed to onSubmit as one object. Deliberately controlled state rather
 * than refs, unlike the older forms in this app: a wizard has to read its own values to validate
 * a step before moving on, and refs would mean reaching into DOM nodes that the previous step has
 * already unmounted.
 *
 * @param {Array} steps
 * @param {(values: object) => Promise<React.ReactNode>} onSubmit - resolves to whatever should be
 *   shown on the final screen (see the invite-link case in the artist and staff wizards)
 * @param {string} submitLabel
 * @param {() => void} onClose
 */
const EntityWizard = ({ steps, onSubmit, submitLabel = "Create", onClose }) => {
	const [stepIndex, setStepIndex] = useState(0);
	const [values, setValues] = useState({});
	const [errors, setErrors] = useState({});
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState(null);
	const [submitError, setSubmitError] = useState(null);

	const step = steps[stepIndex];
	const isLastStep = stepIndex === steps.length - 1;

	const setValue = (name, value) => {
		setValues((prev) => ({ ...prev, [name]: value }));
		// Clears the error the moment the user starts fixing it, rather than leaving a red field
		// under a cursor that's actively correcting it.
		setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
	};

	// Validates only the CURRENT step. Checking the whole form on every Next would light up
	// errors for fields the user hasn't reached yet, which reads as the form being broken.
	const validateStep = () => {
		const stepErrors = {};
		step.fields.forEach((field) => {
			const value = (values[field.name] || "").trim?.() ?? values[field.name];
			if (field.required && !value) {
				stepErrors[field.name] = `${field.label} is required`;
			}
			if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
				// A deliberately loose check. Anything stricter rejects real addresses, and the
				// server is the authority on whether the account can be created anyway - this is
				// only here to catch an obvious typo before a round trip.
				stepErrors[field.name] = "That doesn't look like an email address";
			}
		});
		setErrors(stepErrors);
		return Object.keys(stepErrors).length === 0;
	};

	const handleNext = () => {
		if (!validateStep()) {
			return;
		}
		setStepIndex((i) => i + 1);
	};

	const handleSubmit = async () => {
		if (!validateStep()) {
			return;
		}
		setSubmitting(true);
		setSubmitError(null);
		try {
			const outcome = await onSubmit(values);
			setResult(outcome);
		} catch (err) {
			// Kept on the current step rather than closing. A failed create with the modal gone
			// means retyping everything, and the most likely failure - a duplicate email - is one
			// the user can fix in place.
			setSubmitError(err.graphQLErrors?.[0]?.message || err.message);
		} finally {
			setSubmitting(false);
		}
	};

	if (result) {
		return (
			<div className="entityWizard">
				<DialogContent dividers className="entityWizardContent">
					{result}
				</DialogContent>
				<DialogActions className="entityWizardActions">
					<Button variant="contained" sx={{ backgroundColor: "#333" }} onClick={onClose}>
						Done
					</Button>
				</DialogActions>
			</div>
		);
	}

	return (
		<div className="entityWizard">
			<DialogContent dividers className="entityWizardContent">
				{steps.length > 1 && (
					<span className="entityWizardProgress">
						Step {stepIndex + 1} of {steps.length}
					</span>
				)}
				<h3 className="entityWizardTitle">{step.title}</h3>
				{step.subtitle && <p className="entityWizardSubtitle">{step.subtitle}</p>}

				{step.fields.map((field) =>
					// A field can supply its own control via `render`, for the cases a labelled
					// text box genuinely can't cover - today that's the booking slug, which needs
					// a live availability check against the server as you type. The alternative
					// was teaching this component about slugs specifically, which would make the
					// generic wizard carry knowledge of one caller's one field.
					field.render ? (
						<React.Fragment key={field.name}>
							{field.render({
								value: values[field.name] || "",
								setValue: (v) => setValue(field.name, v),
								error: errors[field.name],
								values,
							})}
						</React.Fragment>
					) : (
						<IBInput
							key={field.name}
							id={field.name}
							label={field.required ? `${field.label} *` : field.label}
							type={field.type === "email" ? "email" : field.type || "text"}
							defaultValue={values[field.name] || ""}
							error={Boolean(errors[field.name])}
							helperText={errors[field.name] || field.helperText || " "}
							onChange={(e) => setValue(field.name, e.target.value)}
						/>
					)
				)}

				{submitError && <div className="entityWizardError">{submitError}</div>}
			</DialogContent>
			<DialogActions className="entityWizardActions">
				{stepIndex > 0 && (
					<Button onClick={() => setStepIndex((i) => i - 1)} disabled={submitting}>
						Back
					</Button>
				)}
				<Button onClick={onClose} disabled={submitting}>
					Cancel
				</Button>
				{isLastStep ? (
					<Button
						variant="contained"
						sx={{ backgroundColor: "#333" }}
						onClick={handleSubmit}
						disabled={submitting}
					>
						{submitting ? "Creating..." : submitLabel}
					</Button>
				) : (
					<Button variant="contained" sx={{ backgroundColor: "#333" }} onClick={handleNext}>
						Next
					</Button>
				)}
			</DialogActions>
		</div>
	);
};

export default EntityWizard;
