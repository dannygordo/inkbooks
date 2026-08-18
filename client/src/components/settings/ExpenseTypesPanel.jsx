import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { Button, Chip } from "@mui/material";
import ExpenseService from "../../services/ExpenseService";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBInput from "../inputs/IBInput";
import FormField from "../formField/FormField";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { businessScopeFor, createScopeFor } from "../../utils/businessScope";

/**
 * The categories an expense can be logged against - "Rent", "Supplies". See
 * server/models/ExpenseType.js: owned by exactly this scope (a shop, or an independent artist's
 * own books - see businessScopeFor), never a shared platform vocabulary the way client flag types
 * are, since what a shop spends money on is exactly the thing this lets them define for
 * themselves.
 *
 * Deactivate rather than delete - see the model's own comment on why a type in use by an existing
 * Expense can't simply disappear.
 */
const ExpenseTypesPanel = () => {
	const { user, setAlert } = useAuth();
	const scope = businessScopeFor(user);
	const { data, loading, refetch } = ExpenseService.getExpenseTypes(scope, true);
	const [createType, { loading: creating }] = useMutation(ExpenseService.CREATE_EXPENSE_TYPE);
	const [updateType] = useMutation(ExpenseService.UPDATE_EXPENSE_TYPE);

	const [newName, setNewName] = useState("");
	const [newDescription, setNewDescription] = useState("");

	const showError = (err) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.ERROR,
			message: err.graphQLErrors?.[0]?.extensions?.errors?.name || err.message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};

	const handleAdd = async (e) => {
		e.preventDefault();
		if (!newName.trim()) {
			return;
		}
		try {
			await createType({
				variables: {
					input: { ...createScopeFor(user), name: newName.trim(), description: newDescription.trim() },
				},
			});
			setNewName("");
			setNewDescription("");
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const handleToggleActive = async (type) => {
		try {
			await updateType({ variables: { input: { expenseTypeId: type.id, active: !type.active } } });
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const types = data?.getExpenseTypes || [];

	return (
		<IBCardWrapper>
			<div>
				<h1>Expense Categories</h1>
				<p className="settingsPanelHelp">
					What an expense gets logged against - rent, supplies, insurance, whatever your
					business actually spends money on. Deactivating one stops it being offered for a
					new expense; anything already logged against it is unaffected.
				</p>
			</div>

			{!loading && types.length > 0 && (
				<ul className="businessTypeList">
					{types.map((type) => (
						<li key={type.id} className="businessTypeRow">
							<span className="businessTypeName">
								{type.name}
								{!type.active && (
									<Chip label="Inactive" size="small" sx={{ ml: 1 }} />
								)}
							</span>
							{type.description && (
								<span className="businessTypeDescription">{type.description}</span>
							)}
							<Button size="small" onClick={() => handleToggleActive(type)}>
								{type.active ? "Deactivate" : "Reactivate"}
							</Button>
						</li>
					))}
				</ul>
			)}
			{!loading && types.length === 0 && (
				<p className="clientDashboardEmpty">No expense categories yet.</p>
			)}

			<form className="businessTypeAddForm" onSubmit={handleAdd}>
				<FormField id="newExpenseTypeName" label="New category name">
					<IBInput
						id="newExpenseTypeName"
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="e.g. Rent"
					/>
				</FormField>
				<FormField id="newExpenseTypeDescription" label="Description (optional)">
					<IBInput
						id="newExpenseTypeDescription"
						value={newDescription}
						onChange={(e) => setNewDescription(e.target.value)}
					/>
				</FormField>
				<div className="settingsActions">
					<button type="submit" className="ibButton" disabled={creating || !newName.trim()}>
						{creating ? "Adding..." : "Add Category"}
					</button>
				</div>
			</form>
		</IBCardWrapper>
	);
};

export default ExpenseTypesPanel;
