// PublicFormBySlugFillOut.jsx tests - the PUBLIC, unauthenticated guest-facing fill-out page for
// /<formSlug>/<ownerHandle> links (e.g. /consent/dana-wolfe). Contrast with FormFillOut.jsx, the
// logged-in-user-facing page covered elsewhere - this file is guest-only, so no AuthContext is
// used anywhere below: the component itself imports nothing from context/auth, reads only
// useParams for the slug/handle, and resolves the form entirely through the public
// GET_PUBLIC_FORM_BY_SLUG query (see FormService.js's own comment on why this is a separate,
// deliberately narrow query from the authenticated getForm).
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PublicFormBySlugFillOut from "./PublicFormBySlugFillOut";
import FormService from "../../services/FormService";

const FORM_SLUG = "consent";
const OWNER_HANDLE = "dana-wolfe";

// Built from FormService's own exported GET_PUBLIC_FORM_BY_SLUG/SUBMIT_FORM_RESPONSE documents
// rather than hand-copied query strings, the same convention UpdateEventDialog.test.jsx follows -
// so these mocks can't silently drift away from what the component actually sends.
function lookupMock({ state = "ok", form = null } = {}) {
	return {
		request: {
			query: FormService.GET_PUBLIC_FORM_BY_SLUG,
			variables: { formSlug: FORM_SLUG, ownerHandle: OWNER_HANDLE },
		},
		result: {
			data: {
				getPublicFormBySlug: {
					__typename: "PublicFormLookup",
					state,
					form,
				},
			},
		},
	};
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

// The route below mirrors the real one this component is reached through - a dynamic
// :formSlug/:ownerHandle pair - so useParams resolves the same way it does in the app rather than
// being stubbed out. MemoryRouter + Routes/Route is the standard RTL way to exercise useParams;
// UpdateEventDialog.test.jsx uses the bare MemoryRouter form for useNavigate, this component needs
// the Route layer on top since it actually reads params out of the URL.
function renderPage({ mocks = [], path = `/${FORM_SLUG}/${OWNER_HANDLE}` } = {}) {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<MockedProvider mocks={mocks}>
				<Routes>
					<Route path="/:formSlug/:ownerHandle" element={<PublicFormBySlugFillOut />} />
				</Routes>
			</MockedProvider>
		</MemoryRouter>
	);
}

describe("PublicFormBySlugFillOut", () => {
	it("shows a loading state, then renders the resolved form's title and fields", async () => {
		renderPage({ mocks: [lookupMock({ state: "ok", form: baseForm() })] });

		// MUI's CircularProgress renders with role="progressbar".
		expect(screen.getByRole("progressbar")).toBeInTheDocument();

		expect(await screen.findByText("Tattoo Consent Form")).toBeInTheDocument();
		expect(screen.getByText("Please fill this out before your appointment.")).toBeInTheDocument();
		expect(screen.getByText("Any allergies?")).toBeInTheDocument();
		// The guest identity fields the page collects itself, on top of whatever FormFieldsRenderer
		// renders for the form's own fields.
		expect(screen.getByLabelText("First name")).toBeInTheDocument();
		expect(screen.getByLabelText("Last name")).toBeInTheDocument();
		expect(screen.getByLabelText("Email")).toBeInTheDocument();
	});

	// A bad slug is a real, expected case on a public URL (typo'd link, unpublished form, an
	// artist who left the platform) - see STATE_MESSAGES in the component and PublicFormLookup's
	// own header comment in typeDefs.js for why these three states are distinguished rather than
	// collapsed into one generic dead end.
	it("shows the not-found message for an invalid slug, distinct from the other error states", async () => {
		renderPage({ mocks: [lookupMock({ state: "not_found", form: null })] });

		expect(
			await screen.findByText("This link doesn't work. Double-check it and try again.")
		).toBeInTheDocument();
		// No guest fields and no form title should render at all in this state.
		expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
		expect(screen.queryByText("Tattoo Consent Form")).not.toBeInTheDocument();
	});

	it("shows a distinct message when the form itself has been marked inactive", async () => {
		renderPage({ mocks: [lookupMock({ state: "inactive", form: null })] });

		expect(
			await screen.findByText("This form has been marked as inactive.")
		).toBeInTheDocument();
	});

	it("submits guest info and answers, sending the resolved slug/handle plus mutation variables", async () => {
		const user = userEvent.setup();
		const form = baseForm();

		const submitMock = {
			request: {
				query: FormService.SUBMIT_FORM_RESPONSE,
				variables: {
					input: {
						formSlug: FORM_SLUG,
						ownerHandle: OWNER_HANDLE,
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
				data: {
					submitFormResponse: {
						__typename: "FormResponse",
						id: "resp-1",
						formId: form.id,
						shopId: null,
						artistUserId: "artist-1",
						formTitle: form.title,
						fieldsSnapshot: [],
						clientId: null,
						client: null,
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
						source: "public_slug",
						createdAt: "2026-08-21T12:00:00.000Z",
					},
				},
			},
		};

		renderPage({ mocks: [lookupMock({ state: "ok", form }), submitMock] });

		await screen.findByText("Tattoo Consent Form");

		await user.type(screen.getByLabelText("First name"), "Arya");
		await user.type(screen.getByLabelText("Last name"), "Stark");
		await user.type(screen.getByLabelText("Email"), "arya@example.com");
		// Phone left blank on purpose - the component sends `phone || null` for an empty string.
		await user.type(screen.getByLabelText("Any allergies?"), "None");

		await user.click(screen.getByRole("button", { name: /submit/i }));

		// Reaching the success screen (rather than the mutation hanging/erroring) is the proof the
		// variables above matched byte-for-byte what MockedProvider was told to expect.
		expect(await screen.findByText("Thanks, Arya")).toBeInTheDocument();
		expect(
			screen.getByText('Your response to "Tattoo Consent Form" has been received.')
		).toBeInTheDocument();
	});
});
