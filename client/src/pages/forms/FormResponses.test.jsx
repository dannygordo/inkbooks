// FormResponses.jsx tests - a form's submitted responses plus a per-field analytics breakdown.
// Three independent queries back this page (FormService.getForm, getFormResponses,
// getFormAnalytics - see the component's own header comment on why getFormAnalytics is
// deliberately modest, reading the LIVE form.fields rather than each response's own
// fieldsSnapshot). getForm's document is exported directly as FormService.FETCH_FORM; getForm
// Responses/getFormAnalytics build their gql documents INSIDE the hook function and never export
// them (same as FormService's own getMyFormLinks - see FormsPanel.test.jsx's own comment on this
// convention), so those two are reconstructed here verbatim from FormService.js's own
// _FORM_RESPONSE_FIELDS / _FETCH_FORM_ANALYTICS. If either drifts from this copy, the mock stops
// matching and the affected test fails loudly with Apollo's "no matching mock" error rather than
// passing on stale data.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { gql } from "@apollo/client";
import FormResponses from "./FormResponses";
import FormService from "../../services/FormService";

const FORM_ID = "form-1";

const GET_FORM_RESPONSES = gql`
	query GetFormResponses($formId: ID!, $page: PageInput) {
		getFormResponses(formId: $formId, page: $page) {
			items {
				id
				formId
				shopId
				artistUserId
				formTitle
				fieldsSnapshot {
					key
					type
					label
					helpText
					required
					options
				}
				clientId
				client {
					id
					firstName
					lastName
				}
				answers {
					fieldKey
					textValue
					selectedOptions
					dateValue
					fileUrls
					signature {
						signedName
						signedAt
					}
				}
				submittedByUserId
				submittedBy {
					id
					firstName
					lastName
				}
				submitterIp
				source
				createdAt
			}
			pageInfo { totalCount hasMore limit offset }
		}
	}
`;

const GET_FORM_ANALYTICS = gql`
	query GetFormAnalytics($formId: ID!) {
		getFormAnalytics(formId: $formId) {
			formId
			totalResponses
			responsesByDay {
				date
				count
			}
			fields {
				fieldKey
				label
				type
				answeredCount
				optionCounts {
					option
					count
				}
			}
		}
	}
`;

function baseForm(overrides = {}) {
	return {
		__typename: "Form",
		id: FORM_ID,
		shopId: "shop-1",
		artistUserId: null,
		title: "Tattoo Consent Form",
		description: "",
		status: "published",
		allowGuestSubmissions: true,
		publicToken: "tok-abc",
		slug: null,
		shopUseOnly: false,
		systemKey: null,
		fields: [
			{
				__typename: "FormField",
				key: "allergies",
				type: "short_text",
				label: "Any allergies?",
				helpText: null,
				required: true,
				options: [],
				hidden: false,
			},
		],
		createdByUserId: "user-1",
		createdBy: { __typename: "User", id: "user-1", firstName: "Gendry", lastName: "Baratheon" },
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function getFormMock(form = baseForm()) {
	return {
		request: { query: FormService.FETCH_FORM, variables: { formId: FORM_ID } },
		result: { data: { getForm: form } },
	};
}

// page defaults to FormResponses.jsx's own PAGE_SIZE (25) / initial offset (0).
function responsesMock({ page = { limit: 25, offset: 0 }, items = [], pageInfoOverrides = {} } = {}) {
	return {
		request: { query: GET_FORM_RESPONSES, variables: { formId: FORM_ID, page } },
		result: {
			data: {
				getFormResponses: {
					__typename: "FormResponsePage",
					items,
					pageInfo: {
						__typename: "PageInfo",
						totalCount: items.length,
						hasMore: false,
						limit: page.limit,
						offset: page.offset,
						...pageInfoOverrides,
					},
				},
			},
		},
	};
}

function analyticsMock(analytics) {
	return {
		request: { query: GET_FORM_ANALYTICS, variables: { formId: FORM_ID } },
		result: { data: { getFormAnalytics: analytics } },
	};
}

function emptyAnalytics(overrides = {}) {
	return {
		__typename: "FormAnalytics",
		formId: FORM_ID,
		totalResponses: 0,
		responsesByDay: [],
		fields: [],
		...overrides,
	};
}

function response(overrides = {}) {
	return {
		__typename: "FormResponse",
		id: "resp-1",
		formId: FORM_ID,
		shopId: "shop-1",
		artistUserId: null,
		formTitle: "Tattoo Consent Form",
		fieldsSnapshot: [
			{
				__typename: "FormField",
				key: "allergies",
				type: "short_text",
				label: "Any allergies?",
				helpText: null,
				required: true,
				options: [],
			},
		],
		clientId: "client-1",
		client: { __typename: "Client", id: "client-1", firstName: "Arya", lastName: "Stark" },
		answers: [
			{
				__typename: "FormAnswer",
				fieldKey: "allergies",
				textValue: "None",
				selectedOptions: [],
				dateValue: null,
				fileUrls: [],
				signature: null,
			},
		],
		submittedByUserId: null,
		submittedBy: null,
		submitterIp: "127.0.0.1",
		source: "guest_public",
		createdAt: "2026-08-10T12:00:00.000Z",
		...overrides,
	};
}

function renderPage({ formId = FORM_ID, mocks = [] } = {}) {
	return render(
		<MemoryRouter initialEntries={[`/forms/${formId}/responses`]}>
			<MockedProvider mocks={mocks}>
				<Routes>
					<Route path="/forms/:formId/responses" element={<FormResponses />} />
				</Routes>
			</MockedProvider>
		</MemoryRouter>,
	);
}

describe("loading", () => {
	it("shows the page loader while getFormResponses is in flight", () => {
		renderPage({
			mocks: [getFormMock(), responsesMock({ items: [response()] }), analyticsMock(emptyAnalytics())],
		});

		expect(screen.getByRole("progressbar")).toBeInTheDocument();
		expect(screen.queryByText("Arya Stark")).not.toBeInTheDocument();
		// Static chrome (the generic title before getForm resolves) isn't gated on loading.
		expect(screen.getByText("Responses")).toBeInTheDocument();
	});

	it("titles the page with the form's own title once getForm resolves", async () => {
		renderPage({
			mocks: [getFormMock(), responsesMock({ items: [] }), analyticsMock(emptyAnalytics())],
		});

		expect(await screen.findByText("Responses - Tattoo Consent Form")).toBeInTheDocument();
	});

	it("links back to the form's own edit page", async () => {
		renderPage({
			mocks: [getFormMock(), responsesMock({ items: [] }), analyticsMock(emptyAnalytics())],
		});

		expect(await screen.findByRole("link", { name: "Back to form" })).toHaveAttribute(
			"href",
			`/forms/${FORM_ID}`,
		);
	});
});

describe("no responses yet", () => {
	it("shows the empty message and no analytics field breakdown", async () => {
		renderPage({
			mocks: [getFormMock(), responsesMock({ items: [] }), analyticsMock(emptyAnalytics())],
		});

		expect(await screen.findByText("No responses yet.")).toBeInTheDocument();
		expect(screen.getByText("Total responses")).toBeInTheDocument();
		expect(screen.getByText("0")).toBeInTheDocument();
	});
});

describe("analytics summary", () => {
	it("shows the total and a per-field breakdown with option bars", async () => {
		renderPage({
			mocks: [
				getFormMock(),
				responsesMock({ items: [] }),
				analyticsMock(
					emptyAnalytics({
						totalResponses: 4,
						fields: [
							{
								__typename: "FormFieldAnalytics",
								fieldKey: "allergies",
								label: "Any allergies?",
								type: "short_text",
								answeredCount: 4,
								optionCounts: [],
							},
							{
								__typename: "FormFieldAnalytics",
								fieldKey: "contact_pref",
								label: "Preferred contact",
								type: "single_choice",
								answeredCount: 4,
								optionCounts: [
									{ __typename: "OptionCount", option: "Email", count: 3 },
									{ __typename: "OptionCount", option: "Phone", count: 1 },
								],
							},
						],
					}),
				),
			],
		});

		expect(await screen.findByText("4")).toBeInTheDocument();
		expect(screen.getByText("Any allergies?")).toBeInTheDocument();
		expect(screen.getByText("4 of 4 answered")).toBeInTheDocument();
		expect(screen.getByText("Preferred contact")).toBeInTheDocument();
		expect(screen.getByText("Email")).toBeInTheDocument();
		expect(screen.getByText("3")).toBeInTheDocument();
		expect(screen.getByText("Phone")).toBeInTheDocument();
	});

	it("omits the field breakdown block entirely when there are no fields to analyze", async () => {
		renderPage({
			mocks: [
				getFormMock(),
				responsesMock({ items: [] }),
				analyticsMock(emptyAnalytics({ totalResponses: 2, fields: [] })),
			],
		});

		await screen.findByText("Total responses");
		expect(document.querySelector(".formAnalyticsFields")).not.toBeInTheDocument();
	});
});

describe("a populated response list", () => {
	it("shows each response's client name, source label, and submitted date", async () => {
		renderPage({
			mocks: [getFormMock(), responsesMock({ items: [response()] }), analyticsMock(emptyAnalytics())],
		});

		expect(await screen.findByText("Arya Stark")).toBeInTheDocument();
		expect(screen.getByText(/Guest \(public link\)/)).toBeInTheDocument();
		expect(screen.getByText(/Aug 10, 2026/)).toBeInTheDocument();
	});

	it("falls back to Unknown client when there is no linked client", async () => {
		renderPage({
			mocks: [
				getFormMock(),
				responsesMock({ items: [response({ client: null, clientId: null })] }),
				analyticsMock(emptyAnalytics()),
			],
		});

		expect(await screen.findByText("Unknown client")).toBeInTheDocument();
	});

	it("maps every source value to its own label", async () => {
		renderPage({
			mocks: [
				getFormMock(),
				responsesMock({ items: [response({ id: "resp-staff", source: "staff_entered" })] }),
				analyticsMock(emptyAnalytics()),
			],
		});

		expect(await screen.findByText(/Entered by staff/)).toBeInTheDocument();
	});

	it("hides answers until View answers is clicked, then toggles the label to Hide answers", async () => {
		const user = userEvent.setup();
		renderPage({
			mocks: [getFormMock(), responsesMock({ items: [response()] }), analyticsMock(emptyAnalytics())],
		});

		await screen.findByText("Arya Stark");
		expect(screen.queryByText("None")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "View answers" }));
		expect(screen.getByText("None")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Hide answers" })).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Hide answers" }));
		expect(screen.queryByText("None")).not.toBeInTheDocument();
	});

	// formatAnswer's own switch, one case per field type this page has to render - each response
	// is read against its OWN fieldsSnapshot (never the live form), per the component's own header
	// comment on why a since-changed question still shows what it meant the day it was signed.
	describe("rendering an answer for each field type (against the response's own fieldsSnapshot)", () => {
		it("short_text / paragraph - shows the free-text value, or an em dash when unanswered", async () => {
			const user = userEvent.setup();
			renderPage({
				mocks: [
					getFormMock(),
					responsesMock({
						items: [
							response({
								fieldsSnapshot: [
									{ __typename: "FormField", key: "notes", type: "paragraph", label: "Notes", helpText: null, required: false, options: [] },
								],
								answers: [],
							}),
						],
					}),
					analyticsMock(emptyAnalytics()),
				],
			});

			await screen.findByText("Arya Stark");
			await user.click(screen.getByRole("button", { name: "View answers" }));

			expect(screen.getByText("Notes")).toBeInTheDocument();
			expect(screen.getByText("—")).toBeInTheDocument();
		});

		it("single_choice / multi_choice - joins the selected options", async () => {
			const user = userEvent.setup();
			renderPage({
				mocks: [
					getFormMock(),
					responsesMock({
						items: [
							response({
								fieldsSnapshot: [
									{ __typename: "FormField", key: "contact_pref", type: "multi_choice", label: "Preferred contact", helpText: null, required: false, options: ["Email", "Phone"] },
								],
								answers: [
									{ __typename: "FormAnswer", fieldKey: "contact_pref", textValue: null, selectedOptions: ["Email", "Phone"], dateValue: null, fileUrls: [], signature: null },
								],
							}),
						],
					}),
					analyticsMock(emptyAnalytics()),
				],
			});

			await screen.findByText("Arya Stark");
			await user.click(screen.getByRole("button", { name: "View answers" }));

			expect(screen.getByText("Email, Phone")).toBeInTheDocument();
		});

		it("date - formats dateValue as a readable date", async () => {
			const user = userEvent.setup();
			renderPage({
				mocks: [
					getFormMock(),
					responsesMock({
						items: [
							response({
								fieldsSnapshot: [
									{ __typename: "FormField", key: "dob", type: "date", label: "Date of birth", helpText: null, required: false, options: [] },
								],
								answers: [
									{ __typename: "FormAnswer", fieldKey: "dob", textValue: null, selectedOptions: [], dateValue: "1995-03-02T00:00:00.000Z", fileUrls: [], signature: null },
								],
							}),
						],
					}),
					analyticsMock(emptyAnalytics()),
				],
			});

			await screen.findByText("Arya Stark");
			await user.click(screen.getByRole("button", { name: "View answers" }));

			expect(screen.getByText("Mar 2, 1995")).toBeInTheDocument();
		});

		it("file_upload - links each uploaded file by its filename", async () => {
			const user = userEvent.setup();
			renderPage({
				mocks: [
					getFormMock(),
					responsesMock({
						items: [
							response({
								fieldsSnapshot: [
									{ __typename: "FormField", key: "photo", type: "file_upload", label: "Reference photo", helpText: null, required: false, options: [] },
								],
								answers: [
									{ __typename: "FormAnswer", fieldKey: "photo", textValue: null, selectedOptions: [], dateValue: null, fileUrls: ["https://cdn.example.com/uploads/ref-1.png"], signature: null },
								],
							}),
						],
					}),
					analyticsMock(emptyAnalytics()),
				],
			});

			await screen.findByText("Arya Stark");
			await user.click(screen.getByRole("button", { name: "View answers" }));

			expect(screen.getByRole("link", { name: "ref-1.png" })).toHaveAttribute(
				"href",
				"https://cdn.example.com/uploads/ref-1.png",
			);
		});

		it("signature - shows the signed name and signed-at timestamp", async () => {
			const user = userEvent.setup();
			renderPage({
				mocks: [
					getFormMock(),
					responsesMock({
						items: [
							response({
								fieldsSnapshot: [
									{ __typename: "FormField", key: "waiver", type: "signature", label: "Signature", helpText: null, required: true, options: [] },
								],
								answers: [
									{
										__typename: "FormAnswer",
										fieldKey: "waiver",
										textValue: null,
										selectedOptions: [],
										dateValue: null,
										fileUrls: [],
										signature: { __typename: "FormSignature", signedName: "Arya Stark", signedAt: "2026-08-10T12:00:00.000Z" },
									},
								],
							}),
						],
					}),
					analyticsMock(emptyAnalytics()),
				],
			});

			await screen.findByText("Arya Stark");
			await user.click(screen.getByRole("button", { name: "View answers" }));

			expect(screen.getByText(/Signed "Arya Stark" on Aug 10, 2026/)).toBeInTheDocument();
		});
	});
});

describe("pagination", () => {
	it("hides Previous/Next but still shows the count when everything fits on one page", async () => {
		renderPage({
			mocks: [
				getFormMock(),
				responsesMock({ items: [response()], pageInfoOverrides: { totalCount: 1, hasMore: false } }),
				analyticsMock(emptyAnalytics()),
			],
		});

		await screen.findByText("Arya Stark");
		expect(screen.getByText("1 response")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
	});

	it("advances the offset on Next and requests the next page", async () => {
		const user = userEvent.setup();
		renderPage({
			mocks: [
				getFormMock(),
				responsesMock({
					items: [response()],
					pageInfoOverrides: { totalCount: 30, hasMore: true },
				}),
				analyticsMock(emptyAnalytics()),
				responsesMock({
					page: { limit: 25, offset: 25 },
					items: [response({ id: "resp-2", client: { __typename: "Client", id: "client-2", firstName: "Sansa", lastName: "Stark" } })],
					pageInfoOverrides: { totalCount: 30, hasMore: false, offset: 25 },
				}),
			],
		});

		await screen.findByText("Arya Stark");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(await screen.findByText("Sansa Stark")).toBeInTheDocument();
		expect(screen.queryByText("Arya Stark")).not.toBeInTheDocument();
	});

	it("changing the page size resets the offset and re-requests with the new limit", async () => {
		const user = userEvent.setup();
		renderPage({
			mocks: [
				getFormMock(),
				responsesMock({
					items: [response()],
					pageInfoOverrides: { totalCount: 60, hasMore: true },
				}),
				analyticsMock(emptyAnalytics()),
				responsesMock({
					page: { limit: 10, offset: 0 },
					items: [response({ id: "resp-2", client: { __typename: "Client", id: "client-2", firstName: "Sansa", lastName: "Stark" } })],
					pageInfoOverrides: { totalCount: 60, hasMore: true, limit: 10 },
				}),
			],
		});

		await screen.findByText("Arya Stark");
		await user.selectOptions(screen.getByRole("combobox", { name: "Show" }), "10");

		expect(await screen.findByText("Sansa Stark")).toBeInTheDocument();
	});
});
