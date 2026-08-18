import React, { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { Button, Chip } from "@mui/material";
import moment from "moment";
import FormService from "../../services/FormService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import EntityListPager from "../../components/entityList/EntityListPager";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS, ROUTE_CONSTANTS, APP_SETTINGS_CONSTANTS } from "../../constants";
import { businessScopeFor } from "../../utils/businessScope";
import "./forms.css";

const PAGE_SIZE = 25;

const STATUS_LABEL = Object.fromEntries(
	APP_SETTINGS_CONSTANTS.FORM_STATUSES.map((s) => [s.value, s.label])
);

/**
 * Task #144 - the forms management list: every form this shop (or independent artist) has built,
 * draft/published/archived, with create/duplicate/publish/archive/delete actions. Same shape as
 * pages/expenses/Expenses.jsx - scoped via businessScopeFor(user), same ownership model (see
 * FormService.js's own header comment) - but there is no inline "add" form the way Expenses has:
 * createFormInputSchema requires at least one field (server/utils/validation.js), so "New Form"
 * hands off to FormBuilder.jsx (/forms/new) to assemble fields before anything is actually
 * created, rather than creating an empty draft here that can't legally exist.
 */
const Forms = () => {
	const { user, setAlert } = useAuth();
	const navigate = useNavigate();
	const scope = businessScopeFor(user);

	const [statusFilter, setStatusFilter] = useState("");
	const [offset, setOffset] = useState(0);
	const [pageSize, setPageSize] = useState(PAGE_SIZE);

	const { data, loading, refetch } = FormService.getForms(
		scope,
		statusFilter,
		{ limit: pageSize, offset }
	);
	const [publishForm] = useMutation(FormService.PUBLISH_FORM);
	const [archiveForm] = useMutation(FormService.ARCHIVE_FORM);
	const [setFormGuestAccess] = useMutation(FormService.SET_FORM_GUEST_ACCESS);
	const [deleteForm] = useMutation(FormService.DELETE_FORM);
	const [createForm] = useMutation(FormService.CREATE_FORM);

	const forms = data?.getForms?.items || [];

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

	const handlePublish = async (form) => {
		try {
			await publishForm({ variables: { formId: form.id } });
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const handleArchive = async (form) => {
		try {
			await archiveForm({ variables: { formId: form.id } });
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const handleToggleGuestAccess = async (form) => {
		try {
			const result = await setFormGuestAccess({
				variables: { formId: form.id, allow: !form.allowGuestSubmissions },
			});
			const updated = result.data?.setFormGuestAccess;
			if (updated?.allowGuestSubmissions && updated?.publicToken) {
				const link = `${window.location.origin}${ROUTE_CONSTANTS.PUBLIC_FORM}${updated.publicToken}`;
				await navigator.clipboard?.writeText(link).catch(() => {});
				showSuccess("Public link turned on and copied to your clipboard.");
			}
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const handleCopyLink = async (form) => {
		const link = `${window.location.origin}${ROUTE_CONSTANTS.PUBLIC_FORM}${form.publicToken}`;
		await navigator.clipboard?.writeText(link).catch(() => {});
		showSuccess("Public link copied to your clipboard.");
	};

	const handleDelete = async (form) => {
		if (!window.confirm(`Delete "${form.title}"? This can't be undone.`)) {
			return;
		}
		try {
			await deleteForm({ variables: { formId: form.id } });
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	// Client-side, not a server duplicateForm mutation - createForm with this form's own fields,
	// dropping each field's `key` so the copy gets brand-new stable keys of its own (see
	// resolvers/forms.js's fieldsFromInput: an omitted key means a fresh crypto.randomUUID()) rather
	// than two forms silently sharing field identity.
	const handleDuplicate = async (form) => {
		try {
			const result = await createForm({
				variables: {
					input: {
						...(scope.shopId ? { shopId: scope.shopId } : {}),
						title: `${form.title} (Copy)`,
						description: form.description || "",
						fields: form.fields.map(({ type, label, helpText, required, options }) => ({
							type,
							label,
							helpText: helpText || "",
							required: Boolean(required),
							options: options || [],
						})),
					},
				},
			});
			await refetch();
			const newFormId = result.data?.createForm?.id;
			if (newFormId) {
				navigate(`${ROUTE_CONSTANTS.FORM}${newFormId}`);
			}
		} catch (err) {
			showError(err);
		}
	};

	return (
		<div className="formsPage">
			<div className="formsPageHeader">
				<h1>Forms</h1>
				<Button variant="contained" onClick={() => navigate(`${ROUTE_CONSTANTS.FORM}new`)}>
					New Form
				</Button>
			</div>
			<p className="settingsPanelHelp">
				Consent forms, waivers, and custom intake questionnaires - separate from Booking
				Requests, which keeps its own dedicated intake pipeline. Publish a form to start
				collecting responses, and turn on its public link to let anyone with the link submit
				without an account.
			</p>

			<div className="formsFilterBar">
				<button
					type="button"
					className={statusFilter === "" ? "formsFilterActive" : ""}
					onClick={() => {
						setStatusFilter("");
						setOffset(0);
					}}
				>
					All
				</button>
				{APP_SETTINGS_CONSTANTS.FORM_STATUSES.map((s) => (
					<button
						key={s.value}
						type="button"
						className={statusFilter === s.value ? "formsFilterActive" : ""}
						onClick={() => {
							setStatusFilter(s.value);
							setOffset(0);
						}}
					>
						{s.label}
					</button>
				))}
			</div>

			{loading ? (
				<IBPageLoader />
			) : forms.length === 0 ? (
				<p className="clientDashboardEmpty">No forms yet.</p>
			) : (
				<>
					<ul className="formsList">
						{forms.map((form) => (
							<li key={form.id} className="formRow">
								<div className="formRowMain">
									<RouterLink
										to={`${ROUTE_CONSTANTS.FORM}${form.id}`}
										className="formRowTitle"
									>
										{form.title}
									</RouterLink>
									<span className="formRowMeta">
										<Chip label={STATUS_LABEL[form.status] || form.status} size="small" />
										{" · "}
										{form.fields.length} field{form.fields.length === 1 ? "" : "s"}
										{form.allowGuestSubmissions ? " · Public link on" : ""}
										{" · created "}
										{moment(form.createdAt).format("MMM D, YYYY")}
									</span>
								</div>
								<div className="formRowActions">
									{form.status !== "published" && (
										<Button size="small" onClick={() => handlePublish(form)}>
											Publish
										</Button>
									)}
									{form.status === "published" && (
										<Button size="small" onClick={() => handleArchive(form)}>
											Archive
										</Button>
									)}
									<Button
										size="small"
										component={RouterLink}
										to={`${ROUTE_CONSTANTS.FORM}${form.id}/responses`}
									>
										Responses
									</Button>
									<Button size="small" onClick={() => handleToggleGuestAccess(form)}>
										{form.allowGuestSubmissions ? "Turn off link" : "Turn on link"}
									</Button>
									{form.allowGuestSubmissions && (
										<Button size="small" onClick={() => handleCopyLink(form)}>
											Copy link
										</Button>
									)}
									<Button size="small" onClick={() => handleDuplicate(form)}>
										Duplicate
									</Button>
									<Button size="small" color="error" onClick={() => handleDelete(form)}>
										Delete
									</Button>
								</div>
							</li>
						))}
					</ul>

					<EntityListPager
						pageInfo={data?.getForms?.pageInfo}
						onChange={setOffset}
						onPageSizeChange={(size) => {
							setPageSize(size);
							setOffset(0);
						}}
						noun="form"
					/>
				</>
			)}
		</div>
	);
};

export default Forms;
