// FormBuilder.jsx tests - the generic add/remove/reorder field editor used for every Form except
// the restricted booking_request one (see BookingRequestFieldsEditor.test.jsx for that sibling's
// own tests, and FormBuilder.jsx's own header comment on the "new"-vs-real-formId split this file
// tests both sides of).
//
// A NOTE ON DRAG-AND-DROP: same as BookingRequestFieldsEditor.test.jsx's own header comment -
// simulating a real dnd-kit pointer/keyboard drag through jsdom (no real layout engine, so every
// getBoundingClientRect() is zero-sized) is unreliable in a way that has nothing to do with
// whether this component's own code is correct. Reordering itself is untested here for that
// reason; see BookingRequestFieldsEditor.test.jsx for how the same reorder algorithm (arrayMove
// keyed by the sortable id) is exercised directly instead of through a simulated gesture - it
// applies identically to FormBuilder's own handleDragEnd, just keyed by field._localId instead of
// field.key.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import FormBuilder from "./FormBuilder";
import { AuthContext } from "../../context/auth";
import FormService from "../../services/FormService";

const FORM_ID = "form-1";

// role: 10 / 20 match ROLES.SHOP_ADMIN / ROLES.ARTIST (see utils/businessScope.js's own comment
// pointing at server/utils/with-auth.js: SHOP_ADMIN=10, SHOP_STAFF=15, ARTIST=20, CLIENT=30).
const SHOP_USER = {
	id: "artist-1",
	firstName: "Dana",
	lastName: "Wolfe",
	role: 10,
	userInfo: { shop: { id: "shop-1" } },
};

const INDEPENDENT_ARTIST = {
	id: "artist-2",
	firstName: "Jon",
	lastName: "Snow",
	role: 20,
	userInfo: null,
};

function baseForm(overrides = {}) {
	return {
		__typename: "Form",
		id: FORM_ID,
		shopId: "shop-1",
		artistUserId: null,
		title: "Consent Form",
		description: "Please fill out before your appointment.",
		status: "draft",
		allowGuestSubmissions: false,
		publicToken: null,
		slug: "consent",
		shopUseOnly: true,
		systemKey: null,
		fields: [
			{
				__typename: "FormField",
				key: "f1",
				type: "short_text",
				label: "Full legal name",
				helpText: "",
				required: true,
				options: [],
				hidden: false,
			},
			{
				__typename: "FormField",
				key: "f2",
				type: "single_choice",
				label: "Preferred contact method",
				helpText: "",
				required: false,
				options: ["Email", "Phone"],
				hidden: false,
			},
		],
		createdByUserId: "artist-1",
		createdBy: { __typename: "User", id: "artist-1", firstName: "Dana", lastName: "Wolfe" },
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// Built from FormService's own exported query/mutation documents rather than hand-copied query
// strings - see UpdateEventDialog.test.jsx's own comment on why - so these mocks can't silently
// drift away from what the component actually sends.
function getFormMock({ formId = FORM_ID, form = baseForm() } = {}) {
	return {
		request: { query: FormService.FETCH_FORM, variables: { formId } },
		result: { data: { getForm: form } },
	};
}

function createFormMock({ input, resultForm = baseForm() }) {
	return {
		request: { query: FormService.CREATE_FORM, variables: { input } },
		result: { data: { createForm: resultForm } },
	};
}

function updateFormMock({ input, resultForm = baseForm() }) {
	return {
		request: { query: FormService.UPDATE_FORM, variables: { input } },
		result: { data: { updateForm: resultForm } },
	};
}

function publishFormMock({ formId = FORM_ID, resultForm = baseForm({ status: "published" }) } = {}) {
	return {
		request: { query: FormService.PUBLISH_FORM, variables: { formId } },
		result: { data: { publishForm: resultForm } },
	};
}

function archiveFormMock({ formId = FORM_ID, resultForm = baseForm({ status: "archived" }) } = {}) {
	return {
		request: { query: FormService.ARCHIVE_FORM, variables: { formId } },
		result: { data: { archiveForm: resultForm } },
	};
}

function guestAccessMock({ formId = FORM_ID, allow, resultForm }) {
	return {
		request: { query: FormService.SET_FORM_GUEST_ACCESS, variables: { formId, allow } },
		result: { data: { setFormGuestAccess: resultForm } },
	};
}

// Route + Routes on top of MemoryRouter, the same way PublicFormBySlugFillOut.test.jsx and
// BookingRequestFieldsEditor.test.jsx exercise useParams for real rather than stubbing it out -
// FormBuilder reads formId straight off the URL (and isNew off the literal string "new"), not a
// prop.
function renderBuilder({ formId = FORM_ID, mocks = [], user = SHOP_USER, contextOverrides = {} } = {}) {
	const contextValue = { user, setAlert: vi.fn(), ...contextOverrides };
	render(
		<MemoryRouter initialEntries={[`/forms/${formId}`]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={contextValue}>
					<Routes>
						<Route path="/forms/:formId" element={<FormBuilder />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>
	);
	return contextValue;
}

// Renders the "new" side of the two-mode split at its real route. A second, generic route sits
// alongside it purely to OBSERVE navigation: react-router ranks the literal "/forms/new" above the
// dynamic "/forms/:formId" regardless of declaration order, so this stays on FormBuilder itself
// until (and unless) handleSave's own navigate() call fires after a successful create - at which
// point the URL becomes "/forms/<newId>" and only the marker route matches, proving the real
// navigate call ran with the real new id rather than asserting on a mocked useNavigate.
function NavigatedFormMarker() {
	const { formId } = useParams();
	return <div data-testid="navigated-form">{formId}</div>;
}

function renderNewFormBuilder({ mocks = [], user = SHOP_USER, contextOverrides = {} } = {}) {
	const contextValue = { user, setAlert: vi.fn(), ...contextOverrides };
	render(
		<MemoryRouter initialEntries={["/forms/new"]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={contextValue}>
					<Routes>
						<Route path="/forms/new" element={<FormBuilder />} />
						<Route path="/forms/:formId" element={<NavigatedFormMarker />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>
	);
	return contextValue;
}

describe("FormBuilder", () => {
	describe("loading and not-found states", () => {
		it("shows a page loader while the existing form is still being fetched", () => {
			renderBuilder({ mocks: [getFormMock()] });
			// MUI's CircularProgress renders with role="progressbar" - asserted before any await, so
			// this only passes if the loader is actually what's on screen before the mock resolves.
			expect(screen.getByRole("progressbar")).toBeInTheDocument();
		});

		it("shows a not-found message when getForm resolves to null", async () => {
			renderBuilder({ mocks: [getFormMock({ form: null })] });

			expect(await screen.findByText("This form could not be found.")).toBeInTheDocument();
		});

		// Nothing in the app links here for the booking_request form any more (Forms.jsx routes its
		// own "Edit" to /forms/:id/booking-fields instead - see FormBuilder.jsx's header comment),
		// but a stale bookmark or typed URL could still land on this generic builder directly, which
		// would silently let someone edit fields the real booking pipeline has no way to honor. A
		// second, more specific route sits alongside the real one purely to observe the redirect -
		// it's only reachable if navigate(`/forms/${FORM_ID}/booking-fields`, {replace:true}) ran.
		it("redirects away from the booking_request system form to its restricted editor", async () => {
			render(
				<MemoryRouter initialEntries={[`/forms/${FORM_ID}`]}>
					<MockedProvider mocks={[getFormMock({ form: baseForm({ systemKey: "booking_request" }) })]}>
						<AuthContext.Provider value={{ user: SHOP_USER, setAlert: vi.fn() }}>
							<Routes>
								<Route path="/forms/:formId" element={<FormBuilder />} />
								<Route
									path="/forms/:formId/booking-fields"
									element={<div data-testid="redirected-to-booking-fields" />}
								/>
							</Routes>
						</AuthContext.Provider>
					</MockedProvider>
				</MemoryRouter>
			);

			expect(await screen.findByTestId("redirected-to-booking-fields")).toBeInTheDocument();
		});
	});

	describe("new form (formId: 'new')", () => {
		it("shows the shop-use-only checkbox for a shop-scoped user", () => {
			renderNewFormBuilder({ user: SHOP_USER });
			expect(screen.getByRole("checkbox", { name: /shop use only/i })).toBeInTheDocument();
		});

		// businessScopeFor falls back to {artistUserId} for anyone who isn't a shop admin with a
		// shop - the shop-use-only toggle ("one shared link for the whole shop") has no meaning for
		// an independent artist, so it isn't just disabled, it doesn't render at all.
		it("hides the shop-use-only checkbox for an independent artist", () => {
			renderNewFormBuilder({ user: INDEPENDENT_ARTIST });
			expect(screen.queryByRole("checkbox", { name: /shop use only/i })).not.toBeInTheDocument();
		});

		it("disables Create Form until there's a title and at least one labeled field", async () => {
			const user = userEvent.setup();
			renderNewFormBuilder();

			const submit = screen.getByRole("button", { name: "Create Form" });
			expect(submit).toBeDisabled();

			await user.type(screen.getByLabelText("Title"), "Waiver");
			expect(submit).toBeDisabled(); // still no fields at all

			await user.click(screen.getByRole("button", { name: "Add Field" }));
			expect(submit).toBeDisabled(); // the new field has no label yet

			await user.type(screen.getByLabelText(/question/i), "Signature");
			expect(submit).not.toBeDisabled();
		});

		it("keeps Create Form disabled for a choice field until it has two real options", async () => {
			const user = userEvent.setup();
			renderNewFormBuilder();

			await user.type(screen.getByLabelText("Title"), "Waiver");
			await user.click(screen.getByRole("button", { name: "Add Field" }));
			await user.type(screen.getByLabelText(/question/i), "Pick one");

			await user.click(screen.getByRole("combobox", { name: /type/i }));
			await user.click(screen.getByRole("option", { name: "Single choice" }));

			const submit = screen.getByRole("button", { name: "Create Form" });
			expect(screen.getByText("A choice field needs at least two options.")).toBeInTheDocument();
			expect(submit).toBeDisabled();

			await user.click(screen.getByRole("button", { name: "Add option" }));
			await user.click(screen.getByRole("button", { name: "Add option" }));
			await user.type(screen.getByLabelText("Option 1"), "Email");
			await user.type(screen.getByLabelText("Option 2"), "Phone");

			expect(screen.queryByText("A choice field needs at least two options.")).not.toBeInTheDocument();
			expect(submit).not.toBeDisabled();
		});

		it("creates a form for a shop-scoped user with {shopId} spread into the input, then navigates to it", async () => {
			const user = userEvent.setup();
			const input = {
				shopId: "shop-1",
				title: "Waiver",
				description: "",
				slug: null,
				shopUseOnly: false,
				fields: [{ type: "short_text", label: "Signature", helpText: "", required: false, options: [] }],
			};
			const contextValue = renderNewFormBuilder({
				mocks: [createFormMock({ input, resultForm: baseForm({ id: "form-999" }) })],
			});

			await user.type(screen.getByLabelText("Title"), "Waiver");
			await user.click(screen.getByRole("button", { name: "Add Field" }));
			await user.type(screen.getByLabelText(/question/i), "Signature");
			await user.click(screen.getByRole("button", { name: "Create Form" }));

			// Only resolves if MockedProvider matched createForm's variables exactly, including the
			// {shopId} createScopeFor spread - a wrong scope key here would leave this pending.
			expect(await screen.findByTestId("navigated-form")).toHaveTextContent("form-999");
			expect(contextValue.setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ message: "Form created." })
			);
		});

		// createScopeFor returns {} (not {artistUserId}) for anyone without a shop, because
		// CreateFormInput has no artistUserId field at all - the server infers it from the caller.
		// Spreading businessScopeFor's full scope here instead would send a field the schema
		// doesn't define and GraphQL would reject the whole mutation outright.
		it("creates a form for an independent artist with no shop/artist scope key in the input", async () => {
			const user = userEvent.setup();
			const input = {
				title: "Intake",
				description: "",
				slug: null,
				shopUseOnly: false,
				fields: [{ type: "short_text", label: "Name", helpText: "", required: false, options: [] }],
			};
			renderNewFormBuilder({
				user: INDEPENDENT_ARTIST,
				mocks: [
					createFormMock({
						input,
						resultForm: baseForm({ id: "form-500", shopId: null, artistUserId: INDEPENDENT_ARTIST.id }),
					}),
				],
			});

			await user.type(screen.getByLabelText("Title"), "Intake");
			await user.click(screen.getByRole("button", { name: "Add Field" }));
			await user.type(screen.getByLabelText(/question/i), "Name");
			await user.click(screen.getByRole("button", { name: "Create Form" }));

			expect(await screen.findByTestId("navigated-form")).toHaveTextContent("form-500");
		});
	});

	describe("editing an existing form", () => {
		it("renders the existing form's title, description, slug, fields, and status for editing", async () => {
			renderBuilder({ mocks: [getFormMock()] });

			expect(await screen.findByDisplayValue("Consent Form")).toBeInTheDocument();
			expect(screen.getByDisplayValue("Please fill out before your appointment.")).toBeInTheDocument();
			expect(screen.getByDisplayValue("consent")).toBeInTheDocument();
			expect(screen.getByDisplayValue("Full legal name")).toBeInTheDocument();
			expect(screen.getByDisplayValue("Preferred contact method")).toBeInTheDocument();
			expect(screen.getByDisplayValue("Email")).toBeInTheDocument();
			expect(screen.getByDisplayValue("Phone")).toBeInTheDocument();

			const requiredField = screen.getByDisplayValue("Full legal name").closest(".fieldEditorRow");
			expect(within(requiredField).getByRole("checkbox", { name: /required/i })).toBeChecked();
			const optionalField = screen
				.getByDisplayValue("Preferred contact method")
				.closest(".fieldEditorRow");
			expect(within(optionalField).getByRole("checkbox", { name: /required/i })).not.toBeChecked();

			expect(screen.getByRole("checkbox", { name: /shop use only/i })).toBeChecked();
			expect(screen.getByText("Draft")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
			expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
			expect(screen.getByRole("link", { name: /view responses/i })).toHaveAttribute(
				"href",
				`/forms/${FORM_ID}/responses`
			);
		});

		it("Add Field appends a new, blank field to the editor", async () => {
			const user = userEvent.setup();
			renderBuilder({ mocks: [getFormMock()] });

			await screen.findByDisplayValue("Full legal name");
			expect(screen.getAllByLabelText(/question/i)).toHaveLength(2);

			await user.click(screen.getByRole("button", { name: "Add Field" }));

			const questions = screen.getAllByLabelText(/question/i);
			expect(questions).toHaveLength(3);
			expect(questions[2]).toHaveValue("");
		});

		it("Remove field deletes just that field, leaving the others in place", async () => {
			const user = userEvent.setup();
			renderBuilder({ mocks: [getFormMock()] });

			await screen.findByDisplayValue("Full legal name");
			await user.click(screen.getAllByLabelText("Remove field")[0]);

			expect(screen.queryByDisplayValue("Full legal name")).not.toBeInTheDocument();
			expect(screen.getByDisplayValue("Preferred contact method")).toBeInTheDocument();
		});

		it("Save Changes calls updateForm with the edited title and each field's existing key preserved", async () => {
			const user = userEvent.setup();
			const input = {
				formId: FORM_ID,
				title: "Consent Form v2",
				description: "Please fill out before your appointment.",
				slug: "consent",
				shopUseOnly: true,
				fields: [
					{ key: "f1", type: "short_text", label: "Full legal name", helpText: "", required: true, options: [] },
					{
						key: "f2",
						type: "single_choice",
						label: "Preferred contact method",
						helpText: "",
						required: false,
						options: ["Email", "Phone"],
					},
				],
			};
			const contextValue = renderBuilder({ mocks: [getFormMock(), updateFormMock({ input })] });

			const titleField = await screen.findByDisplayValue("Consent Form");
			await user.clear(titleField);
			await user.type(titleField, "Consent Form v2");
			await user.click(screen.getByRole("button", { name: "Save Changes" }));

			// Only resolves if MockedProvider matched updateForm's variables exactly - including the
			// untouched field's `key` round-tripping back rather than being dropped or regenerated.
			await waitFor(() =>
				expect(contextValue.setAlert).toHaveBeenCalledWith(
					expect.objectContaining({ message: "Form saved." })
				)
			);
		});

		it("Publish calls publishForm and swaps the action to Archive once published", async () => {
			const user = userEvent.setup();
			const contextValue = renderBuilder({ mocks: [getFormMock(), publishFormMock()] });

			await screen.findByRole("button", { name: "Publish" });
			await user.click(screen.getByRole("button", { name: "Publish" }));

			expect(await screen.findByRole("button", { name: "Archive" })).toBeInTheDocument();
			expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
			expect(screen.getByText("Published")).toBeInTheDocument();
			expect(contextValue.setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ message: "Form published." })
			);
		});

		it("Archive calls archiveForm and brings the Publish action back (no separate 'republish' state)", async () => {
			const user = userEvent.setup();
			const contextValue = renderBuilder({
				mocks: [getFormMock({ form: baseForm({ status: "published" }) }), archiveFormMock()],
			});

			await screen.findByRole("button", { name: "Archive" });
			await user.click(screen.getByRole("button", { name: "Archive" }));

			expect(await screen.findByText("Archived")).toBeInTheDocument();
			// archiveForm's result has status "archived" - not "published" - so the same "Publish"
			// button a brand-new draft shows simply reappears; there's no dedicated archived-state
			// action of its own.
			expect(await screen.findByRole("button", { name: "Publish" })).toBeInTheDocument();
			expect(contextValue.setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ message: "Form archived." })
			);
		});

		it("turning the public link on calls setFormGuestAccess, copies the link, and displays it", async () => {
			const user = userEvent.setup();
			const writeText = vi.fn().mockResolvedValue(undefined);
			Object.defineProperty(window.navigator, "clipboard", {
				value: { writeText },
				configurable: true,
			});
			const contextValue = renderBuilder({
				mocks: [
					getFormMock({ form: baseForm({ allowGuestSubmissions: false, publicToken: null }) }),
					guestAccessMock({
						allow: true,
						resultForm: baseForm({ allowGuestSubmissions: true, publicToken: "tok-1" }),
					}),
				],
			});

			await user.click(await screen.findByRole("button", { name: /turn on public link/i }));

			expect(await screen.findByRole("button", { name: /turn off public link/i })).toBeInTheDocument();
			expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/form/tok-1`);
			expect(contextValue.setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ message: "Public link turned on and copied to your clipboard." })
			);
			expect(
				screen.getByText(
					(_, el) => el?.className === "formBuilderGuestLinkUrl" && el.textContent.includes("tok-1")
				)
			).toBeInTheDocument();
		});

		// handleToggleGuestAccess only calls showSuccess inside the "just turned ON, and got a real
		// token back" branch - turning it off updates loadedForm (the button label flips back, the
		// link block disappears) but shows no confirmation toast at all.
		it("turning the public link off calls setFormGuestAccess(allow:false), hides the link, and shows no success toast", async () => {
			const user = userEvent.setup();
			const contextValue = renderBuilder({
				mocks: [
					getFormMock({ form: baseForm({ allowGuestSubmissions: true, publicToken: "tok-1" }) }),
					guestAccessMock({
						allow: false,
						resultForm: baseForm({ allowGuestSubmissions: false, publicToken: null }),
					}),
				],
			});

			await user.click(await screen.findByRole("button", { name: /turn off public link/i }));

			expect(await screen.findByRole("button", { name: /turn on public link/i })).toBeInTheDocument();
			expect(screen.queryByText(/Public link:/)).not.toBeInTheDocument();
			expect(contextValue.setAlert).not.toHaveBeenCalled();
		});
	});
});
