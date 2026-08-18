import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { Button, Chip } from "@mui/material";
import IncomeService from "../../services/IncomeService";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBInput from "../inputs/IBInput";
import FormField from "../formField/FormField";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { businessScopeFor, createScopeFor } from "../../utils/businessScope";

/**
 * The categories non-tattoo income gets logged against - "Retail/Merch", "Piercing". See
 * server/models/IncomeType.js and ExpenseTypesPanel.jsx, which this mirrors exactly for the
 * income side of the same feature.
 */
const IncomeTypesPanel = () => {
	const { user, setAlert } = useAuth();
	const scope = businessScopeFor(user);
	const { data, loading, refetch } = IncomeService.getIncomeTypes(scope, true);
	const [createType, { loading: creating }] = useMutation(IncomeService.CREATE_INCOME_TYPE);
	const [updateType] = useMutation(IncomeService.UPDATE_INCOME_TYPE);

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
			await updateType({ variables: { input: { incomeTypeId: type.id, active: !type.active } } });
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const types = data?.getIncomeTypes || [];

	return (
		<IBCardWrapper>
			<div>
				<h1>Income Categories</h1>
				<p className="settingsPanelHelp">
					What non-tattoo income gets logged against - retail sales, piercing, booth rent
					collected, anything that isn't a tattoo session's own charge.
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
				<p className="clientDashboardEmpty">No income categories yet.</p>
			)}

			<form className="businessTypeAddForm" onSubmit={handleAdd}>
				<FormField id="newIncomeTypeName" label="New category name">
					<IBInput
						id="newIncomeTypeName"
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="e.g. Retail/Merch"
					/>
				</FormField>
				<FormField id="newIncomeTypeDescription" label="Description (optional)">
					<IBInput
						id="newIncomeTypeDescription"
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

export default IncomeTypesPanel;
