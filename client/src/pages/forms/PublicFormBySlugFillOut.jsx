import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
import { CircularProgress } from "@mui/material";
import FormService from "../../services/FormService";
import FormFieldsRenderer from "../../components/forms/FormFieldsRenderer";
import IBInput from "../../components/inputs/IBInput";
import "./forms.css";

/**
 * Task #158 - the slug-based public fill-out page, /<formSlug>/<ownerHandle> (e.g.
 * /consent/dana-wolfe or /book/dana-wolfe). Same shape as PublicFormFillOut.jsx (its own header
 * comment is still the template this follows for the guest-submission mechanics), but resolved
 * through getPublicFormBySlug rather than getPublicForm - see server/utils/public-form-lookup.js's
 * own header comment on why this is a deliberately predictable, shareable link rather than a
 * secret token, and typeDefs.js's PublicFormLookup for the three distinct non-'ok' states this
 * page has to show instead of one generic "this link doesn't work."
 *
 * NOT used for /book/:artistHandle - that route stays on BookingRequest.jsx, its own untouched
 * pipeline (see models/Form.js's own header comment on why). This page is reachable through
 * router fallthrough for every OTHER formSlug (e.g. /consent/:ownerHandle) - React Router ranks
 * the static /book/:artistHandle segment above this route's dynamic :formSlug segment at the same
 * position, so the two coexist without App.jsx needing to special-case anything.
 */
const STATE_MESSAGES = {
	not_found: "This link doesn't work. Double-check it and try again.",
	inactive: "This form has been marked as inactive.",
	artist_gone: "This artist is no longer on the platform.",
};

const PublicFormBySlugFillOut = () => {
	const { formSlug, ownerHandle } = useParams();

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [answers, setAnswers] = useState({});
	const [fieldErrors, setFieldErrors] = useState({});
	const [generalError, setGeneralError] = useState(null);
	const [submitted, setSubmitted] = useState(false);

	const { data, loading, error } = useQuery(FormService.GET_PUBLIC_FORM_BY_SLUG, {
		variables: { formSlug, ownerHandle },
		skip: !formSlug || !ownerHandle,
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

	if (loading) {
		return (
			<div className="publicFormFillOut">
				<div className="publicFormFillOutWrapper">
					<CircularProgress color="inherit" size="30px" />
				</div>
			</div>
		);
	}

	const lookup = data?.getPublicFormBySlug;

	if (error || !lookup || lookup.state !== "ok" || !lookup.form) {
		const message = STATE_MESSAGES[lookup?.state] || STATE_MESSAGES.not_found;
		return (
			<div className="publicFormFillOut">
				<div className="publicFormFillOutWrapper">
					<p>{message}</p>
				</div>
			</div>
		);
	}

	const form = lookup.form;

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
					formSlug,
					ownerHandle,
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
				{form.description && <p className="publicFormDescriptionText">{form.description}</p>}

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

export default PublicFormBySlugFillOut;
