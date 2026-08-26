import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { Link as RouterLink } from "react-router-dom";
import { Button } from "@mui/material";
import moment from "moment";
import IncomeService from "../../services/IncomeService";
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
import "./income.css";

const PAGE_SIZE = 25;

/**
 * Non-tattoo income - the income-side mirror of pages/expenses/Expenses.jsx. Tattoo income isn't
 * logged here at all; it's derived automatically from completed appointments (see
 * server/utils/analytics.js's revenueCents) and shows on the dashboard. This page is for
 * everything else a shop or independent artist takes in - merch, a walk-in supply resale,
 * whatever doesn't come through the appointment flow. No recurring counterpart exists on the
 * income side (see server/models/RecurringExpense.js's own comment on why this feature stopped at
 * expenses).
 */
const Income = () => {
	const { user, setAlert } = useAuth();
	const scope = businessScopeFor(user);

	const [range, setRange] = useState(getDefaultRange());
	const [offset, setOffset] = useState(0);
	const [pageSize, setPageSize] = useState(PAGE_SIZE);
	const [editingId, setEditingId] = useState(null);
	const [editDraft, setEditDraft] = useState(null);

	const { data: typesData } = IncomeService.getIncomeTypes(scope, false);
	const { data, loading, refetch } = IncomeService.getIncomes(
		scope,
		{ start: range.start, end: range.end },
		{ limit: pageSize, offset }
	);
	const [recordIncome, { loading: recording }] = useMutation(IncomeService.RECORD_INCOME);
	const [updateIncome] = useMutation(IncomeService.UPDATE_INCOME);
	const [deleteIncome] = useMutation(IncomeService.DELETE_INCOME);

	const incomeTypes = typesData?.getIncomeTypes || [];
	const incomes = data?.getIncomes?.items || [];
	// IBSelect's own {value, label} shape, not the {id, name} GraphQL returns - one mapping here
	// rather than at each of the two call sites below.
	const incomeTypeOptions = incomeTypes.map((type) => ({ value: type.id, label: type.name }));

	const [incomeTypeId, setIncomeTypeId] = useState("");
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
		if (!incomeTypeId || amountCents <= 0) {
			return;
		}
		try {
			await recordIncome({
				variables: {
					input: {
						...createScopeFor(user),
						incomeTypeId,
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
			incomeTypeId: item.incomeTypeId,
			amountDollars: String(centsToDollars(item.amountCents)),
			description: item.description || "",
			// A pure calendar date (an <input type="date"> value stored as UTC midnight), not a
			// timestamped instant - see FormResponses.jsx's formatAnswer for the canonical
			// explanation of this exact pattern.
			date: moment.utc(item.date).format("YYYY-MM-DD"), // utc-ok: income date is a pure calendar date, see comment above
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
			await updateIncome({
				variables: {
					input: {
						incomeId: item.id,
						incomeTypeId: editDraft.incomeTypeId,
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
		if (!window.confirm("Delete this income entry? This can't be undone.")) {
			return;
		}
		try {
			await deleteIncome({ variables: { incomeId: item.id } });
			await refetch();
		} catch (err) {
			showError(err);
		}
	};

	const totalCents = incomes.reduce((sum, item) => sum + item.amountCents, 0);

	return (
		<div className="businessLedgerPage">
			<h1 className="businessLedgerTitle">Other Income</h1>
			{/* <RouterLink to={ROUTE_CONSTANTS.EXPENSES} className="businessLedgerCrossLink">
				View expenses →
			</RouterLink> */}
			<p className="settingsPanelHelp">
				Income that isn't tattoo work - tattoo revenue is tracked automatically from completed
				appointments and shows on the dashboard. Categories are managed under Settings &gt;
				Income.
			</p>

			{/* The entry controls - everything needed to log a new income entry, in one form, above
			    the list below rather than after it, so logging one doesn't require scrolling past
			    a range's worth of history first. */}
			<form className="businessEntryForm" onSubmit={handleAdd}>
				<div className="businessEntryFormRow">
					{/* IBSelect renders its own label (a floating MUI label, not FormField's
					    label-above-control), so it isn't FormField-wrapped like its two siblings
					    here - see components/inputs/IBSelect.jsx. */}
					<FormField id="newCategory" label="Category">
					<IBSelect
						id="newIncomeType"
						data={incomeTypeOptions}
						label="Category"
						selectedVal={incomeTypeId}
						onChange={(e) => setIncomeTypeId(e.target.value)}
					/>
					</FormField>
					<FormField id="newIncomeAmount" label="Amount $">
						<IBInput
							id="newIncomeAmount"
							type="number"
							value={amountDollars}
							onChange={(e) => setAmountDollars(e.target.value)}
						/>
					</FormField>
					<FormField id="newIncomeDate" label="Date">
						<IBInput
							id="newIncomeDate"
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
						/>
					</FormField>
				</div>
				<FormField id="newIncomeDescription" label="Description (optional)">
					<IBInput
						id="newIncomeDescription"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</FormField>
				<div className="settingsActions">
					<button
						type="submit"
						className="ibButton"
						disabled={recording || !incomeTypeId || dollarsToCents(amountDollars) <= 0}
					>
						{recording ? "Logging..." : "Log Income"}
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
					{incomes.length > 0 && (
						<div className="businessLedgerSummary">
							Total shown: {formatCents(totalCents)}
						</div>
					)}

					{incomes.length === 0 ? (
						<p className="clientDashboardEmpty">No other income logged in this range.</p>
					) : (
						<ul className="businessLedgerList">
							{incomes.map((item) => (
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
													id={`editIncomeType-${item.id}`}
													data={incomeTypeOptions}
													label="Category"
													selectedVal={editDraft.incomeTypeId}
													onChange={(e) =>
														setEditDraft((d) => ({ ...d, incomeTypeId: e.target.value }))
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
													{item.incomeType?.name || "Uncategorized"}
												</span>
												{item.description && (
													<span className="businessLedgerDescription">
														{item.description}
													</span>
												)}
												<span className="businessLedgerMeta">
													{moment.utc(item.date).format("MMM D, YYYY")}{/* utc-ok: pure calendar date, see startEdit above */}
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
						pageInfo={data?.getIncomes?.pageInfo}
						onChange={setOffset}
						onPageSizeChange={(size) => {
							setPageSize(size);
							setOffset(0);
						}}
						noun="entry"
					/>
				</>
			)}
		</div>
	);
};

export default Income;
