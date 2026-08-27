// IBImagesUploadForm.jsx tests. The form itself holds no upload logic at all - it is purely the
// "pick some files" control: a Fab button that, on click, forwards the click to a hidden
// <input type="file multiple>, and an onChange handler that hands the FileList straight to the
// parent via `setFiles` (as a real array, not a FileList - IBProgressListProject/
// IBProgressItemProject downstream expect `.map()` to work on it) and resets the input's own value
// so choosing the exact same file(s) again still fires a fresh change event next time.
//
// Explicit React import - see the matching note in context/auth.test.jsx: under Vitest,
// @vitejs/plugin-react compiles test-file JSX with the classic runtime, so React needs to be in
// scope explicitly here even though app components rely on the automatic runtime.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBImagesUploadForm from "./IBImagesUploadForm";

// user.upload() patches the target input's own "value" setter internally (see
// @testing-library/user-event's setFiles.js) to fake a real file-input assignment. That patched
// setter conflicts with this component's own `fileRef.current.value = null` reset inside
// handleChange (see the component's own comment on why that reset exists) - the two together
// throw "Cannot use 'in' operator to search for 'Symbol(Displayed value in UI)' in null" the
// instant handleChange's reset runs, because it re-enters user-event's patched setter with
// bookkeeping that was never set up for this element. Setting `.files` directly and firing a
// real change event exercises the exact same handleChange path (it only reads e.target.files)
// without ever installing that patched setter.
function selectFiles(input, files) {
	Object.defineProperty(input, "files", { value: files, configurable: true });
	fireEvent.change(input);
}

describe("IBImagesUploadForm", () => {
	it("renders the given label", () => {
		render(<IBImagesUploadForm setFiles={vi.fn()} label="References" />);

		expect(screen.getByText("References")).toBeInTheDocument();
	});

	it("renders a hidden input that accepts more than one file at a time", () => {
		const { container } = render(<IBImagesUploadForm setFiles={vi.fn()} label="References" />);

		const input = container.querySelector('input[type="file"]');
		expect(input).not.toBeNull();
		expect(input).toHaveAttribute("multiple");
	});

	// The visible control is the Fab, not the (deliberately hidden, sx={{ display: "none" }}) input
	// itself - clicking "add" is how a real user actually opens their OS file picker.
	it("clicking the add button opens the file picker by forwarding the click to the hidden input", async () => {
		const user = userEvent.setup();
		const { container } = render(<IBImagesUploadForm setFiles={vi.fn()} label="References" />);
		const input = container.querySelector('input[type="file"]');
		const clickSpy = vi.spyOn(input, "click");

		await user.click(screen.getByRole("button", { name: "add" }));

		expect(clickSpy).toHaveBeenCalledTimes(1);
	});

	it("passes the chosen file to setFiles as a real array, and clears the input afterward", () => {
		const setFiles = vi.fn();
		const { container } = render(<IBImagesUploadForm setFiles={setFiles} label="References" />);
		const input = container.querySelector('input[type="file"]');
		const file = new File(["reference art"], "reference.png", { type: "image/png" });

		selectFiles(input, [file]);

		expect(setFiles).toHaveBeenCalledTimes(1);
		expect(setFiles).toHaveBeenCalledWith([file]);
		// handleChange resets fileRef.current.value = null - a native file input coerces that back
		// to "", which is what lets choosing the identical file again still fire a change event.
		expect(input.value).toBe("");
	});

	it("supports selecting several files in one go, in the order they were chosen", () => {
		const setFiles = vi.fn();
		const { container } = render(<IBImagesUploadForm setFiles={setFiles} label="Design" />);
		const input = container.querySelector('input[type="file"]');
		const fileA = new File(["a"], "a.png", { type: "image/png" });
		const fileB = new File(["b"], "b.png", { type: "image/png" });

		selectFiles(input, [fileA, fileB]);

		expect(setFiles).toHaveBeenCalledWith([fileA, fileB]);
	});
});
