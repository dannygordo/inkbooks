import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
import { CircularProgress } from "@mui/material";
import FormService from "../../services/FormService";
import FormFieldsRenderer from "../../components/forms/FormFieldsRenderer";
import IBInput from "../../components/inputs/IBInput";
import "./forms.css";

/**
 * Task #147 - the public, unauthenticated guest fill-out page. Same shape as
 * pages/booking/BookingRequest.jsx (its own header comment is the template this follows): no
 * AuthRoute wrapper (see App.jsx's /form/:publicToken route), resolved through getPublicForm - the
 * stripped-down PublicForm type, never getForm/Form itself, so a guest holding the link can never
 * read this form's shopId/artistUserId/status/publicToken (see typeDefs.js's own comment on why
 * PublicForm exists as a separate type rather than a resolver-level field-nulling of Form).
 *
 * Collects first/last/email/phone the same way BookingRequest does - submitFormResponse's guest
 * path runs them through the exact same findOrCreateGuestClient (see resolvers/forms.js), so a
 * guest who has already messaged this shop/artist through booking intake resolves to the SAME
 * Client record here, not a duplicate.
 */
const PublicFormFillOut = () => {
	const { publicToken } = useParams();

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [answers, setAnswers] = useState({});
	const [fieldErrors, setFieldErrors] = useState({});
	const [generalError, setGeneralError] = useState(null);
	const [submitted, setSubmitted] = useState(false);

	const { data, loading, error } = useQuery(FormService.GET_PUBLIC_FORM, {
		variables: { publicToken },
		skip: !publicToken,
	});

	const [submitFormResponse, { loading: submitting }] = useMutation(
		FormService.SUBMIT_FORM_RESPONSE,
		{
			onCompleted: () => setSubmitted(true),
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

	if (!publicToken) {
		return (
			<div className="publicFormFillOut">
				<div className="publicFormFillOutWrapper">
					<p>This link is missing a form. Double-check the link and try again.</p>
				</div>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="publicFormFillOut">
				<div className="publicFormFillOutWrapper">
					<CircularProgress color="inherit" size="30px" />
				</div>
			</div>
		);
	}

	if (error || !data?.getPublicForm) {
		return (
			<div className="publicFormFillOut">
				<div className="publicFormFillOutWrapper">
					<p>This link doesn't work - it may have expired or is no longer accepting responses.</p>
				</div>
			</div>
		);
	}

	const form = data.getPublicForm;

	if (submitted) {
		return (
			<div className="publicFormFillOut">
				<div className="publicFormFillOutWrapper">
					<h3>Thanks, {firstName || "there"}</h3>
					<p>Your response to "{form.title}" has been received.</p>
				</div>
			</div>
		);
	}

	const handleSubmit = (e) => {
		e.preventDefault();
		setFieldErrors({});
		setGeneralError(null);
		submitFormResponse({
			variables: {
				input: {
					publicToken,
					firstName,
					lastName,
					email,
					phone: phone || null,
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
		<div className="publicFormFillOut">
			<div className="publicFormFillOutWrapper">
				<h3>{form.title}</h3>
				{form.description && <p className="settingsPanelHelp">{form.description}</p>}

				<form onSubmit={handleSubmit}>
					<div className="publicFormFillOutGuestFields">
						<IBInput
							label="First name"
							value={firstName}
							onChange={(e) => setFirstName(e.target.value)}
							required
						/>
						<IBInput
							label="Last name"
							value={lastName}
							onChange={(e) => setLastName(e.target.value)}
							required
						/>
						<IBInput
							label="Email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
						<IBInput
							label="Phone (optional)"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
						/>
					</div>

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
						<button type="submit" className="ibButton" disabled={submitting}>
							{submitting ? <CircularProgress size={16} color="inherit" /> : "Submit"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default PublicFormFillOut;
