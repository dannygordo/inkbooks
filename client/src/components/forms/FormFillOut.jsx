import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { CircularProgress } from "@mui/material";
import FormService from "../../services/FormService";
import FormFieldsRenderer from "./FormFieldsRenderer";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import "../../pages/forms/forms.css";

/**
 * The AUTHENTICATED fill-out flow - task #146. Renders a published form's live fields (via
 * getForm, not getPublicForm - that one's the stripped-down PUBLIC shape a guest gets, see
 * FormService.js's own comment) and submits through submitFormResponse the same two authenticated
 * paths resolvers/forms.js supports:
 *
 *   clientId supplied  - staff (or the artist) filling this out on a specific client's behalf,
 *                         e.g. handing a tablet to someone at the counter. The server double-checks
 *                         the caller manages both the form's own scope AND has a real relationship
 *                         to that client (assertCanManageBusinessRecord + assertCanAccessClient).
 *   clientId omitted   - self-service: the logged-in caller is filling out their OWN copy. The
 *                         server resolves their Client record itself; there is nothing else for
 *                         this component to send.
 *
 * Deliberately NOT the guest/public path - see pages/forms/PublicFormFillOut.jsx for that one,
 * which resolves the form by publicToken instead of formId and has no clientId/authenticated
 * caller at all.
 *
 * Meant to be mounted inside the app's global modal (see components/ibModal/IBModal.jsx and this
 * component's own caller, ClientDashboard.jsx's "Forms" section) as well as usable inline on a
 * page - it has no opinion on its own container, just an onSubmitted callback to close/refresh
 * whatever opened it.
 */
const FormFillOut = ({ formId, clientId, onSubmitted, onCancel }) => {
	const { data, loading } = FormService.getForm(formId);
	const [answers, setAnswers] = useState({});
	const [fieldErrors, setFieldErrors] = useState({});
	const [generalError, setGeneralError] = useState(null);

	const [submitFormResponse, { loading: submitting }] = useMutation(
		FormService.SUBMIT_FORM_RESPONSE,
		{
			onCompleted: (result) => {
				setFieldErrors({});
				setGeneralError(null);
				onSubmitted?.(result.submitFormResponse);
			},
			onError: (err) => {
				const extensions = err.graphQLErrors?.[0]?.extensions;
				if (extensions?.errors) {
					setFieldErrors(extensions.errors);
					setGeneralError(null);
				} else {
					setGeneralError(err.graphQLErrors?.[0]?.message || err.message);
				}
			},
		}
	);

	if (loading && !data) {
		return <IBPageLoader />;
	}

	const form = data?.getForm;
	if (!form) {
		return <p className="clientDashboardEmpty">This form could not be found.</p>;
	}
	if (form.status !== "published") {
		return <p className="clientDashboardEmpty">This form is not currently accepting responses.</p>;
	}

	const handleSubmit = (e) => {
		e.preventDefault();
		submitFormResponse({
			variables: {
				input: {
					formId: form.id,
					clientId: clientId || null,
					answers: Object.values(answers).map(
						({ fieldKey, textValue, selectedOptions, dateValue, fileUrls, signedName }) => ({
							fieldKey,
							textValue: textValue || null,
							selectedOptions: selectedOptions || [],
							dateValue: dateValue || null,
							fileUrls: fileUrls || [],
							signedName: signedName || null,
						})
					),
				},
			},
		});
	};

	return (
		<form className="formFillOutForm" onSubmit={handleSubmit}>
			{form.description && <p className="settingsPanelHelp">{form.description}</p>}
			<FormFieldsRenderer
				fields={form.fields}
				answers={answers}
				onAnswerChange={(fieldKey, answer) =>
					setAnswers((prev) => ({ ...prev, [fieldKey]: answer }))
				}
				errors={fieldErrors}
				disabled={submitting}
			/>
			{generalError && <p className="formFieldError">{generalError}</p>}
			<div className="settingsActions">
				{onCancel && (
					<button type="button" className="ibButtonSecondary" onClick={onCancel} disabled={submitting}>
						Cancel
					</button>
				)}
				<button type="submit" className="ibButton" disabled={submitting}>
					{submitting ? <CircularProgress size={16} color="inherit" /> : "Submit"}
				</button>
			</div>
		</form>
	);
};

export default FormFillOut;
