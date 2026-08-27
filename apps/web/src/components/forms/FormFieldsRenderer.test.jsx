// FormFieldsRenderer.jsx tests - the shared per-field-type rendering/answer-shape plumbing behind
// FormFillOut/PublicFormFillOut/PublicFormBySlugFillOut (see those files' own tests, which
// deliberately punt field-type coverage to here per FormFillOut.test.jsx's header comment).
//
// Per the component's own header comment, FormFieldsRenderer keeps NO state of its own beyond
// per-field upload-in-progress flags - the `answers` map lives in the CALLER's state, and every
// interaction here goes through `onAnswerChange(fieldKey, fullMergedAnswer)`. To exercise that
// honestly (so a typed value actually stays on screen while more is typed, the way it does inside
// the real fill-out pages), these tests render FormFieldsRenderer inside a tiny Harness that plays
// the caller's role: it holds `answers` in its own useState and feeds onAnswerChange straight back
// in, while ALSO recording every call on a spy so assertions can inspect exactly what shape was
// sent. This mirrors FormFillOut.jsx's own `setAnswer` helper (fieldKey/...prev/...patch) one level
// up, without pulling in Apollo/MockedProvider - this component takes plain props, not a query.
//
// Also deliberately NOT covered here: required-field enforcement beyond the visual asterisk (the
// component's header comment is explicit that the server is the sole authority on that), and the
// getByLabelText-corruption regression the required-mark placement comment describes - both are
// asserted directly below since they're this file's actual contract, not incidental.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormFieldsRenderer from "./FormFieldsRenderer";

// Guarantees a stubbed `fetch` from any file_upload test never leaks into a later one, even if
// that test fails before reaching its own cleanup.
afterEach(() => {
	vi.unstubAllGlobals();
});

// ---- field fixtures, one per FORM_FIELD_TYPES value (constants/app.js) -------------------------

function shortTextField(overrides = {}) {
	return {
		key: "fullName",
		type: "short_text",
		label: "Full name",
		helpText: null,
		required: false,
		options: null,
		...overrides,
	};
}

function paragraphField(overrides = {}) {
	return {
		key: "notes",
		type: "paragraph",
		label: "Anything else we should know?",
		helpText: null,
		required: false,
		options: null,
		...overrides,
	};
}

function dateField(overrides = {}) {
	return {
		key: "apptDate",
		type: "date",
		label: "Preferred date",
		helpText: null,
		required: false,
		options: null,
		...overrides,
	};
}

function singleChoiceField(overrides = {}) {
	return {
		key: "preference",
		type: "single_choice",
		label: "Preferred style",
		helpText: null,
		required: false,
		options: ["Traditional", "Realism"],
		...overrides,
	};
}

function multiChoiceField(overrides = {}) {
	return {
		key: "interests",
		type: "multi_choice",
		label: "What are you interested in?",
		helpText: null,
		required: false,
		options: ["Color", "Black and grey", "Cover-up"],
		...overrides,
	};
}

function fileUploadField(overrides = {}) {
	return {
		key: "referenceImages",
		type: "file_upload",
		label: "Reference images",
		helpText: null,
		required: false,
		options: null,
		...overrides,
	};
}

function signatureField(overrides = {}) {
	return {
		key: "waiver",
		type: "signature",
		label: "Signature",
		helpText: null,
		required: false,
		options: null,
		...overrides,
	};
}

// ---- harness: plays the "caller owns the answers map" role the component's header comment describes

function renderFieldsRenderer({ fields, initialAnswers = {}, errors = {}, disabled = false }) {
	const onAnswerChangeSpy = vi.fn();

	function Harness() {
		const [answers, setAnswers] = React.useState(initialAnswers);
		const handleAnswerChange = (fieldKey, answer) => {
			onAnswerChangeSpy(fieldKey, answer);
			setAnswers((prev) => ({ ...prev, [fieldKey]: answer }));
		};
		return (
			<FormFieldsRenderer
				fields={fields}
				answers={answers}
				onAnswerChange={handleAnswerChange}
				errors={errors}
				disabled={disabled}
			/>
		);
	}

	const utils = render(<Harness />);
	return { onAnswerChangeSpy, ...utils };
}

describe("FormFieldsRenderer", () => {
	// ---- structural / label wiring ----------------------------------------------------------

	it("renders the required mark beside the label, not inside it, so the accessible name stays exact", () => {
		// See the component's own inline comment: nesting the asterisk inside <label> corrupts a
		// getByLabelText("Full name") lookup into "Full name*" with no visible sign anything broke.
		// This is exactly that regression, pinned down directly.
		renderFieldsRenderer({ fields: [shortTextField({ required: true })], initialAnswers: {} });

		expect(screen.getByLabelText("Full name")).toBeInTheDocument();
		expect(screen.queryByLabelText("Full name*")).not.toBeInTheDocument();
		// The mark is still visibly rendered, just as a sibling.
		expect(screen.getByText("*")).toBeInTheDocument();
	});

	it("renders help text under the question when provided, and nothing when it isn't", () => {
		renderFieldsRenderer({
			fields: [shortTextField({ helpText: "Use your legal name." })],
		});
		expect(screen.getByText("Use your legal name.")).toBeInTheDocument();

		renderFieldsRenderer({ fields: [shortTextField({ key: "other", helpText: null })] });
		// Only one help paragraph exists across both renders (the first field's) - the second
		// field, with no helpText, adds no <p className="formFieldHelp"> of its own.
		expect(document.querySelectorAll(".formFieldHelp")).toHaveLength(1);
	});

	it("shows a caller-supplied per-field error message and leaves fields with no entry alone", () => {
		renderFieldsRenderer({
			fields: [shortTextField(), paragraphField()],
			errors: { fullName: "This field is required." },
		});

		expect(screen.getByText("This field is required.")).toBeInTheDocument();
		// Only one .formFieldError renders - the paragraph field has no entry in `errors`.
		expect(document.querySelectorAll(".formFieldError")).toHaveLength(1);
	});

	it("renders only the label and help text for a field type with no matching branch, without crashing", () => {
		renderFieldsRenderer({
			fields: [shortTextField({ type: "not_a_real_type", label: "Mystery field" })],
		});

		expect(screen.getByText("Mystery field")).toBeInTheDocument();
		// No branch matched, so no control of any kind was rendered for it.
		expect(document.querySelector(".formFieldBlock input, .formFieldBlock textarea")).toBeNull();
	});

	// ---- short_text -----------------------------------------------------------------------

	it("short_text: types into a controlled input and reports textValue merged with fieldKey", async () => {
		const user = userEvent.setup();
		const { onAnswerChangeSpy } = renderFieldsRenderer({ fields: [shortTextField()] });

		const input = screen.getByLabelText("Full name");
		await user.type(input, "Arya Stark");

		expect(input).toHaveValue("Arya Stark");
		expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("fullName", {
			fieldKey: "fullName",
			textValue: "Arya Stark",
		});
	});

	it("short_text: disables the input when `disabled` is true", () => {
		renderFieldsRenderer({ fields: [shortTextField()], disabled: true });
		expect(screen.getByLabelText("Full name")).toBeDisabled();
	});

	// ---- paragraph ------------------------------------------------------------------------

	it("paragraph: types into a controlled multiline input and reports textValue", async () => {
		const user = userEvent.setup();
		const { onAnswerChangeSpy } = renderFieldsRenderer({ fields: [paragraphField()] });

		const input = screen.getByLabelText("Anything else we should know?");
		await user.type(input, "None");

		expect(input).toHaveValue("None");
		expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("notes", {
			fieldKey: "notes",
			textValue: "None",
		});
	});

	// ---- date -------------------------------------------------------------------------------

	it("date: setting the value reports dateValue as the raw input string", () => {
		// fireEvent.change rather than userEvent.type - jsdom's type="date" input does not behave
		// like a real browser's segmented date picker, so typing the string character-by-character
		// (including the "-" separators) isn't a reliable way to set it. Same convention as
		// RecurringExpensesPanel.test.jsx's "First occurrence" field.
		const { onAnswerChangeSpy } = renderFieldsRenderer({ fields: [dateField()] });

		fireEvent.change(screen.getByLabelText("Preferred date"), { target: { value: "2026-09-01" } });

		expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("apptDate", {
			fieldKey: "apptDate",
			dateValue: "2026-09-01",
		});
	});

	it("date: slices an existing ISO timestamp answer down to YYYY-MM-DD for display", () => {
		renderFieldsRenderer({
			fields: [dateField()],
			initialAnswers: { apptDate: { fieldKey: "apptDate", dateValue: "2026-09-01T00:00:00.000Z" } },
		});

		expect(screen.getByLabelText("Preferred date")).toHaveValue("2026-09-01");
	});

	// ---- single_choice ----------------------------------------------------------------------

	it("single_choice: renders one radio per option and selecting one reports selectedOptions as a single-item array", async () => {
		const user = userEvent.setup();
		const { onAnswerChangeSpy } = renderFieldsRenderer({ fields: [singleChoiceField()] });

		expect(screen.getByText("Traditional")).toBeInTheDocument();
		expect(screen.getByText("Realism")).toBeInTheDocument();

		await user.click(screen.getByText("Traditional"));
		expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("preference", {
			fieldKey: "preference",
			selectedOptions: ["Traditional"],
		});
	});

	it("single_choice: picking a second option replaces the first rather than accumulating", async () => {
		const user = userEvent.setup();
		const { onAnswerChangeSpy } = renderFieldsRenderer({
			fields: [singleChoiceField()],
			initialAnswers: { preference: { fieldKey: "preference", selectedOptions: ["Traditional"] } },
		});

		await user.click(screen.getByText("Realism"));

		expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("preference", {
			fieldKey: "preference",
			selectedOptions: ["Realism"],
		});
	});

	// ---- multi_choice -----------------------------------------------------------------------

	it("multi_choice: checking two options accumulates them in selectedOptions", async () => {
		const user = userEvent.setup();
		const { onAnswerChangeSpy } = renderFieldsRenderer({ fields: [multiChoiceField()] });

		await user.click(screen.getByText("Color"));
		expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("interests", {
			fieldKey: "interests",
			selectedOptions: ["Color"],
		});

		await user.click(screen.getByText("Cover-up"));
		expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("interests", {
			fieldKey: "interests",
			selectedOptions: ["Color", "Cover-up"],
		});
	});

	it("multi_choice: unchecking a previously-checked option removes just that one", async () => {
		const user = userEvent.setup();
		const { onAnswerChangeSpy } = renderFieldsRenderer({
			fields: [multiChoiceField()],
			initialAnswers: {
				interests: { fieldKey: "interests", selectedOptions: ["Color", "Cover-up"] },
			},
		});

		await user.click(screen.getByText("Color"));

		expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("interests", {
			fieldKey: "interests",
			selectedOptions: ["Cover-up"],
		});
	});

	// ---- signature ----------------------------------------------------------------------------

	it('signature: types a typed name and reports signedName, under the label "Type your full legal name to sign"', async () => {
		const user = userEvent.setup();
		const { onAnswerChangeSpy } = renderFieldsRenderer({ fields: [signatureField({ required: true })] });

		const input = screen.getByLabelText("Type your full legal name to sign");
		await user.type(input, "Arya Stark");

		expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("waiver", {
			fieldKey: "waiver",
			signedName: "Arya Stark",
		});
	});

	it("signature: never forwards `required` to the typed-name input, unlike short_text/date", () => {
		// Per the component's own inline comment: this IBInput DOES pass a `label`, so MUI would
		// render its own second asterisk on that label if `required` were forwarded - a confusing
		// duplicate of the question label's own mark. Confirmed here as an actual DOM assertion
		// rather than trusting the comment alone.
		renderFieldsRenderer({ fields: [signatureField({ required: true })] });
		expect(screen.getByLabelText("Type your full legal name to sign")).not.toBeRequired();
	});

	// ---- file_upload ----------------------------------------------------------------------------

	describe("file_upload", () => {
		it("uploads the selected file, shows a spinner while pending, and reports the returned URL", async () => {
			const user = userEvent.setup();
			const file = new File(["ink"], "sleeve-ref.png", { type: "image/png" });
			let resolveFetch;
			const fetchMock = vi.fn(
				() =>
					new Promise((resolve) => {
						resolveFetch = resolve;
					})
			);
			vi.stubGlobal("fetch", fetchMock);

			const { onAnswerChangeSpy } = renderFieldsRenderer({ fields: [fileUploadField()] });

			const fileInput = screen.getByLabelText("Reference images");
			await user.upload(fileInput, file);

			// handleFileChange sets uploadingKey synchronously before awaiting the upload, so the
			// spinner is on screen for as long as the fetch promise stays pending.
			expect(screen.getByRole("progressbar")).toBeInTheDocument();

			resolveFetch({
				ok: true,
				json: async () => ({ urls: ["https://cdn.example.com/sleeve-ref.png"] }),
			});

			await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("form-uploads"),
				expect.objectContaining({ method: "POST" })
			);
			expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("referenceImages", {
				fieldKey: "referenceImages",
				fileUrls: ["https://cdn.example.com/sleeve-ref.png"],
			});
			expect(screen.getByText("sleeve-ref.png")).toBeInTheDocument();
		});

		it("appends newly uploaded URLs onto any files already answered, rather than replacing them", async () => {
			const user = userEvent.setup();
			const file = new File(["ink"], "second.png", { type: "image/png" });
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({ urls: ["https://cdn.example.com/second.png"] }),
				})
			);

			const { onAnswerChangeSpy } = renderFieldsRenderer({
				fields: [fileUploadField()],
				initialAnswers: {
					referenceImages: {
						fieldKey: "referenceImages",
						fileUrls: ["https://cdn.example.com/first.png"],
					},
				},
			});

			expect(screen.getByText("first.png")).toBeInTheDocument();

			await user.upload(screen.getByLabelText("Reference images"), file);

			await waitFor(() =>
				expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("referenceImages", {
					fieldKey: "referenceImages",
					fileUrls: [
						"https://cdn.example.com/first.png",
						"https://cdn.example.com/second.png",
					],
				})
			);
			expect(screen.getByText("second.png")).toBeInTheDocument();
		});

		it("shows the server's error message and uploads nothing when the upload fails", async () => {
			const user = userEvent.setup();
			const file = new File(["ink"], "too-big.png", { type: "image/png" });
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: false,
					json: async () => ({ error: "That file is too large." }),
				})
			);

			const { onAnswerChangeSpy } = renderFieldsRenderer({ fields: [fileUploadField()] });

			await user.upload(screen.getByLabelText("Reference images"), file);

			expect(await screen.findByText("That file is too large.")).toBeInTheDocument();
			expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
			expect(onAnswerChangeSpy).not.toHaveBeenCalled();
		});

		it('clicking "Remove" on an uploaded file reports fileUrls with that url filtered out', async () => {
			const user = userEvent.setup();
			const { onAnswerChangeSpy } = renderFieldsRenderer({
				fields: [fileUploadField()],
				initialAnswers: {
					referenceImages: {
						fieldKey: "referenceImages",
						fileUrls: [
							"https://cdn.example.com/keep.png",
							"https://cdn.example.com/drop.png",
						],
					},
				},
			});

			const dropRow = screen.getByText("drop.png").closest("li");
			await user.click(within(dropRow).getByRole("button", { name: "Remove" }));

			expect(onAnswerChangeSpy).toHaveBeenLastCalledWith("referenceImages", {
				fieldKey: "referenceImages",
				fileUrls: ["https://cdn.example.com/keep.png"],
			});
		});

		it('hides the "Remove" control (but still lists the filename) when the form is disabled', () => {
			renderFieldsRenderer({
				fields: [fileUploadField()],
				initialAnswers: {
					referenceImages: {
						fieldKey: "referenceImages",
						fileUrls: ["https://cdn.example.com/keep.png"],
					},
				},
				disabled: true,
			});

			expect(screen.getByText("keep.png")).toBeInTheDocument();
			expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
			expect(screen.getByLabelText("Reference images")).toBeDisabled();
		});
	});
});
