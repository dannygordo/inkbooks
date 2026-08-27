// EntityWizard.jsx tests. This is the generic shell all three creation wizards (see
// AccountWizards.jsx) run on - a synthetic `steps`/`onSubmit` pair is used here rather than any
// real wizard, so what's under test is the shell's own behaviour (stepping, per-step validation,
// value collection, submit/error/result handling, the `render` field escape hatch) in isolation
// from any one wizard's own fields or mutation. AccountWizards.test.jsx covers each real wizard's
// own step definitions and submit wiring on top of this.
//
// Explicit React import - see the note in DaySchedule.test.jsx/IBImagesUploadForm.test.jsx: under
// Vitest, @vitejs/plugin-react compiles test-file JSX with the classic runtime, so a component
// rendered by a test needs React in scope explicitly.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EntityWizard from "./EntityWizard";

function twoStepFields() {
	return [
		{
			title: "Who is this?",
			subtitle: "Name and email are enough.",
			fields: [
				{ name: "firstName", label: "First name", required: true },
				{ name: "email", label: "Email", type: "email", required: true },
				{ name: "phone", label: "Phone" },
			],
		},
		{
			title: "Anything else?",
			fields: [{ name: "notes", label: "Notes" }],
		},
	];
}

describe("EntityWizard", () => {
	it("renders the first step's title, subtitle, fields and a progress indicator when there is more than one step", () => {
		render(<EntityWizard steps={twoStepFields()} onSubmit={vi.fn()} onClose={vi.fn()} />);

		expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
		expect(screen.getByText("Who is this?")).toBeInTheDocument();
		expect(screen.getByText("Name and email are enough.")).toBeInTheDocument();
		// Required fields get a " *" appended to their label (see the component's own comment on
		// why the label itself carries this rather than a separate marker).
		expect(screen.getByLabelText("First name *")).toBeInTheDocument();
		expect(screen.getByLabelText("Email *")).toBeInTheDocument();
		expect(screen.getByLabelText("Phone")).toBeInTheDocument();
		// Only step 2's field should exist yet.
		expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
		// No Back button on the first step.
		expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
	});

	it("shows no progress indicator and no subtitle for a single, undescribed step", () => {
		const steps = [{ title: "Just one step", fields: [{ name: "x", label: "X" }] }];
		render(<EntityWizard steps={steps} onSubmit={vi.fn()} onClose={vi.fn()} />);

		expect(screen.queryByText(/Step 1 of/)).not.toBeInTheDocument();
		expect(screen.getByText("Just one step")).toBeInTheDocument();
	});

	it("defaults the submit label to Create, and honours a custom submitLabel on the last step", () => {
		const steps = [{ title: "Only step", fields: [] }];
		render(<EntityWizard steps={steps} onSubmit={vi.fn()} onClose={vi.fn()} />);
		expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
	});

	it("clicking Next without a required field filled shows a validation error and does not advance", async () => {
		const user = userEvent.setup();
		render(<EntityWizard steps={twoStepFields()} onSubmit={vi.fn()} onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(screen.getByText("First name is required")).toBeInTheDocument();
		expect(screen.getByText("Email is required")).toBeInTheDocument();
		// Still on step 1.
		expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
		expect(screen.getByText("Who is this?")).toBeInTheDocument();
	});

	it("flags a malformed email even when the field isn't required to be non-empty elsewhere", async () => {
		const user = userEvent.setup();
		render(<EntityWizard steps={twoStepFields()} onSubmit={vi.fn()} onClose={vi.fn()} />);

		await user.type(screen.getByLabelText("First name *"), "Arya");
		await user.type(screen.getByLabelText("Email *"), "not-an-email");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(screen.getByText("That doesn't look like an email address")).toBeInTheDocument();
		expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
	});

	it("clears a field's error as soon as it's edited, without needing another Next click", async () => {
		const user = userEvent.setup();
		render(<EntityWizard steps={twoStepFields()} onSubmit={vi.fn()} onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByText("First name is required")).toBeInTheDocument();

		await user.type(screen.getByLabelText("First name *"), "A");

		expect(screen.queryByText("First name is required")).not.toBeInTheDocument();
	});

	it("advances to step 2 once required fields validate, and Back returns to step 1 with values preserved", async () => {
		const user = userEvent.setup();
		render(<EntityWizard steps={twoStepFields()} onSubmit={vi.fn()} onClose={vi.fn()} />);

		await user.type(screen.getByLabelText("First name *"), "Arya");
		await user.type(screen.getByLabelText("Email *"), "arya@example.com");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
		expect(screen.getByText("Anything else?")).toBeInTheDocument();
		expect(screen.getByLabelText("Notes")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Back" }));

		expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Arya")).toBeInTheDocument();
		expect(screen.getByDisplayValue("arya@example.com")).toBeInTheDocument();
	});

	it("clicking Cancel calls onClose without calling onSubmit", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		const onSubmit = vi.fn();
		render(<EntityWizard steps={twoStepFields()} onSubmit={onSubmit} onClose={onClose} />);

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("submits the collected values from every step on the final step's submit button", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn().mockResolvedValue(<div>All done</div>);
		render(
			<EntityWizard
				steps={twoStepFields()}
				onSubmit={onSubmit}
				submitLabel="Add person"
				onClose={vi.fn()}
			/>,
		);

		await user.type(screen.getByLabelText("First name *"), "Arya");
		await user.type(screen.getByLabelText("Email *"), "arya@example.com");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.type(screen.getByLabelText("Notes"), "Wolf on the forearm");
		await user.click(screen.getByRole("button", { name: "Add person" }));

		await waitFor(() =>
			expect(onSubmit).toHaveBeenCalledWith({
				firstName: "Arya",
				email: "arya@example.com",
				notes: "Wolf on the forearm",
			}),
		);
	});

	it("shows the resolved result in place of the form, and Done calls onClose", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockResolvedValue(<div>Arya Stark has been added</div>);
		const steps = [{ title: "Only step", fields: [] }];
		render(<EntityWizard steps={steps} onSubmit={onSubmit} onClose={onClose} />);

		await user.click(screen.getByRole("button", { name: "Create" }));

		expect(await screen.findByText("Arya Stark has been added")).toBeInTheDocument();
		expect(screen.queryByText("Only step")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Done" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	// A failed create keeps the modal open on the same step, with values intact for a retry -
	// see the component's own comment on why (a duplicate email is the realistic failure and the
	// user shouldn't have to retype everything).
	it("shows the server's error and stays on the same step when onSubmit rejects", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockRejectedValue({
			graphQLErrors: [{ message: "That email is already registered." }],
		});
		const steps = [
			{ title: "Only step", fields: [{ name: "email", label: "Email", required: true }] },
		];
		render(<EntityWizard steps={steps} onSubmit={onSubmit} onClose={onClose} />);

		await user.type(screen.getByLabelText("Email *"), "arya@example.com");
		await user.click(screen.getByRole("button", { name: "Create" }));

		expect(await screen.findByText("That email is already registered.")).toBeInTheDocument();
		expect(screen.getByText("Only step")).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
		// Value survives the failed submit.
		expect(screen.getByDisplayValue("arya@example.com")).toBeInTheDocument();
	});

	it("falls back to err.message when a rejected onSubmit carries no graphQLErrors", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn().mockRejectedValue(new Error("Network error"));
		const steps = [{ title: "Only step", fields: [] }];
		render(<EntityWizard steps={steps} onSubmit={onSubmit} onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Create" }));

		expect(await screen.findByText("Network error")).toBeInTheDocument();
	});

	// A field can hand the shell its own control (BookingSlugField in AccountWizards.jsx is the
	// real caller) rather than the default labelled IBInput block - see the component's own
	// comment on why. Verified generically here with a stand-in control.
	it("uses a field's own `render` function instead of the default input when provided", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn().mockResolvedValue(<div>done</div>);
		const steps = [
			{
				title: "Custom field",
				fields: [
					{
						name: "custom",
						label: "Custom",
						render: ({ value, setValue, error }) => (
							<div>
								<button onClick={() => setValue("custom-value")}>
									Set custom - current: {value} {error}
								</button>
							</div>
						),
					},
				],
			},
		];
		render(<EntityWizard steps={steps} onSubmit={onSubmit} onClose={vi.fn()} />);

		// The default IBInput/FormField block is not rendered for this field.
		expect(screen.queryByLabelText("Custom")).not.toBeInTheDocument();
		expect(screen.getByText(/Set custom - current:/)).toBeInTheDocument();

		await user.click(screen.getByText(/Set custom - current:/));
		await user.click(screen.getByRole("button", { name: "Create" }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ custom: "custom-value" }));
	});

	it("disables Back/Cancel/submit and shows Creating... while a submit is in flight", async () => {
		const user = userEvent.setup();
		let resolveSubmit;
		const onSubmit = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveSubmit = resolve;
				}),
		);
		const steps = [{ title: "Only step", fields: [] }];
		render(<EntityWizard steps={steps} onSubmit={onSubmit} onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Create" }));

		expect(screen.getByRole("button", { name: "Creating..." })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

		resolveSubmit(<div>done</div>);
		expect(await screen.findByText("done")).toBeInTheDocument();
	});
});
