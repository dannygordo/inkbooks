import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { Link as RouterLink } from "react-router-dom";
import { Button, Chip } from "@mui/material";
import moment from "moment";
import ExpenseService from "../../services/ExpenseService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import EntityListPager from "../../components/entityList/EntityListPager";
import DateRangePicker from "../../components/analytics/DateRangePicker";
import IBInput from "../../components/inputs/IBInput";
import IBSelect from "../../components/inputs/IBSelect";
import FormField from "../../components/formField/FormField";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
import { businessScopeFor, createScopeFor } from "../../utils/businessScope";
import { formatCents, dollarsToCents, centsToDollars } from "../../utils/money";
import { getDefaultRange } from "../../utils/dateRanges";
import "./expenses.css";

const PAGE_SIZE = 25;

/**
 * The real expense ledger - every entry logged against this shop's (or independent artist's) own
 * books, scoped and range-filtered the same way the analytics dashboard is (see DateRangePicker,
 * shared with ArtistPerformancePanel so "this month" means the same window everywhere).
 *
 * Categories are managed on the Settings > Expenses page (ExpenseTypesPanel), not here - this page
 * only offers the ones already set up there. Recurring expenses (RecurringExpensesPanel, also on
 * Settings > Expenses) are TEMPLATES; a real row here tagged with a "Recurring" chip is what one of
 * those templates actually generated. Editing or deleting that row only affects this one
 * occurrence - see RecurringExpensesPanel's own comment on why the template is untouched by that.
 */
const Expenses = () => {
	const { user, setAlert } = useAuth();
	const scope = businessScopeFor(user);

	const [range, setRange] = useState(getDefaultRange());
	const [offset, setOffset] = useState(0);
	const [pageSize, setPageSize] = useState(PAGE_SIZE);
	const [editingId, setEditingId] = useState(null);
	const [editDraft, setEditDraft] = useState(null);

	const { data: typesData } = ExpenseService.getExpenseTypes(scope, false);
	const { data, loading, refetch } = ExpenseService.getExpenses(
		scope,
		{ start: range.start, end: range.end },
		{ limit: pageSize, offset }
	);
	const [recordExpense, { loading: recording }] = useMutation(ExpenseService.RECORD_EXPENSE);
	const [updateExpense] = useMutation(ExpenseService.UPDATE_EXPENSE);
	const [deleteExpense] = useMutation(ExpenseService.DELETE_EXPENSE);

	const expenseTypes = typesData?.getExpenseTypes || [];
	const expenses = data?.getExpenses?.items || [];
	// IBSelect's own {value, label} shape, not the {id, name} GraphQL returns - one mapping here
	// rather than at each of the two call sites below.
	const expenseTypeOptions = expenseTypes.map((type) => ({ value: type.id, label: type.name }));

	const [expenseTypeId, setExpenseTypeId] = useState("");
	const [amountDollars, setAmountDollars] = useState("");
	const [description, setDescription] = useState("");
	const [date, setDate] = useState(() => moment().format("YYYY-MM-DD"));

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
			await recordExpense({
				variables: {
					input: {
						...createScopeFor(user),
						expenseTypeId,
						amountCents,
						description: description.trim(),
						date: moment(date, "YYYY-MM-DD").toISOString(),
					},
				},
			});
			setAmountDollars("");
			setDescription("");
			setDate(moment().format("YYYY-MM-DD"));
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const startEdit = (item) => {
		setEditingId(item.id);
		setEditDraft({
			expenseTypeId: item.expenseTypeId,
			amountDollars: String(centsToDollars(item.amountCents)),
			description: item.description || "",
			date: moment(item.date).format("YYYY-MM-DD"),
		});
	};

	const cancelEdit = () => {
		setEditingId(null);
		setEditDraft(null);
	};

	const saveEdit = async (item) => {
		const amountCents = dollarsToCents(editDraft.amountDollars);
		if (amountCents <= 0) {
			return;
		}
		try {
			await updateExpense({
				variables: {
					input: {
						expenseId: item.id,
						expenseTypeId: editDraft.expenseTypeId,
						amountCents,
						description: editDraft.description.trim(),
						date: moment(editDraft.date, "YYYY-MM-DD").toISOString(),
					},
				},
			});
			cancelEdit();
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const handleDelete = async (item) => {
		if (!window.confirm("Delete this expense entry? This can't be undone.")) {
			return;
		}
		try {
			await deleteExpense({ variables: { expenseId: item.id } });
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const totalCents = expenses.reduce((sum, item) => sum + item.amountCents, 0);

	return (
		<div className="businessLedgerPage">
			<h1 className="businessLedgerTitle">Expenses</h1>
			{/* Expenses and Income are separate sections now (their own sidebar links, their own
			    Settings categories) - this is just a convenience shortcut between the two, not
			    standing in for a missing nav entry. */}
			{/* <RouterLink to={ROUTE_CONSTANTS.INCOME} className="businessLedgerCrossLink">
				View other income →
			</RouterLink> */}
			<p className="settingsPanelHelp">
				Categories are managed under Settings &gt; Expenses, which is also where recurring
				expenses (rent, subscriptions) are set up - the entries they generate show up here
				automatically as they come due, tagged "Recurring".
			</p>

			{/* The entry controls - everything needed to log a new expense, in one form, above the
			    list below rather than after it, so logging one doesn't require scrolling past a
			    range's worth of history first. */}
			<form className="businessEntryForm" onSubmit={handleAdd}>
				<div className="businessEntryFormRow">
					{/* IBSelect renders its own label (a floating MUI label, not FormField's
					    label-above-control), so it isn't FormField-wrapped like its two siblings
					    here - see components/inputs/IBSelect.jsx. */}
					<FormField id="newCategory" label="Category">
						<IBSelect
						id="newExpenseType"
						data={expenseTypeOptions}
						label="Category"
						selectedVal={expenseTypeId}
						onChange={(e) => setExpenseTypeId(e.target.value)}
					/>
					</FormField>
					<FormField id="newExpenseAmount" label="Amount $">
						<IBInput
							id="newExpenseAmount"
							type="number"
							value={amountDollars}
							onChange={(e) => setAmountDollars(e.target.value)}
						/>
					</FormField>
					<FormField id="newExpenseDate" label="Date">
						<IBInput
							id="newExpenseDate"
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
						/>
					</FormField>
				</div>
				<FormField id="newExpenseDescription" label="Description (optional)">
					<IBInput
						id="newExpenseDescription"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</FormField>
				<div className="settingsActions">
					<button
						type="submit"
						className="ibButton"
						disabled={recording || !expenseTypeId || dollarsToCents(amountDollars) <= 0}
					>
						{recording ? "Logging..." : "Log Expense"}
					</button>
				</div>
			</form>

			<DateRangePicker
				value={range}
				onChange={(r) => {
					setRange(r);
					setOffset(0);
				}}
			/>

			{loading ? (
				<IBPageLoader />
			) : (
				<>
					{expenses.length > 0 && (
						<div className="businessLedgerSummary">
							Total shown: {formatCents(totalCents)}
						</div>
					)}

					{expenses.length === 0 ? (
						<p className="clientDashboardEmpty">No expenses logged in this range.</p>
					) : (
						<ul className="businessLedgerList">
							{expenses.map((item) => (
								<li key={item.id} className="businessLedgerRow">
									{editingId === item.id ? (
										<form
											className="businessLedgerEditForm"
											onSubmit={(e) => {
												e.preventDefault();
												saveEdit(item);
											}}
										>
											<div className="businessLedgerEditRow">
												<IBSelect
													id={`editExpenseType-${item.id}`}
													data={expenseTypeOptions}
													label="Category"
													selectedVal={editDraft.expenseTypeId}
													onChange={(e) =>
														setEditDraft((d) => ({ ...d, expenseTypeId: e.target.value }))
													}
												/>
												<IBInput
													type="number"
													value={editDraft.amountDollars}
													onChange={(e) =>
														setEditDraft((d) => ({ ...d, amountDollars: e.target.value }))
													}
												/>
												<IBInput
													type="date"
													value={editDraft.date}
													onChange={(e) =>
														setEditDraft((d) => ({ ...d, date: e.target.value }))
													}
												/>
											</div>
											<IBInput
												value={editDraft.description}
												onChange={(e) =>
													setEditDraft((d) => ({ ...d, description: e.target.value }))
												}
												placeholder="Description"
											/>
											<div className="businessLedgerRowActions">
												<Button size="small" type="submit">
													Save
												</Button>
												<Button size="small" onClick={cancelEdit}>
													Cancel
												</Button>
											</div>
										</form>
									) : (
										<>
											<div className="businessLedgerMain">
												<span className="businessLedgerAmount">
													{formatCents(item.amountCents)}
												</span>
												<span className="businessLedgerCategory">
													{item.expenseType?.name || "Uncategorized"}
												</span>
												{item.recurringExpenseId && (
													<Chip label="Recurring" size="small" sx={{ ml: 1 }} />
												)}
												{item.description && (
													<span className="businessLedgerDescription">
														{item.description}
													</span>
												)}
												<span className="businessLedgerMeta">
													{moment(item.date).format("MMM D, YYYY")}
													{item.createdBy
														? ` · logged by ${item.createdBy.firstName} ${item.createdBy.lastName}`
														: ""}
												</span>
											</div>
											<div className="businessLedgerRowActions">
												<Button size="small" onClick={() => startEdit(item)}>
													Edit
												</Button>
												<Button size="small" color="error" onClick={() => handleDelete(item)}>
													Delete
												</Button>
											</div>
										</>
									)}
								</li>
							))}
						</ul>
					)}

					<EntityListPager
						pageInfo={data?.getExpenses?.pageInfo}
						onChange={setOffset}
						onPageSizeChange={(size) => {
							setPageSize(size);
							setOffset(0);
						}}
						noun="expense"
					/>
				</>
			)}
		</div>
	);
};

export default Expenses;
