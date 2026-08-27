// FormFieldEditorRow.jsx tests - one draggable row in FormBuilder.jsx's field editor (task #160).
// Per the component's own header comment, this was split out of FormBuilder purely for the
// drag-wiring (useSortable/CSS.Transform/the drag-handle listeners), which has nothing to do with
// the surrounding page - see FormBuilder.test.jsx's own header comment for why a real drag GESTURE
// isn't simulated anywhere in this codebase (jsdom has no layout engine, so dnd-kit's collision
// detection has nothing real to work from). These tests instead cover what actually belongs to
// THIS component: the row's controlled inputs (label/type/help text/required), the choice-type-only
// options editor, and the plain callback wiring - not the reorder algorithm itself.
//
// useSortable/useDraggable read from React contexts (@dnd-kit/core's InternalContext,
// @dnd-kit/sortable's own Context) that both ship non-null default values, so the hook itself
// wouldn't crash unwrapped - but every real caller (FormBuilder.jsx) renders this row inside a
// DndContext > SortableContext, so the harness below wraps it the same way rather than relying on
// an implementation detail of dnd-kit's context defaults.
//
// Because FormFieldEditorRow is fully controlled (every value comes from the `field` prop, every
// change goes out through a callback), a Harness below plays FormBuilder's own role - holding
// `field` in local state and feeding each callback's value back in as a patch, mirroring
// FormBuilder.jsx's own updateFieldAt - so a multi-character userEvent.type() behaves like it does
// in the real page instead of resetting on every keystroke.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import FormFieldEditorRow from "./FormFieldEditorRow";

function makeField(overrides = {}) {
	return {
		_localId: "local-1",
		key: undefined,
		type: "short_text",
		label: "Full name",
		helpText: "",
		required: false,
		options: [],
		...overrides,
	};
}

function renderRow({ initialField = makeField(), spies = {} } = {}) {
	const spy = {
		onLabelChange: vi.fn(),
		onTypeChange: vi.fn(),
		onHelpTextChange: vi.fn(),
		onRequiredChange: vi.fn(),
		onRemove: vi.fn(),
		onAddOption: vi.fn(),
		onOptionChange: vi.fn(),
		onRemoveOption: vi.fn(),
		...spies,
	};

	function Harness() {
		const [field, setField] = React.useState(initialField);
		return (
			<DndContext>
				<SortableContext items={[field._localId]} strategy={verticalListSortingStrategy}>
					<FormFieldEditorRow
						field={field}
						onLabelChange={(value) => {
							spy.onLabelChange(value);
							setField((prev) => ({ ...prev, label: value }));
						}}
						onTypeChange={(value) => {
							spy.onTypeChange(value);
							setField((prev) => ({ ...prev, type: value }));
						}}
						onHelpTextChange={(value) => {
							spy.onHelpTextChange(value);
							setField((prev) => ({ ...prev, helpText: value }));
						}}
						onRequiredChange={(value) => {
							spy.onRequiredChange(value);
							setField((prev) => ({ ...prev, required: value }));
						}}
						onRemove={spy.onRemove}
						onAddOption={() => {
							spy.onAddOption();
							setField((prev) => ({ ...prev, options: [...(prev.options || []), ""] }));
						}}
						onOptionChange={(idx, value) => {
							spy.onOptionChange(idx, value);
							setField((prev) => ({
								...prev,
								options: prev.options.map((o, i) => (i === idx ? value : o)),
							}));
						}}
						onRemoveOption={(idx) => {
							spy.onRemoveOption(idx);
							setField((prev) => ({
								...prev,
								options: prev.options.filter((_, i) => i !== idx),
							}));
						}}
					/>
				</SortableContext>
			</DndContext>
		);
	}

	const utils = render(<Harness />);
	return { spy, ...utils };
}

describe("FormFieldEditorRow", () => {
	it("renders the drag handle, the current label/type/required state, and no options editor for a non-choice type", () => {
		renderRow({ initialField: makeField() });

		expect(screen.getByRole("button", { name: "Drag to reorder" })).toBeInTheDocument();
		expect(screen.getByLabelText(/question/i)).toHaveValue("Full name");
		expect(screen.getByRole("combobox", { name: /type/i })).toHaveTextContent("Short answer");
		expect(screen.getByRole("checkbox", { name: /required/i })).not.toBeChecked();
		expect(screen.getByLabelText(/help text/i)).toHaveValue("");

		// short_text isn't in FORM_CHOICE_FIELD_TYPES, so the whole options editor is absent.
		expect(screen.queryByRole("button", { name: /add option/i })).not.toBeInTheDocument();
		expect(screen.queryByText(/needs at least two options/i)).not.toBeInTheDocument();
	});

	it("typing a new question label calls onLabelChange per keystroke and the input reflects the final value", async () => {
		const user = userEvent.setup();
		const { spy } = renderRow({ initialField: makeField({ label: "" }) });

		const questionInput = screen.getByLabelText(/question/i);
		await user.type(questionInput, "Client name");

		expect(questionInput).toHaveValue("Client name");
		expect(spy.onLabelChange).toHaveBeenLastCalledWith("Client name");
	});

	it("typing help text calls onHelpTextChange and the input reflects the final value", async () => {
		const user = userEvent.setup();
		const { spy } = renderRow({ initialField: makeField({ helpText: "" }) });

		const helpInput = screen.getByLabelText(/help text/i);
		await user.type(helpInput, "Optional context");

		expect(helpInput).toHaveValue("Optional context");
		expect(spy.onHelpTextChange).toHaveBeenLastCalledWith("Optional context");
	});

	it("toggling the Required checkbox calls onRequiredChange with the opposite boolean and re-renders checked", async () => {
		const user = userEvent.setup();
		const { spy } = renderRow({ initialField: makeField({ required: false }) });

		const checkbox = screen.getByRole("checkbox", { name: /required/i });
		expect(checkbox).not.toBeChecked();

		await user.click(checkbox);

		expect(spy.onRequiredChange).toHaveBeenCalledWith(true);
		expect(checkbox).toBeChecked();
	});

	it('clicking the "Remove field" icon button calls onRemove', async () => {
		const user = userEvent.setup();
		const { spy } = renderRow();

		await user.click(screen.getByRole("button", { name: "Remove field" }));

		expect(spy.onRemove).toHaveBeenCalledTimes(1);
	});

	it("changing the Type select calls onTypeChange, and switching to a choice type reveals the options editor", async () => {
		const user = userEvent.setup();
		const { spy } = renderRow({ initialField: makeField({ type: "short_text", options: [] }) });

		expect(screen.queryByRole("button", { name: /add option/i })).not.toBeInTheDocument();

		await user.click(screen.getByRole("combobox", { name: /type/i }));
		await user.click(screen.getByRole("option", { name: "Single choice" }));

		expect(spy.onTypeChange).toHaveBeenCalledWith("single_choice");
		// The Harness applied the patch, so the row itself now renders the options editor - with
		// zero options so far, which is also below the two-option minimum.
		expect(screen.getByRole("button", { name: /add option/i })).toBeInTheDocument();
		expect(screen.getByText("A choice field needs at least two options.")).toBeInTheDocument();
	});

	describe("options editor (choice field types only)", () => {
		it("renders one labeled input per existing option, pre-filled with its value", () => {
			renderRow({
				initialField: makeField({ type: "single_choice", options: ["Traditional", "Realism"] }),
			});

			expect(screen.getByLabelText("Option 1")).toHaveValue("Traditional");
			expect(screen.getByLabelText("Option 2")).toHaveValue("Realism");
			// Two real, non-blank options - the validation message shouldn't show.
			expect(screen.queryByText(/needs at least two options/i)).not.toBeInTheDocument();
		});

		it("editing an option calls onOptionChange with its index and reflects the new value", async () => {
			const user = userEvent.setup();
			const { spy } = renderRow({
				initialField: makeField({ type: "multi_choice", options: ["Color", "Black and grey"] }),
			});

			const option2 = screen.getByLabelText("Option 2");
			await user.clear(option2);
			await user.type(option2, "Cover-up");

			expect(option2).toHaveValue("Cover-up");
			expect(spy.onOptionChange).toHaveBeenLastCalledWith(1, "Cover-up");
		});

		it('clicking "Add option" calls onAddOption and a new, empty option input appears', async () => {
			const user = userEvent.setup();
			const { spy } = renderRow({
				initialField: makeField({ type: "single_choice", options: ["Traditional", "Realism"] }),
			});

			await user.click(screen.getByRole("button", { name: "Add option" }));

			expect(spy.onAddOption).toHaveBeenCalledTimes(1);
			expect(screen.getByLabelText("Option 3")).toHaveValue("");
		});

		it('clicking an option\'s "Remove option" button calls onRemoveOption with its index and removes that row', async () => {
			const user = userEvent.setup();
			const { spy } = renderRow({
				initialField: makeField({
					type: "multi_choice",
					options: ["Color", "Black and grey", "Cover-up"],
				}),
			});

			const removeButtons = screen.getAllByRole("button", { name: "Remove option" });
			// Remove the middle option ("Black and grey", index 1).
			await user.click(removeButtons[1]);

			expect(spy.onRemoveOption).toHaveBeenCalledWith(1);
			// Two options remain, renumbered as Option 1/Option 2, with "Black and grey" gone.
			expect(screen.getByLabelText("Option 1")).toHaveValue("Color");
			expect(screen.getByLabelText("Option 2")).toHaveValue("Cover-up");
			expect(screen.queryByDisplayValue("Black and grey")).not.toBeInTheDocument();
		});

		it("shows the two-option validation message when a blank option leaves fewer than two real ones, and clears once fixed", async () => {
			const user = userEvent.setup();
			renderRow({
				initialField: makeField({ type: "single_choice", options: ["Traditional", "  "] }),
			});

			// Trimmed, "  " doesn't count - only one real option exists.
			expect(screen.getByText("A choice field needs at least two options.")).toBeInTheDocument();

			const blankOption = screen.getByLabelText("Option 2");
			await user.clear(blankOption);
			await user.type(blankOption, "Realism");

			expect(screen.queryByText("A choice field needs at least two options.")).not.toBeInTheDocument();
		});
	});
});
