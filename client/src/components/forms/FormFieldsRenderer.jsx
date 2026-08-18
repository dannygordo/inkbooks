import React from "react";
import { Checkbox, CircularProgress, Radio } from "@mui/material";
import IBInput from "../inputs/IBInput";
import IBMultilineInput from "../inputs/IBMultilineInput";
import { apiUrl } from "../../utils/apiUrl";
import "../../pages/forms/forms.css";

// Same REST route booking-uploads/form-uploads share the Storage logic for - see
// routes/formUploads.js's own comment on why file uploads are a plain Express route, not part of
// the submitFormResponse GraphQL mutation. Used for BOTH file_upload fields and, indirectly,
// nothing else - a signature field never uploads anything, it's a typed name (see below).
const UPLOAD_URL = apiUrl("form-uploads");

async function uploadFiles(files) {
	if (!files || files.length === 0) {
		return [];
	}
	const formData = new FormData();
	files.forEach((file) => formData.append("files", file));
	const response = await fetch(UPLOAD_URL, { method: "POST", body: formData });
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(data.error || "Failed to upload file(s).");
	}
	return data.urls || [];
}

/**
 * Renders one form's fields (whatever shape carries them - Form.fields, PublicForm.fields, or a
 * FormResponse's own fieldsSnapshot for a read-only display) as controlled inputs, and keeps an
 * `answers` map (fieldKey -> answer shape) in the PARENT's state - this component has no state of
 * its own beyond per-field upload-in-progress flags, so the caller (FormFillOut.jsx/
 * PublicFormFillOut.jsx) owns exactly one source of truth for what's about to be submitted.
 *
 * `answers` values match FormAnswerInput's own shape (fieldKey/textValue/selectedOptions/
 * dateValue/fileUrls/signedName) - see server/graphql/typeDefs.js - so the caller can spread
 * Object.values(answers) straight into submitFormResponse's input with no reshaping.
 *
 * `errors` is a fieldKey-keyed map of message strings, populated by the caller from the server's
 * own UserInputError.extensions.errors (see resolvers/forms.js's assertAnswersMatchFields) - this
 * component never invents its own required-field validation beyond a visual asterisk, since the
 * server is the actual authority on what "required" means here (a required field with no answer
 * is refused server-side regardless of what this renders).
 */
const FormFieldsRenderer = ({ fields, answers, onAnswerChange, errors = {}, disabled = false }) => {
	const [uploadingKey, setUploadingKey] = React.useState(null);
	const [uploadErrors, setUploadErrors] = React.useState({});

	const setAnswer = (fieldKey, patch) => {
		onAnswerChange(fieldKey, { fieldKey, ...answers[fieldKey], ...patch });
	};

	const handleFileChange = async (field, e) => {
		const files = [...(e.target.files || [])];
		if (files.length === 0) {
			return;
		}
		setUploadingKey(field.key);
		setUploadErrors((prev) => ({ ...prev, [field.key]: null }));
		try {
			const urls = await uploadFiles(files);
			setAnswer(field.key, { fileUrls: [...(answers[field.key]?.fileUrls || []), ...urls] });
		} catch (err) {
			setUploadErrors((prev) => ({ ...prev, [field.key]: err.message }));
		} finally {
			setUploadingKey(null);
		}
	};

	const removeFile = (field, url) => {
		setAnswer(field.key, {
			fileUrls: (answers[field.key]?.fileUrls || []).filter((u) => u !== url),
		});
	};

	return (
		<div className="formFieldsRenderer">
			{fields.map((field) => {
				const answer = answers[field.key] || {};
				const error = errors[field.key];
				return (
					<div className="formFieldBlock" key={field.key}>
						<label className="formFieldQuestion" htmlFor={`formField-${field.key}`}>
							{field.label}
							{field.required && <span className="formFieldRequiredMark">*</span>}
						</label>
						{field.helpText && <p className="formFieldHelp">{field.helpText}</p>}

						{field.type === "short_text" && (
							<IBInput
								id={`formField-${field.key}`}
								value={answer.textValue || ""}
								onChange={(e) => setAnswer(field.key, { textValue: e.target.value })}
								disabled={disabled}
								required={field.required}
							/>
						)}

						{field.type === "paragraph" && (
							<IBMultilineInput
								id={`formField-${field.key}`}
								value={answer.textValue || ""}
								onChange={(e) => setAnswer(field.key, { textValue: e.target.value })}
								disabled={disabled}
							/>
						)}

						{field.type === "date" && (
							<IBInput
								id={`formField-${field.key}`}
								type="date"
								value={answer.dateValue ? String(answer.dateValue).slice(0, 10) : ""}
								onChange={(e) => setAnswer(field.key, { dateValue: e.target.value })}
								disabled={disabled}
								required={field.required}
							/>
						)}

						{field.type === "single_choice" &&
							(field.options || []).map((option) => (
								<label className="formFieldChoiceRow" key={option}>
									<Radio
										checked={(answer.selectedOptions || [])[0] === option}
										onChange={() => setAnswer(field.key, { selectedOptions: [option] })}
										disabled={disabled}
										size="small"
									/>
									{option}
								</label>
							))}

						{field.type === "multi_choice" &&
							(field.options || []).map((option) => {
								const selected = answer.selectedOptions || [];
								const checked = selected.includes(option);
								return (
									<label className="formFieldChoiceRow" key={option}>
										<Checkbox
											checked={checked}
											onChange={() =>
												setAnswer(field.key, {
													selectedOptions: checked
														? selected.filter((o) => o !== option)
														: [...selected, option],
												})
											}
											disabled={disabled}
											size="small"
										/>
										{option}
									</label>
								);
							})}

						{field.type === "file_upload" && (
							<>
								<input
									id={`formField-${field.key}`}
									type="file"
									accept="image/jpeg,image/png,image/webp,image/gif"
									multiple
									disabled={disabled || uploadingKey === field.key}
									onChange={(e) => handleFileChange(field, e)}
								/>
								{uploadingKey === field.key && <CircularProgress size={16} />}
								{uploadErrors[field.key] && (
									<p className="formFieldError">{uploadErrors[field.key]}</p>
								)}
								{(answer.fileUrls || []).length > 0 && (
									<ul className="formFieldFileList">
										{answer.fileUrls.map((url) => (
											<li key={url}>
												{url.split("/").pop()}{" "}
												{!disabled && (
													<button
														type="button"
														className="ibButtonSecondary"
														onClick={() => removeFile(field, url)}
													>
														Remove
													</button>
												)}
											</li>
										))}
									</ul>
								)}
							</>
						)}

						{field.type === "signature" && (
							<IBInput
								id={`formField-${field.key}`}
								label="Type your full legal name to sign"
								value={answer.signedName || ""}
								onChange={(e) => setAnswer(field.key, { signedName: e.target.value })}
								disabled={disabled}
								required={field.required}
							/>
						)}

						{error && <p className="formFieldError">{error}</p>}
					</div>
				);
			})}
		</div>
	);
};

export default FormFieldsRenderer;
