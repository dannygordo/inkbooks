import React, { useState } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import moment from "moment";
import FormService from "../../services/FormService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import EntityListPager from "../../components/entityList/EntityListPager";
import { ROUTE_CONSTANTS } from "../../constants";
import "./forms.css";

const PAGE_SIZE = 25;

const SOURCE_LABEL = {
	staff_entered: "Entered by staff",
	client_authenticated: "Client (signed in)",
	guest_public: "Guest (public link)",
};

// Renders one answer against its response's own fieldsSnapshot - see models/FormResponse.js's own
// header comment on why this NEVER resolves against the live Form: a field's wording/options may
// have changed since this was submitted, and a signed waiver has to keep meaning what it meant the
// day it was signed.
const formatAnswer = (field, answer) => {
	if (!answer) {
		return "—";
	}
	switch (field.type) {
		case "short_text":
		case "paragraph":
			return answer.textValue || "—";
		case "single_choice":
		case "multi_choice":
			return (answer.selectedOptions || []).join(", ") || "—";
		case "date":
			return answer.dateValue ? moment(answer.dateValue).format("MMM D, YYYY") : "—";
		case "file_upload":
			return (answer.fileUrls || []).length > 0 ? (
				<>
					{answer.fileUrls.map((url) => (
						<a key={url} href={url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
							{url.split("/").pop()}
						</a>
					))}
				</>
			) : (
				"—"
			);
		case "signature":
			return answer.signature?.signedName
				? `Signed "${answer.signature.signedName}" on ${moment(answer.signature.signedAt).format(
						"MMM D, YYYY h:mma"
				  )}`
				: "—";
		default:
			return "—";
	}
};

/**
 * Task #148 - a form's submitted responses (paginated, linking to the client where there is one)
 * plus a per-field analytics breakdown driven by getFormAnalytics. Two independent server calls,
 * shown on one page - getFormAnalytics is deliberately modest (see resolvers/forms.js's own
 * comment: per-field breakdown reads the LIVE form.fields, not each response's own snapshot, so a
 * since-deleted question won't get its own analytics row even though old responses still hold that
 * answer - visible below in the raw response list, which DOES read each response's own
 * fieldsSnapshot).
 */
const FormResponses = () => {
	const { formId } = useParams();
	const [offset, setOffset] = useState(0);
	const [pageSize, setPageSize] = useState(PAGE_SIZE);
	const [expandedId, setExpandedId] = useState(null);

	const { data: formData } = FormService.getForm(formId);
	const { data, loading } = FormService.getFormResponses(formId, { limit: pageSize, offset });
	const { data: analyticsData, loading: analyticsLoading } = FormService.getFormAnalytics(formId);

	const form = formData?.getForm;
	const responses = data?.getFormResponses?.items || [];
	const analytics = analyticsData?.getFormAnalytics;

	return (
		<div className="formResponsesPage">
			<div className="formsPageHeader">
				<h1>{form ? `Responses - ${form.title}` : "Responses"}</h1>
				<RouterLink to={`${ROUTE_CONSTANTS.FORM}${formId}`}>Back to form</RouterLink>
			</div>

			{!analyticsLoading && analytics && (
				<>
					<div className="formResponsesSummary">
						<div className="formResponsesStatCard">
							<div className="formResponsesStatLabel">Total responses</div>
							<div className="formResponsesStatValue">{analytics.totalResponses}</div>
						</div>
					</div>

					{analytics.fields.length > 0 && (
						<div className="formAnalyticsFields">
							{analytics.fields.map((field) => (
								<div className="formAnalyticsFieldRow" key={field.fieldKey}>
									<div className="formAnalyticsFieldLabel">{field.label}</div>
									<div className="formRowMeta">
										{field.answeredCount} of {analytics.totalResponses} answered
									</div>
									{field.optionCounts.length > 0 &&
										field.optionCounts.map((oc) => {
											const pct = analytics.totalResponses
												? Math.round((oc.count / analytics.totalResponses) * 100)
												: 0;
											return (
												<div className="formAnalyticsOptionBar" key={oc.option}>
													<span>{oc.option}</span>
													<div className="formAnalyticsOptionBarTrack">
														<div
															className="formAnalyticsOptionBarFill"
															style={{ width: `${pct}%` }}
														/>
													</div>
													<span>{oc.count}</span>
												</div>
											);
										})}
								</div>
							))}
						</div>
					)}
				</>
			)}

			<h2 className="clientDashboardSectionTitle">All Responses</h2>
			{loading ? (
				<IBPageLoader />
			) : responses.length === 0 ? (
				<p className="clientDashboardEmpty">No responses yet.</p>
			) : (
				<>
					{responses.map((response) => {
						const answerByKey = Object.fromEntries(
							response.answers.map((a) => [a.fieldKey, a])
						);
						const expanded = expandedId === response.id;
						return (
							<div className="formResponseRow" key={response.id}>
								<div className="formResponseRowHeader">
									<div>
										<strong>
											{response.client
												? `${response.client.firstName} ${response.client.lastName}`
												: "Unknown client"}
										</strong>
										<div className="formRowMeta">
											{SOURCE_LABEL[response.source] || response.source}
											{" · "}
											{moment(response.createdAt).format("MMM D, YYYY h:mma")}
										</div>
									</div>
									<button
										type="button"
										className="ibButtonSecondary"
										onClick={() => setExpandedId(expanded ? null : response.id)}
									>
										{expanded ? "Hide answers" : "View answers"}
									</button>
								</div>
								{expanded && (
									<div className="formResponseAnswerList">
										{response.fieldsSnapshot.map((field) => (
											<div key={field.key}>
												<div className="formResponseAnswerQuestion">{field.label}</div>
												<div>{formatAnswer(field, answerByKey[field.key])}</div>
											</div>
										))}
									</div>
								)}
							</div>
						);
					})}

					<EntityListPager
						pageInfo={data?.getFormResponses?.pageInfo}
						onChange={setOffset}
						onPageSizeChange={(size) => {
							setPageSize(size);
							setOffset(0);
						}}
						noun="response"
					/>
				</>
			)}
		</div>
	);
};

export default FormResponses;
