// FormFillOut.jsx tests. This is the AUTHENTICATED fill-out flow (task #146) - see the
// component's own header comment for how it differs from the guest-facing siblings
// (PublicFormFillOut.jsx / PublicFormBySlugFillOut.jsx, tested separately elsewhere): it resolves
// the form by formId through FormService.getForm (a real useQuery hook, not a prop), and submits
// through the same SUBMIT_FORM_RESPONSE mutation those pages use, but with formId/clientId
// instead of formSlug+guest contact fields.
//
// FormFieldsRenderer itself (the actual per-field-type rendering/validation-message plumbing) has
// its own coverage elsewhere - these tests only exercise what belongs to FormFillOut: the
// getForm loading/not-found/not-published states, wiring answers into the mutation's variables
// shape, and the onCompleted/onError handling (fieldErrors vs. generalError) that FormFillOut
// owns, not FormFieldsRenderer (see FormFieldsRenderer.jsx's own header comment - it never invents
// required-field validation of its own, it only displays whatever `errors` map its caller hands
// it).
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { GraphQLError } from "graphql";
import FormFillOut from "./FormFillOut";
import FormService from "../../services/FormService";

const FORM_ID = "form-1";

function baseForm(overrides = {}) {
	return {
		__typename: "Form",
		id: FORM_ID,
		shopId: "shop-1",
		artistUserId: null,
		title: "New Client Consent",
		description: "Please fill this out before your appointment.",
		status: "published",
		allowGuestSubmissions: false,
		publicToken: null,
		slug: null,
		shopUseOnly: false,
		systemKey: null,
		fields: [
			{
				__typename: "FormField",
				key: "fullName",
				type: "short_text",
				label: "Full name",
				helpText: null,
				required: true,
				options: null,
				hidden: false,
			},
			{
				__typename: "FormField",
				key: "preference",
				type: "single_choice",
				label: "Preferred style",
				helpText: null,
				required: false,
				options: ["Traditional", "Realism"],
				hidden: false,
			},
		],
		createdByUserId: "artist-1",
		createdBy: { __typename: "User", id: "artist-1", firstName: "Gendry", lastName: "Baratheon" },
		createdAt: "2026-07-01T12:00:00.000Z",
		updatedAt: "2026-07-01T12:00:00.000Z",
		...overrides,
	};
}

// Built from FormService's own exported FETCH_FORM document, not a hand-copied query string, so
// the mock can't silently drift away from what FormFillOut/FormService.getForm actually requests.
function getFormMock(form, { formId = FORM_ID } = {}) {
	return {
		request: {
			query: FormService.FETCH_FORM,
			variables: { formId },
		},
		result: { data: { getForm: form } },
	};
}

function formResponse(overrides = {}) {
	return {
		__typename: "FormResponse",
		id: "response-1",
		formId: FORM_ID,
		shopId: "shop-1",
		artistUserId: null,
		formTitle: "New Client Consent",
		fieldsSnapshot: [],
		clientId: null,
		client: null,
		answers: [],
		submittedByUserId: "artist-1",
		submittedBy: { __typename: "User", id: "artist-1", firstName: "Gendry", lastName: "Baratheon" },
		submitterIp: "127.0.0.1",
		source: "staff",
		createdAt: "2026-08-01T12:00:00.000Z",
		...overrides,
	};
}

// Likewise built from FormService.SUBMIT_FORM_RESPONSE rather than a hand-written mutation
// string, matching the MockedProvider convention in UpdateEventDialog.test.jsx.
function submitMock({ variables, data, errors }) {
	const result = errors ? { errors } : { data: { submitFormResponse: data } };
	return {
		request: {
			query: FormService.SUBMIT_FORM_RESPONSE,
			variables,
		},
		result,
	};
}

function renderFillOut({ mocks = [], ...props } = {}) {
	const onSubmitted = props.onSubmitted || vi.fn();
	const onCancel = props.onCancel;
	render(
		<MockedProvider mocks={mocks}>
			<FormFillOut formId={FORM_ID} {...props} onSubmitted={onSubmitted} onCancel={onCancel} />
		</MockedProvider>
	);
	return { onSubmitted };
}

describe("FormFillOut", () => {
	it("shows the page loader while the form is being fetched", () => {
		renderFillOut({ mocks: [getFormMock(baseForm())] });

		// IBPageLoader's own markup - see IBPageLoader.jsx - rather than a generic role query, since
		// this is specifically asserting FormFillOut's `loading && !data` branch renders that
		// component and nothing else.
		expect(document.querySelector(".ibPageLoader")).not.toBeNull();
		expect(screen.queryByRole("button", { name: /submit/i })).not.toBeInTheDocument();
	});

	it("renders the form's fields via FormFieldsRenderer once loaded", async () => {
		renderFillOut({ mocks: [getFormMock(baseForm())] });

		expect(await screen.findByText("Please fill this out before your appointment.")).toBeInTheDocument();
		expect(screen.getByLabelText("Full name")).toBeInTheDocument();
		expect(screen.getByText("Traditional")).toBeInTheDocument();
		expect(screen.getByText("Realism")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
		expect(document.querySelector(".ibPageLoader")).toBeNull();
	});

	// Component-owned branch (not FormFieldsRenderer's) - getForm resolving to null, e.g. a
	// deleted/never-existed formId.
	it("shows a not-found message when getForm resolves to no form", async () => {
		renderFillOut({ mocks: [getFormMock(null)] });

		expect(await screen.findByText("This form could not be found.")).toBeInTheDocument();
	});

	// Also component-owned - a real form that exists but isn't published yet (e.g. still "draft"),
	// which FormFieldsRenderer has no opinion on at all.
	it("shows a not-accepting-responses message when the form isn't published", async () => {
		renderFillOut({ mocks: [getFormMock(baseForm({ status: "draft" }))] });

		expect(
			await screen.findByText("This form is not currently accepting responses.")
		).toBeInTheDocument();
	});

	it("submits with clientId: null for the self-service path (no clientId prop)", async () => {
		const user = userEvent.setup();
		const expectedVariables = {
			input: {
				formId: FORM_ID,
				clientId: null,
				answers: [
					{
						fieldKey: "fullName",
						textValue: "Danny Wolfe",
						selectedOptions: [],
						dateValue: null,
						fileUrls: [],
						signedName: null,
					},
					{
						fieldKey: "preference",
						textValue: null,
						selectedOptions: ["Traditional"],
						dateValue: null,
						fileUrls: [],
						signedName: null,
					},
				],
			},
		};
		const mocks = [
			getFormMock(baseForm()),
			submitMock({ variables: expectedVariables, data: formResponse() }),
		];
		const { onSubmitted } = renderFillOut({ mocks });

		await screen.findByLabelText("Full name");
		await user.type(screen.getByLabelText("Full name"), "Danny Wolfe");
		await user.click(screen.getByText("Traditional"));
		await user.click(screen.getByRole("button", { name: /submit/i }));

		// MockedProvider only resolves this if the mutation's actual variables deep-equal
		// expectedVariables above - a mismatch surfaces as an "no matching mock" Apollo error
		// instead, which onSubmitted below would never fire for.
		await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(formResponse()));
	});

	it("submits with the supplied clientId when filling out on a client's behalf", async () => {
		const user = userEvent.setup();
		const expectedVariables = {
			input: {
				formId: FORM_ID,
				clientId: "client-9",
				answers: [
					{
						fieldKey: "fullName",
						textValue: "Arya Stark",
						selectedOptions: [],
						dateValue: null,
						fileUrls: [],
						signedName: null,
					},
				],
			},
		};
		const mocks = [
			getFormMock(baseForm()),
			submitMock({ variables: expectedVariables, data: formResponse({ clientId: "client-9" }) }),
		];
		const { onSubmitted } = renderFillOut({ mocks, clientId: "client-9" });

		await screen.findByLabelText("Full name");
		await user.type(screen.getByLabelText("Full name"), "Arya Stark");
		await user.click(screen.getByRole("button", { name: /submit/i }));

		await waitFor(() =>
			expect(onSubmitted).toHaveBeenCalledWith(formResponse({ clientId: "client-9" }))
		);
	});

	// onError's fieldErrors branch - the server's assertAnswersMatchFields UserInputError shape
	// (extensions.errors, a fieldKey-keyed message map). FormFillOut owns turning that into the
	// `errors` prop FormFieldsRenderer renders inline; FormFieldsRenderer itself never produces
	// this map on its own (see its header comment).
	it("shows a per-field error message from the server's extensions.errors", async () => {
		const user = userEvent.setup();
		const variables = {
			input: {
				formId: FORM_ID,
				clientId: null,
				answers: [
					{
						fieldKey: "fullName",
						textValue: null,
						selectedOptions: [],
						dateValue: null,
						fileUrls: [],
						signedName: null,
					},
				],
			},
		};
		const mocks = [
			getFormMock(baseForm({ fields: [baseForm().fields[0]] })),
			submitMock({
				variables,
				errors: [
					new GraphQLError("Some answers are invalid.", {
						extensions: { errors: { fullName: "This field is required." } },
					}),
				],
			}),
		];
		renderFillOut({ mocks });

		await screen.findByLabelText("Full name");
		// Submitting with the required field left blank - FormFieldsRenderer applies no client-side
		// required check of its own (server is the sole authority, per its header comment), so the
		// submit goes through and comes back with the mocked server-side rejection.
		await user.click(screen.getByRole("button", { name: /submit/i }));

		expect(await screen.findByText("This field is required.")).toBeInTheDocument();
	});

	// onError's generalError branch - a GraphQL error with no extensions.errors map at all (e.g. a
	// plain assertCanAccessClient/assertCanManageBusinessRecord authorization failure), rendered as
	// FormFillOut's own <p className="formFieldError"> rather than routed to any specific field.
	it("shows a general error message when the server error has no per-field extensions", async () => {
		const user = userEvent.setup();
		const variables = {
			input: {
				formId: FORM_ID,
				clientId: "client-9",
				answers: [
					{
						fieldKey: "fullName",
						textValue: "Arya Stark",
						selectedOptions: [],
						dateValue: null,
						fileUrls: [],
						signedName: null,
					},
				],
			},
		};
		const mocks = [
			getFormMock(baseForm({ fields: [baseForm().fields[0]] })),
			submitMock({
				variables,
				errors: [new GraphQLError("You do not have access to this client.")],
			}),
		];
		renderFillOut({ mocks, clientId: "client-9" });

		await screen.findByLabelText("Full name");
		await user.type(screen.getByLabelText("Full name"), "Arya Stark");
		await user.click(screen.getByRole("button", { name: /submit/i }));

		expect(await screen.findByText("You do not have access to this client.")).toBeInTheDocument();
	});

	it("renders no Cancel button when onCancel is omitted", async () => {
		renderFillOut({ mocks: [getFormMock(baseForm())], onCancel: undefined });
		await screen.findByLabelText("Full name");
		expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
	});

	it("calls onCancel when the Cancel button is clicked", async () => {
		const user = userEvent.setup();
		const onCancel = vi.fn();
		renderFillOut({ mocks: [getFormMock(baseForm())], onCancel });

		await screen.findByLabelText("Full name");
		await user.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
