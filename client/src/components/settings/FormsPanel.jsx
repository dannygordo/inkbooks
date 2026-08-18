import React from "react";
import { Link as RouterLink } from "react-router-dom";
import { Button } from "@mui/material";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import { ROUTE_CONSTANTS } from "../../constants";

/**
 * Unlike ExpenseTypesPanel/IncomeTypesPanel (which manage a small vocabulary INLINE, right here in
 * Settings), a form's own fields are too much to build in a settings panel - see pages/forms/
 * FormBuilder.jsx. This panel is just the on-ramp: a summary card pointing at the real
 * management page (/forms, gated the same way - see settingsCategories.jsx's own hasAuditAuthority
 * check for this category), matching how Settings > Expenses/Income both point at their own
 * full ledger pages (/expenses, /income) for the actual day-to-day work too.
 */
const FormsPanel = () => (
	<IBCardWrapper>
		<h1>Forms</h1>
		<p className="settingsPanelHelp">
			Consent forms, waivers, and custom intake questionnaires - separate from Booking
			Requests. Build a form, publish it, and optionally turn on a public link so anyone can
			submit a response without an account.
		</p>
		<div className="settingsActions">
			<Button variant="contained" component={RouterLink} to={ROUTE_CONSTANTS.FORMS}>
				Manage Forms
			</Button>
		</div>
	</IBCardWrapper>
);

export default FormsPanel;
