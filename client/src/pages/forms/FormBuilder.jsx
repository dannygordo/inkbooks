import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link as RouterLink } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { Button, Checkbox, Chip, IconButton } from "@mui/material";
import { ArrowDownward, ArrowUpward, Close } from "@mui/icons-material";
import FormService from "../../services/FormService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBInput from "../../components/inputs/IBInput";
import IBMultilineInput from "../../components/inputs/IBMultilineInput";
import IBSelect from "../../components/inputs/IBSelect";
import FormField from "../../components/formField/FormField";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS, ROUTE_CONSTANTS, APP_SETTINGS_CONSTANTS } from "../../constants";
import { businessScopeFor, createScopeFor } from "../../utils/businessScope";
import "./forms.css";

const CHOICE_TYPES = APP_SETTINGS_CONSTANTS.FORM_CHOICE_FIELD_TYPES;
const STATUS_LABEL = Object.fromEntries(
	APP_SETTINGS_CONSTANTS.FORM_STATUSES.map((s) => [s.value, s.label])
);

const newField = () => ({
	// Purely a React list key + local add/remove/reorder handle - NEVER sent to the server. The
	// server-recognized `key` (FormFieldInput.key) stays undefined for a brand-new field so
	// createForm/updateForm generate a real one (see resolvers/forms.js's fieldsFromInput) -
	// sending this local id as if it were that key would hand the server a value it has never
	// issued, for a field it has no record of.
	_localId: `new-${Math.random().toString(36).slice(2)}`,
	key: undefined,
	type: "short_text",
	label: "",
	helpText: "",
	required: false,
	options: [],
});

const fieldFromServer = (f) => ({ _localId: f.key, ...f });

/**
 * Task #145 - add/remove/reorder fields, per-field type picker, required toggle, choice-option
 * editor, and (once a form actually exists - see below) publish/archive/guest-link controls.
 *
 * TWO MODES, one component, keyed off the :formId route param:
 *   /forms/new        - formId is the literal string "new". No server form exists yet - this is
 *                        local-only state until Save calls createForm. createFormInputSchema
 *                        (server/utils/validation.js) requires at least one field, so there is no
 *                        such thing as an empty draft saved here - see Forms.jsx's own comment on
 *                        why "New Form" hands off here instead of creating one itself.
 *   /forms/:realId     - loads the existing Form via getForm and edits it in place; Save calls
 *                        updateForm. Publish/Archive/guest-link toggle only make sense once the
 *                        form is real, so those controls are hidden entirely in "new" mode rather
 *                        than shown disabled.
 */
const FormBuilder = () => {
	const { formId } = useParams();
	const isNew = formId === "new";
	const navigate = useNavigate();
	const { user, setAlert } = useAuth();
	const scope = businessScopeFor(user);

	const { data, loading } = FormService.getForm(isNew ? null : formId);

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [fields, setFields] = useState([]);
	const [loadedForm, setLoadedForm] = useState(null);

	useEffect(() => {
		const form = data?.getForm;
		if (form && form.id !== loadedForm?.id) {
			setTitle(form.title);
			setDescription(form.description || "");
			setFields(form.fields.map(fieldFromServer));
			setLoadedForm(form);
		}
	}, [data]);

	const [createForm, { loading: creating }] = useMutation(FormService.CREATE_FORM);
	const [updateForm, { loading: updating }] = useMutation(FormService.UPDATE_FORM);
	const [publishForm] = useMutation(FormService.PUBLISH_FORM);
	const [archiveForm] = useMutation(FormService.ARCHIVE_FORM);
	const [setFormGuestAccess] = useMutation(FormService.SET_FORM_GUEST_ACCESS);

	const showError = (err) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.ERROR,
			message: err.graphQLErrors?.[0]?.message || err.message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};

	const showSuccess = (message) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};

	if (!isNew && loading && !data) {
		return <IBPageLoader />;
	}
	if (!isNew && !loading && !data?.getForm) {
		return <p className="clientDashboardEmpty">This form could not be found.</p>;
	}

	const updateFieldAt = (localId, patch) => {
		setFields((prev) => prev.map((f) => (f._localId === localId ? { ...f, ...patch } : f)));
	};

	const removeFieldAt = (localId) => {
		setFields((prev) => prev.filter((f) => f._localId !== localId));
	};

	const moveField = (index, direction) => {
		setFields((prev) => {
			const next = [...prev];
			const target = index + direction;
			if (target < 0 || target >= next.length) {
				return prev;
			}
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	};

	const addOption = (localId) => {
		updateFieldAt(localId, {
			options: [...(fields.find((f) => f._localId === localId)?.options || []), ""],
		});
	};

	const updateOption = (localId, idx, value) => {
		const field = fields.find((f) => f._localId === localId);
		const options = [...(field?.options || [])];
		options[idx] = value;
		updateFieldAt(localId, { options });
	};

	const removeOption = (localId, idx) => {
		const field = fields.find((f) => f._localId === localId);
		updateFieldAt(localId, { options: (field?.options || []).filter((_, i) => i !== idx) });
	};

	const canSave =
		title.trim().length > 0 &&
		fields.length > 0 &&
		fields.every((f) => f.label.trim().length > 0) &&
		fields.every((f) => !CHOICE_TYPES.includes(f.type) || (f.options || []).filter((o) => o.trim()).length >= 2);

	const fieldsForInput = () =>
		fields.map((f) => ({
			...(f.key ? { key: f.key } : {}),
			type: f.type,
			label: f.label.trim(),
			helpText: f.helpText || "",
			required: Boolean(f.required),
			options: CHOICE_TYPES.includes(f.type) ? (f.options || []).map((o) => o.trim()).filter(Boolean) : [],
		}));

	const handleSave = async (e) => {
		e.preventDefault();
		if (!canSave) {
			return;
		}
		try {
			if (isNew) {
				const result = await createForm({
					variables: {
						input: {
							...createScopeFor(user),
							title: title.trim(),
							description: description.trim(),
							fields: fieldsForInput(),
						},
					},
				});
				const newId = result.data?.createForm?.id;
				showSuccess("Form created.");
				if (newId) {
					navigate(`${ROUTE_CONSTANTS.FORM}${newId}`, { replace: true });
				}
			} else {
				await updateForm({
					variables: {
						input: {
							formId,
							title: title.trim(),
							description: description.trim(),
							fields: fieldsForInput(),
						},
					},
				});
				showSuccess("Form saved.");
			}
		} catch (err) {
			showError(err);
		}
	};

	const handlePublish = async () => {
		try {
			const result = await publishForm({ variables: { formId } });
			setLoadedForm(result.data?.publishForm);
			showSuccess("Form published.");
		} catch (err) {
			showError(err);
		}
	};

	const handleArchive = async () => {
		try {
			const result = await archiveForm({ variables: { formId } });
			setLoadedForm(result.data?.archiveForm);
			showSuccess("Form archived.");
		} catch (err) {
			showError(err);
		}
	};

	const handleToggleGuestAccess = async () => {
		try {
			const result = await setFormGuestAccess({
				variables: { formId, allow: !loadedForm?.allowGuestSubmissions },
			});
			const updated = result.data?.setFormGuestAccess;
			setLoadedForm(updated);
			if (updated?.allowGuestSubmissions && updated?.publicToken) {
				const link = `${window.location.origin}${ROUTE_CONSTANTS.PUBLIC_FORM}${updated.publicToken}`;
				await navigator.clipboard?.writeText(link).catch(() => {});
				showSuccess("Public link turned on and copied to your clipboard.");
			}
		} catch (err) {
			showError(err);
		}
	};

	return (
		<div className="formBuilderPage">
			<div className="formBuilderTopRow">
				<h1>{isNew ? "New Form" : "Edit Form"}</h1>
				{!isNew && loadedForm && (
					<Chip
						className="formBuilderStatusChip"
						label={STATUS_LABEL[loadedForm.status] || loadedForm.status}
					/>
				)}
			</div>

			{!isNew && loadedForm && (
				<div className="settingsActions">
					{loadedForm.status !== "published" && (
						<Button size="small" onClick={handlePublish}>
							Publish
						</Button>
					)}
					{loadedForm.status === "published" && (
						<Button size="small" onClick={handleArchive}>
							Archive
						</Button>
					)}
					<Button size="small" onClick={handleToggleGuestAccess}>
						{loadedForm.allowGuestSubmissions ? "Turn off public link" : "Turn on public link"}
					</Button>
					<Button size="small" component={RouterLink} to={`${ROUTE_CONSTANTS.FORM}${formId}/responses`}>
						View Responses
					</Button>
				</div>
			)}

			{!isNew && loadedForm?.allowGuestSubmissions && loadedForm?.publicToken && (
				<div className="formBuilderGuestLink">
					Public link:
					<span className="formBuilderGuestLinkUrl">
						{window.location.origin}
						{ROUTE_CONSTANTS.PUBLIC_FORM}
						{loadedForm.publicToken}
					</span>
				</div>
			)}

			<form onSubmit={handleSave}>
				<FormField id="formTitle" label="Title">
					<IBInput id="formTitle" value={title} onChange={(e) => setTitle(e.target.value)} required />
				</FormField>
				<FormField id="formDescription" label="Description (optional)">
					<IBMultilineInput
						id="formDescription"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</FormField>

				<div className="fieldEditorList">
					{fields.map((field, index) => (
						<div className="fieldEditorRow" key={field._localId}>
							<div className="fieldEditorTopLine">
								<IBInput
									label="Question"
									value={field.label}
									onChange={(e) => updateFieldAt(field._localId, { label: e.target.value })}
									required
								/>
								<IBSelect
									id={`fieldType-${field._localId}`}
									label="Type"
									data={APP_SETTINGS_CONSTANTS.FORM_FIELD_TYPES}
									selectedVal={field.type}
									onChange={(e) => updateFieldAt(field._localId, { type: e.target.value })}
								/>
								<div className="fieldEditorRowButtons">
									<IconButton
										size="small"
										disabled={index === 0}
										onClick={() => moveField(index, -1)}
										aria-label="Move field up"
									>
										<ArrowUpward fontSize="small" />
									</IconButton>
									<IconButton
										size="small"
										disabled={index === fields.length - 1}
										onClick={() => moveField(index, 1)}
										aria-label="Move field down"
									>
										<ArrowDownward fontSize="small" />
									</IconButton>
									<IconButton
										size="small"
										onClick={() => removeFieldAt(field._localId)}
										aria-label="Remove field"
									>
										<Close fontSize="small" />
									</IconButton>
								</div>
							</div>

							<IBInput
								label="Help text (optional)"
								value={field.helpText}
								onChange={(e) => updateFieldAt(field._localId, { helpText: e.target.value })}
							/>

							<label className="fieldEditorRequiredRow">
								<Checkbox
									size="small"
									checked={field.required}
									onChange={(e) => updateFieldAt(field._localId, { required: e.target.checked })}
								/>
								Required
							</label>

							{CHOICE_TYPES.includes(field.type) && (
								<div className="fieldEditorOptions">
									{(field.options || []).map((option, idx) => (
										<div className="fieldEditorOptionRow" key={idx}>
											<IBInput
												label={`Option ${idx + 1}`}
												value={option}
												onChange={(e) => updateOption(field._localId, idx, e.target.value)}
											/>
											<IconButton
												size="small"
												onClick={() => removeOption(field._localId, idx)}
												aria-label="Remove option"
											>
												<Close fontSize="small" />
											</IconButton>
										</div>
									))}
									<Button size="small" onClick={() => addOption(field._localId)}>
										Add option
									</Button>
									{(field.options || []).filter((o) => o.trim()).length < 2 && (
										<p className="formFieldError">A choice field needs at least two options.</p>
									)}
								</div>
							)}
						</div>
					))}
				</div>

				<div className="formBuilderAddFieldRow">
					<Button variant="outlined" onClick={() => setFields((prev) => [...prev, newField()])}>
						Add Field
					</Button>
				</div>

				<div className="settingsActions">
					<button type="submit" className="ibButton" disabled={!canSave || creating || updating}>
						{creating || updating ? "Saving..." : isNew ? "Create Form" : "Save Changes"}
					</button>
				</div>
			</form>
		</div>
	);
};

export default FormBuilder;
