// IBImagesUpload.jsx tests. This is a thin wiring component: it owns the one piece of state that
// crosses the boundary between its two children (the chosen `files`), forwards `title`/`label`
// down to the picker form, and forwards `files`/`project`/`title` down to the progress list. Both
// children have their own dedicated test files (IBImagesUploadForm.test.jsx,
// IBProgressListProject.test.jsx) and are mocked out here so this file can focus on the one thing
// it actually does: holding and passing along that shared `files` state correctly.
//
// Explicit React import - see the matching note in context/auth.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBImagesUpload from "./IBImagesUpload";

vi.mock("./IBImagesUploadForm", () => ({
	default: ({ setFiles, title, label }) => (
		<div data-testid="upload-form" data-title={title} data-label={label}>
			<button
				onClick={() =>
					setFiles([
						new File(["a"], "a.png", { type: "image/png" }),
						new File(["b"], "b.png", { type: "image/png" }),
					])
				}
			>
				choose files
			</button>
		</div>
	),
}));

vi.mock("./ibProgressList/project/IBProgressListProject", () => ({
	default: ({ files, project, title }) => (
		<div
			data-testid="progress-list"
			data-title={title}
			data-project-id={project?.id}
			data-file-count={files.length}
		/>
	),
}));

describe("IBImagesUpload", () => {
	it("forwards title and label to the upload form", () => {
		render(<IBImagesUpload title="References" label="Add reference photos" project={{ id: "project-1" }} />);

		const form = screen.getByTestId("upload-form");
		expect(form).toHaveAttribute("data-title", "References");
		expect(form).toHaveAttribute("data-label", "Add reference photos");
	});

	it("starts the progress list with no files and forwards project/title to it", () => {
		render(<IBImagesUpload title="References" label="Add reference photos" project={{ id: "project-1" }} />);

		const progressList = screen.getByTestId("progress-list");
		expect(progressList).toHaveAttribute("data-file-count", "0");
		expect(progressList).toHaveAttribute("data-title", "References");
		expect(progressList).toHaveAttribute("data-project-id", "project-1");
	});

	it("passes the files chosen in the form down to the progress list", async () => {
		const user = userEvent.setup();
		render(<IBImagesUpload title="Design" label="Add design photos" project={{ id: "project-1" }} />);

		await user.click(screen.getByRole("button", { name: "choose files" }));

		expect(screen.getByTestId("progress-list")).toHaveAttribute("data-file-count", "2");
	});
});
