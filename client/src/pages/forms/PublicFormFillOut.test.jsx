// PublicFormFillOut.jsx tests - the PUBLIC, unauthenticated guest-facing fill-out page for
// /form/:publicToken links (see FormService.js's own header comment: this is one of the two
// public entry points, alongside PublicFormBySlugFillOut.jsx, whose getPublicForm/
// SUBMIT_FORM_RESPONSE are called directly with useQuery/useMutation rather than through a
// wrapped hook). GUEST-ONLY: the component imports nothing from context/auth, and NO
// AuthContext.Provider appears anywhere below - wrapping this page in one would misrepresent what
// a real guest, holding nothing but a link, actually has available. Structurally near-identical
// to PublicFormBySlugFillOut.jsx (see PublicFormBySlugFillOut.test.jsx, the sibling this file
// mirrors), but resolved through the token-based GET_PUBLIC_FORM/PublicForm type rather than the
// slug-based lookup, with a single generic error message rather than three distinct lookup states.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PublicFormFillOut from "./PublicFormFillOut";
import FormService from "../../services/FormService";

const PUBLIC_TOKEN = "tok-abc123";

// Built from FormService's own exported GET_PUBLIC_FORM/SUBMIT_FORM_RESPONSE documents rather than
// hand-copied query strings (see FormsPanel.test.jsx's own comment on this convention) - so these
// mocks can't silently drift away from what the component actually sends.
function getPublicFormMock({ publicToken = PUBLIC_TOKEN, form = null, networkError = false } = {}) {
	const request = { query: FormService.GET_PUBLIC_FORM, variables: { publicToken } };
	if (networkError) {
		return { request, error: new Error("Network error") };
	}
	return { request, result: { data: { getPublicForm: form } } };
}

function baseForm(overrides = {}) {
	return {
		__typename: "PublicForm",
		id: "form-1",
		title: "Tattoo Consent Form",
		description: "Please fill this out before your appointment.",
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
		...overrides,
	};
}

// A form exercising every field type this page has to render (short answer, single choice, date,
// typed signature) - covers FormFieldsRenderer's own switch, called directly against form.fields
// here since this page never re-resolves anything through the live, authenticated Form type (see
// FormService.js's own header comment on why GET_PUBLIC_FORM is a stripped-down, separate type).
function multiFieldForm(overrides = {}) {
	return baseForm({
		fields: [
			{
				__typename: "FormField",
				key: "notes",
				type: "short_text",
				label: "Any allergies?",
				helpText: null,
				required: false,
				options: [],
				hidden: false,
			},
			{
				__typename: "FormField",
				key: "contact_pref",
				type: "single_choice",
				label: "Preferred contact method",
				helpText: null,
				required: false,
				options: ["Email", "Phone"],
				hidden: false,
			},
			{
				__typename: "FormField",
				key: "appt_date",
				type: "date",
				label: "Preferred appointment date",
				helpText: null,
				required: false,
				options: [],
				hidden: false,
			},
			{
				__typename: "FormField",
				key: "waiver",
				type: "signature",
				label: "Sign to confirm you agree",
				helpText: null,
				required: true,
				options: [],
				hidden: false,
			},
		],
		...overrides,
	});
}

function formResponse(overrides = {}) {
	return {
		__typename: "FormResponse",
		id: "resp-1",
		formId: "form-1",
		shopId: null,
		artistUserId: "artist-1",
		formTitle: "Tattoo Consent Form",
		fieldsSnapshot: [],
		clientId: null,
		client: null,
		answers: [],
		submittedByUserId: null,
		submittedBy: null,
		submitterIp: "127.0.0.1",
		source: "guest_public",
		createdAt: "2026-08-21T12:00:00.000Z",
		...overrides,
	};
}

// The route below mirrors the real one this component is reached through (App.jsx's
// /form/:publicToken, ROUTE_CONSTANTS.PUBLIC_FORM) - MemoryRouter + Routes/Route is the standard
// RTL way to exercise useParams, the same pattern PublicFormBySlugFillOut.test.jsx uses.
function renderPage({ mocks = [], path = `/form/${PUBLIC_TOKEN}` } = {}) {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<MockedProvider mocks={mocks}>
				<Routes>
					<Route path="/form/:publicToken" element={<PublicFormFillOut />} />
				</Routes>
			</MockedProvider>
		</MemoryRouter>,
	);
}

describe("PublicFormFillOut", () => {
	// No route match at all - useParams() resolves to {} outside any matching <Route>, giving
	// publicToken === undefined. A real guest can't reach this without SOME token in the URL, but
	// the component still has to have something sane to show rather than crash if it ever did.
	it("shows a missing-link message when there is no publicToken at all, and never queries", () => {
		render(
			<MemoryRouter>
				<MockedProvider mocks={[]}>
					<PublicFormFillOut />
				</MockedProvider>
			</MemoryRouter>,
		);

		expect(
			screen.getByText("This link is missing a form. Double-check the link and try again."),
		).toBeInTheDocument();
		expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
	});

	it("shows a loading state, then renders the resolved form's title, description, and fields", async () => {
		renderPage({ mocks: [getPublicFormMock({ form: baseForm() })] });

		// MUI's CircularProgress renders with role="progressbar".
		expect(screen.getByRole("progressbar")).toBeInTheDocument();

		expect(await screen.findByText("Tattoo Consent Form")).toBeInTheDocument();
		expect(screen.getByText("Please fill this out before your appointment.")).toBeInTheDocument();
		expect(screen.getByText("Any allergies?")).toBeInTheDocument();
		// The guest identity fields the page collects itself, on top of whatever FormFieldsRenderer
		// renders for the form's own fields - never gated behind auth, this is the guest path.
		expect(screen.getByLabelText("First name")).toBeInTheDocument();
		expect(screen.getByLabelText("Last name")).toBeInTheDocument();
		expect(screen.getByLabelText("Email")).toBeInTheDocument();
		expect(screen.getByLabelText("Phone (optional)")).toBeInTheDocument();
	});

	it("omits the description paragraph when the form has none", async () => {
		renderPage({ mocks: [getPublicFormMock({ form: baseForm({ description: "" }) })] });

		await screen.findByText("Tattoo Consent Form");
		expect(document.querySelector(".settingsPanelHelp")).not.toBeInTheDocument();
	});

	// A bad/expired token is a real, expected case on a public link (see the component's own header
	// comment) - one generic dead-end message, unlike the slug-based sibling's three distinct
	// lookup states, since GET_PUBLIC_FORM has no equivalent PublicFormLookup state to distinguish.
	it("shows a generic dead-end message when the token doesn't resolve to a form", async () => {
		renderPage({ mocks: [getPublicFormMock({ form: null })] });

		expect(
			await screen.findByText(
				"This link doesn't work - it may have expired or is no longer accepting responses.",
			),
		).toBeInTheDocument();
		expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
		expect(screen.queryByText("Tattoo Consent Form")).not.toBeInTheDocument();
	});

	it("shows the same dead-end message on a network/GraphQL error", async () => {
		renderPage({ mocks: [getPublicFormMock({ networkError: true })] });

		expect(
			await screen.findByText(
				"This link doesn't work - it may have expired or is no longer accepting responses.",
			),
		).toBeInTheDocument();
	});

	it("renders a single_choice field's options as radios and a signature field as a typed-name input", async () => {
		renderPage({ mocks: [getPublicFormMock({ form: multiFieldForm() })] });

		await screen.findByText("Preferred contact method");
		expect(screen.getByRole("radio", { name: "Email" })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "Phone" })).toBeInTheDocument();
		expect(screen.getByLabelText("Type your full legal name to sign")).toBeInTheDocument();
	});

	it("submits guest info and every field type's answer, sending the exact publicToken/mutation shape", async () => {
		const user = userEvent.setup();
		const form = multiFieldForm();

		const submitMock = {
			request: {
				query: FormService.SUBMIT_FORM_RESPONSE,
				variables: {
					input: {
						publicToken: PUBLIC_TOKEN,
						firstName: "Arya",
						lastName: "Stark",
						email: "arya@example.com",
						phone: null,
						answers: [
							{
								fieldKey: "notes",
								textValue: "None",
								selectedOptions: [],
								dateValue: null,
								fileUrls: [],
								signedName: null,
							},
							{
								fieldKey: "contact_pref",
								textValue: null,
								selectedOptions: ["Email"],
								dateValue: null,
								fileUrls: [],
								signedName: null,
							},
							{
								fieldKey: "appt_date",
								textValue: null,
								selectedOptions: [],
								dateValue: "2026-09-01",
								fileUrls: [],
								signedName: null,
							},
							{
								fieldKey: "waiver",
								textValue: null,
								selectedOptions: [],
								dateValue: null,
								fileUrls: [],
								signedName: "Arya Stark",
							},
						],
					},
				},
			},
			result: { data: { submitFormResponse: formResponse() } },
		};

		renderPage({ mocks: [getPublicFormMock({ form }), submitMock] });

		await screen.findByText("Tattoo Consent Form");

		await user.type(screen.getByLabelText("First name"), "Arya");
		await user.type(screen.getByLabelText("Last name"), "Stark");
		await user.type(screen.getByLabelText("Email"), "arya@example.com");
		// Phone left blank on purpose - the component sends `phone || null` for an empty string.
		await user.type(screen.getByLabelText("Any allergies?"), "None");
		await user.click(screen.getByRole("radio", { name: "Email" }));
		const dateField = screen.getByLabelText("Preferred appointment date");
		await user.clear(dateField);
		await user.type(dateField, "2026-09-01");
		await user.type(screen.getByLabelText("Type your full legal name to sign"), "Arya Stark");

		await user.click(screen.getByRole("button", { name: /submit/i }));

		// Reaching the success screen (rather than the mutation hanging on an unmatched mock) IS the
		// proof the variables above matched byte-for-byte what MockedProvider was told to expect.
		expect(await screen.findByText("Thanks, Arya")).toBeInTheDocument();
		expect(
			screen.getByText('Your response to "Tattoo Consent Form" has been received.'),
		).toBeInTheDocument();
	});

	it("shows Submitting... and disables the button while the mutation is in flight", async () => {
		const user = userEvent.setup();
		const form = baseForm();
		const submitMock = {
			request: {
				query: FormService.SUBMIT_FORM_RESPONSE,
				variables: {
					input: {
						publicToken: PUBLIC_TOKEN,
						firstName: "Arya",
						lastName: "Stark",
						email: "arya@example.com",
						phone: null,
						answers: [
							{
								fieldKey: "allergies",
								textValue: "None",
								selectedOptions: [],
								dateValue: null,
								fileUrls: [],
								signedName: null,
							},
						],
					},
				},
			},
			delay: 20,
			result: { data: { submitFormResponse: formResponse() } },
		};
		renderPage({ mocks: [getPublicFormMock({ form }), submitMock] });

		await screen.findByText("Tattoo Consent Form");
		await user.type(screen.getByLabelText("First name"), "Arya");
		await user.type(screen.getByLabelText("Last name"), "Stark");
		await user.type(screen.getByLabelText("Email"), "arya@example.com");
		await user.type(screen.getByLabelText("Any allergies?"), "None");
		const submitButton = screen.getByRole("button", { name: /submit/i });
		await user.click(submitButton);

		// The button's own text is replaced by a bare CircularProgress while submitting (no
		// "Submit" text on screen), so it's checked by the reference grabbed before the click rather
		// than re-queried by name afterward.
		expect(submitButton).toBeDisabled();
		expect(await screen.findByText("Thanks, Arya")).toBeInTheDocument();
	});

	it("shows each field's own server-side validation error under that field, from extensions.errors", async () => {
		const user = userEvent.setup();
		// required: false here (unlike baseForm()'s default) so leaving it blank doesn't trip the
		// input's own native HTML5 required constraint and block the submit before it ever reaches
		// the mutation - the point of this test is the SERVER's own required-field rejection
		// (assertAnswersMatchFields, per FormFieldsRenderer.jsx's own header comment: "the server is
		// the actual authority on what required means here"), not the browser's.
		const form = baseForm({
			fields: [{ ...baseForm().fields[0], required: false }],
		});
		const failingMock = {
			request: {
				query: FormService.SUBMIT_FORM_RESPONSE,
				variables: {
					input: {
						publicToken: PUBLIC_TOKEN,
						firstName: "Arya",
						lastName: "Stark",
						email: "arya@example.com",
						phone: null,
						answers: [
							{
								fieldKey: "allergies",
								textValue: null,
								selectedOptions: [],
								dateValue: null,
								fileUrls: [],
								signedName: null,
							},
						],
					},
				},
			},
			result: {
				errors: [
					{
						message: "This form has validation errors.",
						extensions: { errors: { allergies: "This question is required." } },
					},
				],
			},
		};
		renderPage({ mocks: [getPublicFormMock({ form }), failingMock] });

		await screen.findByText("Tattoo Consent Form");
		await user.type(screen.getByLabelText("First name"), "Arya");
		await user.type(screen.getByLabelText("Last name"), "Stark");
		await user.type(screen.getByLabelText("Email"), "arya@example.com");
		await user.click(screen.getByRole("button", { name: /submit/i }));

		expect(await screen.findByText("This question is required.")).toBeInTheDocument();
		// A field-level error, not the general one - and the guest is left on the form to fix it
		// rather than bounced to a dead end.
		expect(screen.getByText("Tattoo Consent Form")).toBeInTheDocument();
	});

	it("shows a general error message when the server error carries no field-level extensions", async () => {
		const user = userEvent.setup();
		const form = baseForm();
		const failingMock = {
			request: {
				query: FormService.SUBMIT_FORM_RESPONSE,
				variables: {
					input: {
						publicToken: PUBLIC_TOKEN,
						firstName: "Arya",
						lastName: "Stark",
						email: "arya@example.com",
						phone: null,
						answers: [
							{
								fieldKey: "allergies",
								textValue: "None",
								selectedOptions: [],
								dateValue: null,
								fileUrls: [],
								signedName: null,
							},
						],
					},
				},
			},
			result: {
				errors: [{ message: "This link is no longer accepting responses." }],
			},
		};
		renderPage({ mocks: [getPublicFormMock({ form }), failingMock] });

		await screen.findByText("Tattoo Consent Form");
		await user.type(screen.getByLabelText("First name"), "Arya");
		await user.type(screen.getByLabelText("Last name"), "Stark");
		await user.type(screen.getByLabelText("Email"), "arya@example.com");
		await user.type(screen.getByLabelText("Any allergies?"), "None");
		await user.click(screen.getByRole("button", { name: /submit/i }));

		expect(
			await screen.findByText("This link is no longer accepting responses."),
		).toBeInTheDocument();
	});

	it("sends phone when provided rather than null", async () => {
		const user = userEvent.setup();
		const form = baseForm();
		const submitMock = {
			request: {
				query: FormService.SUBMIT_FORM_RESPONSE,
				variables: {
					input: {
						publicToken: PUBLIC_TOKEN,
						firstName: "Arya",
						lastName: "Stark",
						email: "arya@example.com",
						phone: "555-0100",
						answers: [
							{
								fieldKey: "allergies",
								textValue: "None",
								selectedOptions: [],
								dateValue: null,
								fileUrls: [],
								signedName: null,
							},
						],
					},
				},
			},
			result: { data: { submitFormResponse: formResponse() } },
		};
		renderPage({ mocks: [getPublicFormMock({ form }), submitMock] });

		await screen.findByText("Tattoo Consent Form");
		await user.type(screen.getByLabelText("First name"), "Arya");
		await user.type(screen.getByLabelText("Last name"), "Stark");
		await user.type(screen.getByLabelText("Email"), "arya@example.com");
		await user.type(screen.getByLabelText("Phone (optional)"), "555-0100");
		await user.type(screen.getByLabelText("Any allergies?"), "None");
		await user.click(screen.getByRole("button", { name: /submit/i }));

		expect(await screen.findByText("Thanks, Arya")).toBeInTheDocument();
	});

	it("never renders any authenticated chrome - no AuthContext is used by this guest-facing page", async () => {
		// Deliberately no AuthContext.Provider anywhere in this file's renderPage helper. Reaching
		// the form at all (rather than useAuth() throwing on an undefined context) is itself part of
		// the proof that this component reads nothing from context/auth - see the component's own
		// header comment on why it follows BookingRequest.jsx's public-page precedent instead.
		renderPage({ mocks: [getPublicFormMock({ form: baseForm() })] });

		expect(await screen.findByText("Tattoo Consent Form")).toBeInTheDocument();
	});
});
