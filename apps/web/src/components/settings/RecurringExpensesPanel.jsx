import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { Button, Chip } from "@mui/material";
import moment from "moment";
import ExpenseService from "../../services/ExpenseService";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBInput from "../inputs/IBInput";
import FormField from "../formField/FormField";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { businessScopeFor, createScopeFor } from "../../utils/businessScope";
import { formatCents, dollarsToCents } from "../../utils/money";

const FREQUENCY_LABELS = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

/**
 * Recurring expenses - rent, a monthly subscription, anything on a schedule. See
 * server/models/RecurringExpense.js for the full design: this is a TEMPLATE. The real ledger rows
 * (visible on the Expenses page, not here) are generated automatically by a scheduled job as each
 * occurrence comes due - creating one here does not immediately log an expense.
 *
 * Deleting a template here only stops FUTURE generation - every occurrence it already wrote is a
 * real, independent Expense row and is untouched. Pausing (the Deactivate button) does the same
 * thing without discarding the template itself, for "we're not paying this right now but will be
 * again" versus "this was a mistake."
 */
const RecurringExpensesPanel = () => {
	const { user, setAlert } = useAuth();
	const scope = businessScopeFor(user);
	const { data: typesData } = ExpenseService.getExpenseTypes(scope, false);
	const { data, loading, refetch } = ExpenseService.getRecurringExpenses(scope, true);
	const [createRecurring, { loading: creating }] = useMutation(
		ExpenseService.CREATE_RECURRING_EXPENSE
	);
	const [updateRecurring] = useMutation(ExpenseService.UPDATE_RECURRING_EXPENSE);
	const [deleteRecurring] = useMutation(ExpenseService.DELETE_RECURRING_EXPENSE);

	const [expenseTypeId, setExpenseTypeId] = useState("");
	const [amountDollars, setAmountDollars] = useState("");
	const [description, setDescription] = useState("");
	const [frequency, setFrequency] = useState("monthly");
	const [startDate, setStartDate] = useState(() => moment().format("YYYY-MM-DD"));
	const [endDate, setEndDate] = useState("");

	const expenseTypes = typesData?.getExpenseTypes || [];
	const recurring = data?.getRecurringExpenses || [];

	const showError = (err) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.ERROR,
			message: err.graphQLErrors?.[0]?.message || err.message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};

	const handleAdd = async (e) => {
		e.preventDefault();
		const amountCents = dollarsToCents(amountDollars);
		if (!expenseTypeId || amountCents <= 0) {
			return;
		}
		try {
			await createRecurring({
				variables: {
					input: {
						...createScopeFor(user),
						expenseTypeId,
						amountCents,
						description: description.trim(),
						frequency,
						startDate: moment(startDate, "YYYY-MM-DD").toISOString(),
						endDate: endDate ? moment(endDate, "YYYY-MM-DD").toISOString() : null,
					},
				},
			});
			setAmountDollars("");
			setDescription("");
			setEndDate("");
			await refetch();
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message:
					"Recurring expense set up. The first entry appears on the Expenses page once it's due.",
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		} catch (err) {
			showError(err);
		}
	};

	const handleToggleActive = async (item) => {
		try {
			await updateRecurring({
				variables: { input: { recurringExpenseId: item.id, active: !item.active } },
			});
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const handleDelete = async (item) => {
		if (!window.confirm("Delete this recurring expense? Entries it already generated are kept.")) {
			return;
		}
		try {
			await deleteRecurring({ variables: { recurringExpenseId: item.id } });
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	return (
		<IBCardWrapper>
			<div>
				<h1>Recurring Expenses</h1>
				<p className="settingsPanelHelp">
					Rent, a subscription, anything on a schedule. A real expense entry is generated
					automatically each time one comes due - if an amount changes for one occurrence
					(a utility bill, say), edit that entry directly on the Expenses page rather than
					here; this only changes the template going forward.
				</p>
			</div>

			{!loading && recurring.length > 0 && (
				<ul className="businessTypeList">
					{recurring.map((item) => (
						<li key={item.id} className="recurringExpenseRow">
							<div className="recurringExpenseMain">
								<span className="businessTypeName">
									{item.expenseType?.name || "Unknown category"} —{" "}
									{formatCents(item.amountCents)} / {FREQUENCY_LABELS[item.frequency]}
									{!item.active && <Chip label="Paused" size="small" sx={{ ml: 1 }} />}
								</span>
								{item.description && (
									<span className="businessTypeDescription">{item.description}</span>
								)}
								<span className="recurringExpenseMeta">
									{/* moment.utc, not moment - nextRunDate/endDate are pure calendar dates (see
									   startDate/endDate above, sent as local-midnight-converted-to-UTC via
									   moment(dateStr, "YYYY-MM-DD").toISOString()), with no time-of-day meaning.
									   nextRunDate in particular is computed server-side, not round-tripped through
									   this same browser, so nothing guarantees the viewer is in the timezone that
									   produced its UTC-midnight value - parsing it in local time instead rolls it
									   back a day for anyone west of UTC (see FormResponses.jsx's formatAnswer for
									   the same bug on a different pure-calendar-date field). */}
									Next: {moment.utc(item.nextRunDate).format("MMM D, YYYY")}{/* utc-ok: nextRunDate is a pure calendar date, see comment above */}
									{item.endDate ? ` · Ends ${moment.utc(item.endDate).format("MMM D, YYYY")}` : ""}{/* utc-ok: endDate is the same pure calendar date as nextRunDate above */}
								</span>
							</div>
							<div className="recurringExpenseActions">
								<Button size="small" onClick={() => handleToggleActive(item)}>
									{item.active ? "Pause" : "Resume"}
								</Button>
								<Button size="small" color="error" onClick={() => handleDelete(item)}>
									Delete
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
			{!loading && recurring.length === 0 && (
				<p className="clientDashboardEmpty">No recurring expenses set up yet.</p>
			)}

			<form className="businessTypeAddForm" onSubmit={handleAdd}>
				<FormField id="recurringExpenseType" label="Category">
					<select
						id="recurringExpenseType"
						className="clientDashboardFlagTypeSelect"
						value={expenseTypeId}
						onChange={(e) => setExpenseTypeId(e.target.value)}
					>
						<option value="">Select a category...</option>
						{expenseTypes.map((type) => (
							<option key={type.id} value={type.id}>
								{type.name}
							</option>
						))}
					</select>
				</FormField>
				<FormField id="recurringExpenseAmount" label="Amount $">
					<IBInput
						id="recurringExpenseAmount"
						type="number"
						value={amountDollars}
						onChange={(e) => setAmountDollars(e.target.value)}
					/>
				</FormField>
				<FormField id="recurringExpenseFrequency" label="Frequency">
					<select
						id="recurringExpenseFrequency"
						className="clientDashboardFlagTypeSelect"
						value={frequency}
						onChange={(e) => setFrequency(e.target.value)}
					>
						<option value="weekly">Weekly</option>
						<option value="monthly">Monthly</option>
						<option value="yearly">Yearly</option>
					</select>
				</FormField>
				<FormField id="recurringExpenseStart" label="First occurrence">
					<input
						id="recurringExpenseStart"
						type="date"
						value={startDate}
						onChange={(e) => setStartDate(e.target.value)}
					/>
				</FormField>
				<FormField id="recurringExpenseEnd" label="Ends (optional)">
					<input
						id="recurringExpenseEnd"
						type="date"
						value={endDate}
						onChange={(e) => setEndDate(e.target.value)}
					/>
				</FormField>
				<FormField id="recurringExpenseDescription" label="Description (optional)">
					<IBInput
						id="recurringExpenseDescription"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</FormField>
				<div className="settingsActions">
					<button
						type="submit"
						className="ibButton"
						disabled={creating || !expenseTypeId || dollarsToCents(amountDollars) <= 0}
					>
						{creating ? "Adding..." : "Add Recurring Expense"}
					</button>
				</div>
			</form>
		</IBCardWrapper>
	);
};

export default RecurringExpensesPanel;
