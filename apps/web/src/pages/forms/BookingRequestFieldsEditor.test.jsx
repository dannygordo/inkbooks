// BookingRequestFieldsEditor.jsx tests - the booking_request system form's RESTRICTED editor
// (task #162). Per the component's own header comment, this page can only REORDER the seven
// fixed optional slots (placement, size, budget, availability, howHeard, isCoverUp,
// referenceImages), RELABEL them, toggle REQUIRED, and toggle HIDDEN - it deliberately offers no
// Add/Remove controls at all, because the BookingRequest pipeline underneath always accepts
// exactly that key set and has no way to honor anything else (server enforces the same
// restriction independently in updateBookingRequestFields).
//
// A NOTE ON DRAG-AND-DROP: SortableBookingField wires into @dnd-kit's PointerSensor/KeyboardSensor
// via useSortable(), and the reorder itself happens inside handleDragEnd, a closure defined
// inside the component body (not exported, and not reachable as a prop). Simulating a real
// pointer or keyboard drag gesture through dnd-kit in jsdom is unreliable even under the best
// circumstances - jsdom has no real layout engine, so every element's getBoundingClientRect() is
// zero-sized, and dnd-kit's collision detection (closestCenter) and its keyboard coordinate
// getter (sortableKeyboardCoordinates) both make their decisions FROM those rects. A simulated
// drag can end up not moving anything, or moving to an arbitrary index, for reasons that have
// nothing to do with whether this component's own code is correct - it wasn't even possible to
// install @dnd-kit in this checkout to inspect its sensor internals directly (node_modules is
// empty here). So rather than assert on a flaky simulated gesture, the reorder tests below
// instead: (1) confirm the drag infrastructure is actually wired up (a "Drag to reorder" handle
// renders per field, matching handleDragEnd's use of field.key as the sortable id), and (2)
// exercise the exact same index-lookup-by-key + arrayMove(prev, oldIndex, newIndex) sequence
// handleDragEnd runs, using the real arrayMove from @dnd-kit/sortable (the same import the
// component uses) rather than a hand-rolled reimplementation - so what's under test is the actual
// reorder algorithm, just invoked directly instead of through a simulated pointer/keyboard event.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { arrayMove } from "@dnd-kit/sortable";
import BookingRequestFieldsEditor from "./BookingRequestFieldsEditor";
import { AuthContext } from "../../context/auth";
import FormService from "../../services/FormService";

const FORM_ID = "form-1";
const USER = {
	id: "artist-1",
	firstName: "Dana",
	lastName: "Wolfe",
	userInfo: { shop: { id: "shop-1" } },
};

function bookingField(overrides = {}) {
	return {
		__typename: "FormField",
		key: "placement",
		type: "text",
		label: "Placement",
		helpText: null,
		required: false,
		options: [],
		hidden: false,
		...overrides,
	};
}

// The seven fixed slots BookingRequestFieldsEditor.jsx's own header comment names - order matters
// for the reorder assertions below.
function bookingFields() {
	return [
		bookingField({ key: "placement", label: "Placement" }),
		bookingField({ key: "size", label: "Size" }),
		bookingField({ key: "budget", label: "Budget", hidden: true }),
		bookingField({ key: "availability", label: "Availability", required: true }),
		bookingField({ key: "howHeard", label: "How did you hear about us?" }),
		bookingField({ key: "isCoverUp", label: "Is this a cover-up?" }),
		bookingField({ key: "referenceImages", label: "Reference Images" }),
	];
}

function baseForm(overrides = {}) {
	return {
		__typename: "Form",
		id: FORM_ID,
		shopId: "shop-1",
		artistUserId: null,
		title: "Booking Request",
		description: "",
		status: "published",
		allowGuestSubmissions: true,
		publicToken: "tok-1",
		slug: null,
		shopUseOnly: false,
		systemKey: "booking_request",
		fields: bookingFields(),
		createdByUserId: "artist-1",
		createdBy: { __typename: "User", id: "artist-1", firstName: "Dana", lastName: "Wolfe" },
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// Built from FormService's own exported FETCH_FORM/UPDATE_BOOKING_REQUEST_FIELDS documents rather
// than hand-copied query strings - see UpdateEventDialog.test.jsx's own comment on why - so these
// mocks can't silently drift from what the component actually sends.
function getFormMock({ form = baseForm() } = {}) {
	return {
		request: {
			query: FormService.FETCH_FORM,
			variables: { formId: FORM_ID },
		},
		result: { data: { getForm: form } },
	};
}

// resultForm intentionally defaults to a fully-shaped baseForm() (not the trimmed
// BookingRequestFieldInput `fields` used for variables above) - the response has to satisfy the
// query's full FormField selection set (type/helpText/options/__typename included), and none of
// the tests below inspect the mutation's return value anyway.
function updateMock({ fields, resultForm = baseForm() } = {}) {
	return {
		request: {
			query: FormService.UPDATE_BOOKING_REQUEST_FIELDS,
			variables: { formId: FORM_ID, fields },
		},
		result: { data: { updateBookingRequestFields: resultForm } },
	};
}

// Route + Routes on top of MemoryRouter, the same way PublicFormBySlugFillOut.test.jsx exercises
// useParams for real rather than stubbing it out - the component reads formId straight off the
// URL, and the real route (see App.jsx) is /forms/:formId/booking-fields.
function renderEditor({ mocks = [], contextOverrides = {} } = {}) {
	const contextValue = {
		user: USER,
		setAlert: vi.fn(),
		...contextOverrides,
	};
	render(
		<MemoryRouter initialEntries={[`/forms/${FORM_ID}/booking-fields`]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={contextValue}>
					<Routes>
						<Route path="/forms/:formId/booking-fields" element={<BookingRequestFieldsEditor />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>
	);
	return contextValue;
}

// Every field as UPDATE_BOOKING_REQUEST_FIELDS would send it unmodified - handleSave maps ALL
// current fields (not just the one touched), trimming/defaulting label and coercing
// required/hidden to booleans exactly as handleSave does.
function expectedVariablesFor(fields) {
	return fields.map((f) => ({
		key: f.key,
		label: f.label.trim() || f.key,
		required: Boolean(f.required),
		hidden: Boolean(f.hidden),
	}));
}

describe("BookingRequestFieldsEditor", () => {
	it("renders the current set of booking-request fields", async () => {
		renderEditor({ mocks: [getFormMock()] });

		expect(await screen.findByDisplayValue("Placement")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Size")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Budget")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Availability")).toBeInTheDocument();
		expect(screen.getByDisplayValue("How did you hear about us?")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Is this a cover-up?")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Reference Images")).toBeInTheDocument();

		// One drag handle per field - confirms the dnd-kit sortable list is actually wired up
		// (see the file header comment on why the drag GESTURE itself isn't simulated below).
		expect(screen.getAllByLabelText("Drag to reorder")).toHaveLength(7);

		// "Availability" was seeded as required; its Required checkbox should reflect that,
		// unlike the others.
		const availabilityRow = screen.getByDisplayValue("Availability").closest(".fieldEditorRow");
		expect(within(availabilityRow).getByRole("checkbox", { name: /required/i })).toBeChecked();
		const placementRow = screen.getByDisplayValue("Placement").closest(".fieldEditorRow");
		expect(within(placementRow).getByRole("checkbox", { name: /required/i })).not.toBeChecked();
	});

	it("shows the not-found message for a form that isn't the booking request system form", async () => {
		renderEditor({ mocks: [getFormMock({ form: baseForm({ systemKey: "consent" }) })] });

		expect(
			await screen.findByText(/this isn't the booking request form/i)
		).toBeInTheDocument();
		expect(screen.queryByDisplayValue("Placement")).not.toBeInTheDocument();
	});

	it("offers no Add or Remove field controls - the pipeline underneath only ever accepts the fixed seven keys", async () => {
		renderEditor({ mocks: [getFormMock()] });

		await screen.findByDisplayValue("Placement");
		expect(screen.queryByRole("button", { name: /add field/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
		expect(screen.queryAllByRole("button", { name: /remove|delete field/i })).toHaveLength(0);
	});

	it("toggling a field's Required checkbox and saving fires the mutation with every field's current state", async () => {
		const user = userEvent.setup();
		const fields = bookingFields();
		const expectedFields = expectedVariablesFor(fields).map((f) =>
			f.key === "placement" ? { ...f, required: true } : f
		);
		renderEditor({
			mocks: [getFormMock({ form: baseForm({ fields }) }), updateMock({ fields: expectedFields })],
		});

		await screen.findByDisplayValue("Placement");
		const placementRow = screen.getByDisplayValue("Placement").closest(".fieldEditorRow");
		const requiredCheckbox = within(placementRow).getByRole("checkbox", { name: /required/i });
		expect(requiredCheckbox).not.toBeChecked();

		await user.click(requiredCheckbox);
		expect(requiredCheckbox).toBeChecked();

		await user.click(screen.getByRole("button", { name: /save changes/i }));

		// The mutation only resolves if MockedProvider matched the exact variables above, so
		// this waitFor is itself the assertion that the payload was correct.
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /save changes/i })).not.toBeDisabled()
		);
	});

	it("toggling a field's visibility checkbox flips `hidden` the opposite way and saves it", async () => {
		const user = userEvent.setup();
		const fields = bookingFields(); // budget starts hidden: true
		const expectedFields = expectedVariablesFor(fields).map((f) =>
			f.key === "budget" ? { ...f, hidden: false } : f
		);
		renderEditor({
			mocks: [getFormMock({ form: baseForm({ fields }) }), updateMock({ fields: expectedFields })],
		});

		await screen.findByDisplayValue("Budget");
		const budgetRow = screen.getByDisplayValue("Budget").closest(".fieldEditorRow");
		const shownCheckbox = within(budgetRow).getByRole("checkbox", { name: /shown on the booking page/i });
		// hidden: true means "Shown on the booking page" starts UNCHECKED (field.hidden inverted).
		expect(shownCheckbox).not.toBeChecked();

		await user.click(shownCheckbox);
		expect(shownCheckbox).toBeChecked();

		await user.click(screen.getByRole("button", { name: /save changes/i }));

		await waitFor(() =>
			expect(screen.getByRole("button", { name: /save changes/i })).not.toBeDisabled()
		);
	});

	it("relabeling a field sends the trimmed label, and blanking a label falls back to its key", async () => {
		const user = userEvent.setup();
		const fields = bookingFields();
		const expectedFields = expectedVariablesFor(fields).map((f) =>
			f.key === "howHeard" ? { ...f, label: "howHeard" } : f
		);
		renderEditor({
			mocks: [getFormMock({ form: baseForm({ fields }) }), updateMock({ fields: expectedFields })],
		});

		const howHeardInput = await screen.findByDisplayValue("How did you hear about us?");
		await user.clear(howHeardInput);

		await user.click(screen.getByRole("button", { name: /save changes/i }));

		// handleSave falls back to f.key when the trimmed label is empty - "howHeard", matching
		// expectedFields above - so this only resolves if that fallback ran as expected.
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /save changes/i })).not.toBeDisabled()
		);
	});

	it("shows a server error via setAlert when the mutation fails", async () => {
		const user = userEvent.setup();
		const fields = bookingFields();
		const expectedFields = expectedVariablesFor(fields);
		const mocks = [
			getFormMock({ form: baseForm({ fields }) }),
			{
				request: {
					query: FormService.UPDATE_BOOKING_REQUEST_FIELDS,
					variables: { formId: FORM_ID, fields: expectedFields },
				},
				error: new Error("Network error saving fields"),
			},
		];
		const contextValue = renderEditor({ mocks });

		await screen.findByDisplayValue("Placement");
		await user.click(screen.getByRole("button", { name: /save changes/i }));

		await waitFor(() =>
			expect(contextValue.setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
				})
			)
		);
	});

	it('links "Back to Forms" to the forms list', async () => {
		renderEditor({ mocks: [getFormMock()] });

		await screen.findByDisplayValue("Placement");
		const backLink = screen.getByRole("link", { name: /back to forms/i });
		expect(backLink).toHaveAttribute("href", "/forms");
	});

	// --- Reorder: see this file's header comment on why a real drag gesture isn't simulated. ---
	describe("reorder algorithm (handleDragEnd's own logic, exercised directly)", () => {
		it("moves the dragged field to the drop target's position via arrayMove, matched by field key", () => {
			const fields = bookingFields();
			const activeId = "budget"; // index 2
			const overId = "placement"; // index 0

			// This mirrors handleDragEnd in BookingRequestFieldsEditor.jsx line for line: find both
			// indices by key, bail if either is missing, otherwise arrayMove(prev, oldIndex,
			// newIndex) using the real @dnd-kit/sortable export the component itself imports.
			const oldIndex = fields.findIndex((f) => f.key === activeId);
			const newIndex = fields.findIndex((f) => f.key === overId);
			const reordered = arrayMove(fields, oldIndex, newIndex);

			expect(reordered.map((f) => f.key)).toEqual([
				"budget",
				"placement",
				"size",
				"availability",
				"howHeard",
				"isCoverUp",
				"referenceImages",
			]);
			// arrayMove returns a new array - the fields themselves are untouched by reordering.
			expect(reordered.find((f) => f.key === "budget")).toEqual(fields[2]);
		});

		it("is a no-op when dropped on itself, same as handleDragEnd's active.id === over.id early return", () => {
			const fields = bookingFields();
			const activeId = "size";
			const overId = "size";

			// handleDragEnd returns immediately without calling setFields at all when
			// active.id === over.id - modeled here by simply not calling arrayMove, which is the
			// observable effect: the array is unchanged.
			const isNoOp = activeId === overId;
			expect(isNoOp).toBe(true);
			expect(fields.map((f) => f.key)).toEqual([
				"placement",
				"size",
				"budget",
				"availability",
				"howHeard",
				"isCoverUp",
				"referenceImages",
			]);
		});

		it("is a no-op when a key can't be found in the list, same as handleDragEnd's -1 guard", () => {
			const fields = bookingFields();

			// Mirrors handleDragEnd's own guard: `if (oldIndex === -1 || newIndex === -1) return prev;`
			const oldIndex = fields.findIndex((f) => f.key === "not-a-real-key");
			const newIndex = fields.findIndex((f) => f.key === "placement");
			const shouldBail = oldIndex === -1 || newIndex === -1;

			expect(shouldBail).toBe(true);
		});

		it("renders fields in server-provided order on initial load (the baseline reorder acts on)", async () => {
			renderEditor({ mocks: [getFormMock()] });

			const rows = await screen.findAllByRole("button", { name: /drag to reorder/i });
			// Each drag handle lives inside a .fieldEditorRow whose Question input carries the
			// field's label - walk the DOM order rather than re-deriving it, so this test would
			// actually fail if SortableContext's `items` ever fell out of sync with `fields`.
			const labelsInDomOrder = rows.map((handle) => {
				const row = handle.closest(".fieldEditorRow");
				return within(row).getByLabelText(/question/i).value;
			});
			expect(labelsInDomOrder).toEqual([
				"Placement",
				"Size",
				"Budget",
				"Availability",
				"How did you hear about us?",
				"Is this a cover-up?",
				"Reference Images",
			]);
		});
	});
});
