// FormService.js tests, following the same convention ClientService.test.js establishes for this
// codebase's "Service" files: an IIFE exporting hook factories wrapping useQuery/useMutation
// around a gql document, plus raw gql documents meant for a caller's own useQuery/useMutation.
// There is almost no pure logic to unit-test directly, so every export below is exercised through
// a tiny throwaway harness component rendered under MockedProvider.
//
// Written with React.createElement rather than JSX: this codebase's .js files (as opposed to
// .jsx) cannot contain literal JSX at all under this project's Vite/oxc pipeline (see
// vite.config.js's own header comment, and ClientService.test.js which follows the same rule for
// the same reason) - this file stays a .js to match its sibling FormService.js.
//
// ON THE RECONSTRUCTED QUERIES BELOW: FormService.js exports FETCH_FORMS, FETCH_FORM,
// GET_PUBLIC_FORM, GET_PUBLIC_FORM_BY_SLUG, and every mutation directly - those mocks use the REAL
// exported document, never a hand-copied string (see FormService.FETCH_FORMS/FETCH_FORM/etc.
// referenced directly throughout below). _GET_MY_FORM_LINKS, _GET_MY_FILLABLE_FORMS,
// _FETCH_FORM_RESPONSES, _FETCH_FORM_RESPONSE, and _FETCH_FORM_ANALYTICS are only ever used
// internally (their hook wrapper is exported, not the document itself), so those five are
// reconstructed field-for-field from the real source below - MockedProvider matches a request by
// the document's printed text plus variables, not by reference identity, so this still fails
// loudly if the real query in FormService.js ever drifts from what's copied here. The
// FORM_RESPONSE_FIELDS block feeding three of those reconstructions is copied verbatim, in the
// same field order, from FormService.js's own bare `const _FORM_RESPONSE_FIELDS` string - per that
// file's header comment, every such const is kept fully self-contained (never interpolating
// another bare const) specifically so a single, flat copy like this always reflects the true
// selection set.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql, useQuery, useMutation } from "@apollo/client";
import { print } from "graphql";
import FormService from "./FormService";

// ---- reconstructed field shape (copied verbatim from FormService.js's _FORM_RESPONSE_FIELDS) ---

const FORM_RESPONSE_FIELDS = `
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
`;

// ---- reconstructed internal-only documents -----------------------------------------------------

const GET_MY_FORM_LINKS_FOR_TESTS = gql`
	query GetMyFormLinks {
		getMyFormLinks {
			title
			slug
		}
	}
`;

const GET_MY_FILLABLE_FORMS_FOR_TESTS = gql`
	query GetMyFillableForms {
		getMyFillableForms {
			id
			title
			description
		}
	}
`;

const FETCH_FORM_RESPONSES_FOR_TESTS = gql`
	query GetFormResponses($formId: ID!, $page: PageInput) {
		getFormResponses(formId: $formId, page: $page) {
			items {
				${FORM_RESPONSE_FIELDS}
			}
			pageInfo { totalCount hasMore limit offset }
		}
	}
`;

const FETCH_FORM_RESPONSE_FOR_TESTS = gql`
	query GetFormResponse($formResponseId: ID!) {
		getFormResponse(formResponseId: $formResponseId) {
			${FORM_RESPONSE_FIELDS}
		}
	}
`;

const FETCH_FORM_ANALYTICS_FOR_TESTS = gql`
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

// ---- generic harnesses (same shape as ClientService.test.js) -----------------------------------

function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

function MutationHarness({ document, variables }) {
	const [result, setResult] = React.useState(null);
	const [mutate] = useMutation(document, { onCompleted: setResult });
	return React.createElement(
		"div",
		null,
		React.createElement("button", { onClick: () => mutate({ variables }) }, "go"),
		result && React.createElement("div", { "data-testid": "result" }, JSON.stringify(result)),
	);
}

async function clickGo(user) {
	await user.click(screen.getByRole("button", { name: "go" }));
}

function form(overrides = {}) {
	return {
		__typename: "Form",
		id: "form-1",
		shopId: "shop-1",
		artistUserId: null,
		title: "Intake questionnaire",
		description: "Standard intake",
		status: "published",
		allowGuestSubmissions: true,
		publicToken: "tok-abc",
		slug: "intake",
		shopUseOnly: false,
		systemKey: null,
		fields: [
			{
				__typename: "FormField",
				key: "allergies",
				type: "text",
				label: "Allergies",
				helpText: null,
				required: false,
				options: null,
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

// ---- getForms / FETCH_FORMS ---------------------------------------------------------------------

describe("FormService.getForms", () => {
	it("fetches a shop-scoped page of forms with default status/page", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => FormService.getForms({ shopId: "shop-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FormService.FETCH_FORMS,
								// status defaults to null (status || null), page stays whatever was passed
								// (undefined here, since no page argument was given).
								variables: { shopId: "shop-1", status: null, page: undefined },
							},
							result: {
								data: {
									getForms: {
										__typename: "FormPage",
										items: [form()],
										pageInfo: {
											__typename: "PageInfo",
											totalCount: 1,
											hasMore: false,
											limit: 25,
											offset: 0,
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Intake questionnaire");
	});

	it("fetches an artist-scoped page of forms, passing status and page through as variables", async () => {
		const page = { limit: 10, offset: 20 };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => FormService.getForms({ artistUserId: "artist-1" }, "archived", page),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FormService.FETCH_FORMS,
								variables: { artistUserId: "artist-1", status: "archived", page },
							},
							result: {
								data: {
									getForms: {
										__typename: "FormPage",
										items: [],
										pageInfo: {
											__typename: "PageInfo",
											totalCount: 0,
											hasMore: false,
											limit: 10,
											offset: 20,
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		// Reaching a resolved (non-error) result at all is itself the proof the mock's demanded
		// variables (artistUserId/status/page) were what was actually sent - MockedProvider throws
		// loudly on any mismatch.
		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});

	// skip: !scope?.shopId && !scope?.artistUserId - neither present must never fire a request.
	it("skips the query entirely when the scope has neither shopId nor artistUserId", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => FormService.getForms({}) });
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// Calling with no arguments at all: scope is undefined, so scope?.shopId/scope?.artistUserId
	// both resolve to undefined via optional chaining rather than throwing.
	it("skips without throwing when called with no scope argument at all", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => FormService.getForms() });
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- getForm / FETCH_FORM ------------------------------------------------------------------------

describe("FormService.getForm", () => {
	it("resolves with a single form record", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => FormService.getForm("form-1") });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FormService.FETCH_FORM, variables: { formId: "form-1" } },
							result: { data: { getForm: form() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Intake questionnaire");
	});

	// skip: !formId
	it("skips the query entirely when formId is falsy", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => FormService.getForm("") });
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- GET_PUBLIC_FORM (raw document, called directly by PublicFormFillOut.jsx) --------------------

describe("FormService.GET_PUBLIC_FORM", () => {
	it("resolves a public form by its publicToken via a plain useQuery, as PublicFormFillOut.jsx calls it", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(FormService.GET_PUBLIC_FORM, { variables: { publicToken: "tok-abc" } }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FormService.GET_PUBLIC_FORM,
								variables: { publicToken: "tok-abc" },
							},
							result: {
								data: {
									getPublicForm: {
										__typename: "PublicForm",
										id: "form-1",
										title: "Intake questionnaire",
										description: "Standard intake",
										fields: [
											{
												__typename: "FormField",
												key: "allergies",
												type: "text",
												label: "Allergies",
												helpText: null,
												required: false,
												options: null,
												hidden: false,
											},
										],
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Allergies");
	});

	// A guest reading GET_PUBLIC_FORM must never be handed the management-only fields a shop/artist
	// scope or status would leak - see FormService.js's own comment on why this is a deliberately
	// different, stripped-down selection set from FETCH_FORM's. Note: "publicToken" itself is
	// deliberately NOT checked here - it's the query's own variable/argument name
	// ($publicToken: String!), so it legitimately appears in the printed text regardless of the
	// selection set; "allowGuestSubmissions" stands in as the analogous management-only field that
	// can't be confused with an argument name.
	it("does not select shop/artist/status/allowGuestSubmissions fields a guest has no business reading", () => {
		const printed = print(FormService.GET_PUBLIC_FORM);
		expect(printed).toContain("title");
		expect(printed).not.toContain("shopId");
		expect(printed).not.toContain("artistUserId");
		expect(printed).not.toContain("allowGuestSubmissions");
		expect(printed).not.toContain("status");
		expect(printed).not.toContain("createdBy");
	});
});

// ---- GET_PUBLIC_FORM_BY_SLUG (raw document) -------------------------------------------------------

describe("FormService.GET_PUBLIC_FORM_BY_SLUG", () => {
	it("resolves the state + form via a plain useQuery for the slug-based public link", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(FormService.GET_PUBLIC_FORM_BY_SLUG, {
						variables: { formSlug: "intake", ownerHandle: "gendry" },
					}),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FormService.GET_PUBLIC_FORM_BY_SLUG,
								variables: { formSlug: "intake", ownerHandle: "gendry" },
							},
							result: {
								data: {
									getPublicFormBySlug: {
										__typename: "PublicFormBySlugResult",
										state: "ok",
										form: {
											__typename: "PublicForm",
											id: "form-1",
											title: "Intake questionnaire",
											description: "Standard intake",
											fields: [],
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"state":"ok"');
		expect(result).toHaveTextContent("Intake questionnaire");
	});

	// It "ALWAYS resolves to a result" per FormService.js's own comment - a "not found"/"disabled"
	// state must flow back as data, not as a GraphQL error, so PublicFormBySlugFillOut.jsx can show
	// the right message rather than one generic dead end.
	it("resolves with a non-ok state and a null form rather than erroring, when the link is gone", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(FormService.GET_PUBLIC_FORM_BY_SLUG, {
						variables: { formSlug: "missing", ownerHandle: "nobody" },
					}),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FormService.GET_PUBLIC_FORM_BY_SLUG,
								variables: { formSlug: "missing", ownerHandle: "nobody" },
							},
							result: {
								data: {
									getPublicFormBySlug: {
										__typename: "PublicFormBySlugResult",
										state: "not_found",
										form: null,
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"state":"not_found"');
		expect(result).toHaveTextContent('"form":null');
	});

	it("does not select shop/artist/status/publicToken fields on the nested form either", () => {
		const printed = print(FormService.GET_PUBLIC_FORM_BY_SLUG);
		expect(printed).toContain("state");
		expect(printed).not.toContain("shopId");
		expect(printed).not.toContain("publicToken");
		expect(printed).not.toContain("createdBy");
	});
});

// ---- getMyFormLinks (SELF-SCOPED, internal-only document) -----------------------------------------

describe("FormService.getMyFormLinks", () => {
	it("resolves with title/slug for the current artist's published form links", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => FormService.getMyFormLinks() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: GET_MY_FORM_LINKS_FOR_TESTS, variables: {} },
							result: {
								data: {
									getMyFormLinks: [
										{ __typename: "FormLink", title: "Intake questionnaire", slug: "intake" },
									],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("intake");
	});
});

// ---- getMyFillableForms (SELF-SCOPED the other way, internal-only document) ------------------------

describe("FormService.getMyFillableForms", () => {
	it("resolves with only the fields FormFillOut.jsx needs (id/title/description)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => FormService.getMyFillableForms(),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: GET_MY_FILLABLE_FORMS_FOR_TESTS, variables: {} },
							result: {
								data: {
									getMyFillableForms: [
										{
											__typename: "Form",
											id: "form-1",
											title: "Intake questionnaire",
											description: "Standard intake",
										},
									],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Intake questionnaire");
	});

	// This reconstructed query deliberately omits `fields`, `status`, `publicToken`, etc. - if
	// FormService.js's internal _GET_MY_FILLABLE_FORMS ever widened to reuse _FORM_FIELDS (the
	// management-view shape), this mock would stop matching and the test above would fail loudly
	// with "no matching mock" rather than silently start over-fetching, the same guard
	// ClientService.test.js's reconstructed-query tests rely on for other internal-only documents.
	it("has no separately-exported raw document - only the wrapped hook is public", () => {
		expect(FormService.GET_MY_FILLABLE_FORMS).toBeUndefined();
		expect(FormService.getMyFillableForms).toBeTypeOf("function");
	});
});

// ---- CREATE_FORM / UPDATE_FORM / PUBLISH_FORM / ARCHIVE_FORM / SET_FORM_GUEST_ACCESS / DELETE_FORM -

describe("FormService.CREATE_FORM", () => {
	it("creates a form from a CreateFormInput", async () => {
		const user = userEvent.setup();
		const input = { title: "New form", fields: [] };
		function Harness() {
			return React.createElement(MutationHarness, { document: FormService.CREATE_FORM, variables: { input } });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FormService.CREATE_FORM, variables: { input } },
							result: { data: { createForm: form({ title: "New form", id: "form-2" }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("New form");
	});
});

describe("FormService.UPDATE_FORM", () => {
	it("updates a form from an UpdateFormInput", async () => {
		const user = userEvent.setup();
		const input = { id: "form-1", title: "Updated title" };
		function Harness() {
			return React.createElement(MutationHarness, { document: FormService.UPDATE_FORM, variables: { input } });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FormService.UPDATE_FORM, variables: { input } },
							result: { data: { updateForm: form({ title: "Updated title" }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Updated title");
	});
});

describe("FormService.PUBLISH_FORM", () => {
	it("publishes a form by id", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: FormService.PUBLISH_FORM,
				variables: { formId: "form-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FormService.PUBLISH_FORM, variables: { formId: "form-1" } },
							result: { data: { publishForm: form({ status: "published" }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"status":"published"');
	});
});

describe("FormService.ARCHIVE_FORM", () => {
	it("archives a form by id", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: FormService.ARCHIVE_FORM,
				variables: { formId: "form-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FormService.ARCHIVE_FORM, variables: { formId: "form-1" } },
							result: { data: { archiveForm: form({ status: "archived" }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"status":"archived"');
	});
});

describe("FormService.SET_FORM_GUEST_ACCESS", () => {
	it("toggles guest submissions on for a form", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: FormService.SET_FORM_GUEST_ACCESS,
				variables: { formId: "form-1", allow: true },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FormService.SET_FORM_GUEST_ACCESS,
								variables: { formId: "form-1", allow: true },
							},
							result: {
								data: { setFormGuestAccess: form({ allowGuestSubmissions: true }) },
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"allowGuestSubmissions":true');
	});
});

describe("FormService.DELETE_FORM", () => {
	it("deletes a form by id and resolves with the boolean result", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: FormService.DELETE_FORM,
				variables: { formId: "form-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FormService.DELETE_FORM, variables: { formId: "form-1" } },
							result: { data: { deleteForm: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"deleteForm":true');
	});

	// deleteForm resolves to a bare Boolean, not an object - locks in that the document has no
	// selection set at all (a regression here would mean the server-side scalar type changed).
	it("has no sub-selection - deleteForm is a scalar Boolean", () => {
		const printed = print(FormService.DELETE_FORM);
		expect(printed.replace(/\s+/g, " ").trim()).toBe(
			"mutation DeleteForm($formId: ID!) { deleteForm(formId: $formId) }",
		);
	});
});

// ---- UPDATE_BOOKING_REQUEST_FIELDS ----------------------------------------------------------------

describe("FormService.UPDATE_BOOKING_REQUEST_FIELDS", () => {
	it("updates the booking_request system form's restricted fields", async () => {
		const user = userEvent.setup();
		// BookingRequestFieldInput - deliberately narrower than FormFieldInput: no type/options, per
		// FormService.js's own comment on this mutation (task #162).
		const fields = [{ key: "phone", label: "Phone number", required: true }];
		function Harness() {
			return React.createElement(MutationHarness, {
				document: FormService.UPDATE_BOOKING_REQUEST_FIELDS,
				variables: { formId: "form-booking", fields },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FormService.UPDATE_BOOKING_REQUEST_FIELDS,
								variables: { formId: "form-booking", fields },
							},
							result: {
								data: {
									updateBookingRequestFields: form({ id: "form-booking", systemKey: "booking_request" }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("booking_request");
	});
});

// ---- getFormResponses (internal-only document) -----------------------------------------------------

describe("FormService.getFormResponses", () => {
	function response(overrides = {}) {
		return {
			__typename: "FormResponse",
			id: "response-1",
			formId: "form-1",
			shopId: "shop-1",
			artistUserId: null,
			formTitle: "Intake questionnaire",
			fieldsSnapshot: [
				{
					__typename: "FormField",
					key: "allergies",
					type: "text",
					label: "Allergies",
					helpText: null,
					required: false,
					options: null,
				},
			],
			clientId: "client-1",
			client: { __typename: "Client", id: "client-1", firstName: "Arya", lastName: "Stark" },
			answers: [
				{
					__typename: "FormAnswer",
					fieldKey: "allergies",
					textValue: "None",
					selectedOptions: null,
					dateValue: null,
					fileUrls: null,
					signature: null,
				},
			],
			submittedByUserId: "client-1",
			submittedBy: { __typename: "User", id: "client-1", firstName: "Arya", lastName: "Stark" },
			submitterIp: "127.0.0.1",
			source: "client",
			createdAt: "2026-08-01T00:00:00.000Z",
			...overrides,
		};
	}

	it("resolves with a page of form responses", async () => {
		const page = { limit: 10, offset: 0 };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => FormService.getFormResponses("form-1", page),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FETCH_FORM_RESPONSES_FOR_TESTS, variables: { formId: "form-1", page } },
							result: {
								data: {
									getFormResponses: {
										__typename: "FormResponsePage",
										items: [response()],
										pageInfo: {
											__typename: "PageInfo",
											totalCount: 1,
											hasMore: false,
											limit: 10,
											offset: 0,
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Allergies");
	});

	// skip: !formId
	it("skips the query entirely when formId is falsy", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => FormService.getFormResponses(null, undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- getFormResponse (internal-only document) ------------------------------------------------------

describe("FormService.getFormResponse", () => {
	it("resolves with a single form response, reading answers/fieldsSnapshot from the RESPONSE", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => FormService.getFormResponse("response-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_FORM_RESPONSE_FOR_TESTS,
								variables: { formResponseId: "response-1" },
							},
							result: {
								data: {
									getFormResponse: {
										__typename: "FormResponse",
										id: "response-1",
										formId: "form-1",
										shopId: "shop-1",
										artistUserId: null,
										formTitle: "Intake questionnaire",
										fieldsSnapshot: [],
										clientId: "client-1",
										client: { __typename: "Client", id: "client-1", firstName: "Arya", lastName: "Stark" },
										answers: [],
										submittedByUserId: "client-1",
										submittedBy: { __typename: "User", id: "client-1", firstName: "Arya", lastName: "Stark" },
										submitterIp: "127.0.0.1",
										source: "client",
										createdAt: "2026-08-01T00:00:00.000Z",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Arya");
	});

	// skip: !formResponseId
	it("skips the query entirely when formResponseId is falsy", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => FormService.getFormResponse(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- getFormAnalytics (internal-only document) ------------------------------------------------------

describe("FormService.getFormAnalytics", () => {
	it("resolves with the analytics payload for a form", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => FormService.getFormAnalytics("form-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FETCH_FORM_ANALYTICS_FOR_TESTS, variables: { formId: "form-1" } },
							result: {
								data: {
									getFormAnalytics: {
										__typename: "FormAnalytics",
										formId: "form-1",
										totalResponses: 3,
										responsesByDay: [{ __typename: "FormResponsesByDay", date: "2026-08-01", count: 3 }],
										fields: [
											{
												__typename: "FormFieldAnalytics",
												fieldKey: "allergies",
												label: "Allergies",
												type: "text",
												answeredCount: 3,
												optionCounts: [],
											},
										],
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"totalResponses":3');
		expect(result).toHaveTextContent("allergies");
	});

	// skip: !formId
	it("skips the query entirely when formId is falsy", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => FormService.getFormAnalytics(""),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- SUBMIT_FORM_RESPONSE (raw document, called from both an authed and a public context) -----------

describe("FormService.SUBMIT_FORM_RESPONSE", () => {
	it("submits a form response and gets the full response record back", async () => {
		const user = userEvent.setup();
		const input = {
			formId: "form-1",
			answers: [{ fieldKey: "allergies", textValue: "None" }],
		};
		function Harness() {
			return React.createElement(MutationHarness, {
				document: FormService.SUBMIT_FORM_RESPONSE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FormService.SUBMIT_FORM_RESPONSE, variables: { input } },
							result: {
								data: {
									submitFormResponse: {
										__typename: "FormResponse",
										id: "response-1",
										formId: "form-1",
										shopId: "shop-1",
										artistUserId: null,
										formTitle: "Intake questionnaire",
										fieldsSnapshot: [],
										clientId: null,
										client: null,
										answers: [
											{
												__typename: "FormAnswer",
												fieldKey: "allergies",
												textValue: "None",
												selectedOptions: null,
												dateValue: null,
												fileUrls: null,
												signature: null,
											},
										],
										submittedByUserId: null,
										submittedBy: null,
										submitterIp: "127.0.0.1",
										source: "public",
										createdAt: "2026-08-01T00:00:00.000Z",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("response-1");
		expect(result).toHaveTextContent("None");
	});

	// Not wrapped in a hook, unlike almost every query above - callable directly via useMutation as
	// both FormFillOut.jsx (authed) and PublicFormFillOut.jsx (public, unauthenticated) do, each
	// with their own loading/error handling. This just proves the export itself is a usable document
	// via a plain useMutation, independent of any wrapper.
	it("is a raw document, not a hook - FormService has no submitFormResponse function", () => {
		expect(FormService.submitFormResponse).toBeUndefined();
		expect(FormService.SUBMIT_FORM_RESPONSE).toBeDefined();
	});
});
