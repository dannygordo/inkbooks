// IBImageTagEditor.jsx tests. A small per-image tagging overlay: existing tags render as
// deletable Chips, and a Popover (not an inline field - see the component's own comment on why an
// inline input can't fit the smallest grid tiles) holds the "add a tag" text input.
//
// Explicit React import - see the matching note in context/auth.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBImageTagEditor from "./IBImageTagEditor";

// The tag icon button that opens the "add a tag" popover has no accessible name of its own, so a
// bare getByRole("button") is ambiguous the moment the image already has a tag: MUI's deletable
// Chip also renders its root with role="button" (its accessible name is the tag's own label
// text). MUI's icon components carry a built-in data-testid of "<IconName>Icon" (see
// CalendarHeader.test.jsx's identical use of this for the same reason), which stays unambiguous
// regardless of how many chips are present.
function openAddTagButton() {
	return screen.getByTestId("LocalOfferIcon").closest("button");
}

describe("IBImageTagEditor", () => {
	it("renders each existing tag as a chip", () => {
		render(<IBImageTagEditor img={{ url: "img1.png", tags: ["cover-up", "black and grey"] }} onTagsUpdate={vi.fn()} />);

		expect(screen.getByText("cover-up")).toBeInTheDocument();
		expect(screen.getByText("black and grey")).toBeInTheDocument();
	});

	it("renders no chips when the image has no tags yet", () => {
		render(<IBImageTagEditor img={{ url: "img1.png" }} onTagsUpdate={vi.fn()} />);

		expect(screen.queryByText("cover-up")).not.toBeInTheDocument();
	});

	it("removes a tag via its chip's delete icon", async () => {
		const user = userEvent.setup();
		const onTagsUpdate = vi.fn();
		const img = { url: "img1.png", tags: ["cover-up", "script"] };
		render(<IBImageTagEditor img={img} onTagsUpdate={onTagsUpdate} />);

		const chip = screen.getByText("cover-up").closest(".MuiChip-root");
		await user.click(chip.querySelector(".MuiChip-deleteIcon"));

		expect(onTagsUpdate).toHaveBeenCalledWith(img, ["script"]);
	});

	it("opens an 'Add tag' popover from the tag icon button", async () => {
		const user = userEvent.setup();
		render(<IBImageTagEditor img={{ url: "img1.png" }} onTagsUpdate={vi.fn()} />);

		expect(screen.queryByLabelText("Add tag")).not.toBeInTheDocument();

		await user.click(openAddTagButton());

		expect(screen.getByLabelText("Add tag")).toBeInTheDocument();
	});

	it("adds a new tag by typing and submitting, and keeps the popover open for another", async () => {
		const user = userEvent.setup();
		const onTagsUpdate = vi.fn();
		const img = { url: "img1.png", tags: ["cover-up"] };
		render(<IBImageTagEditor img={img} onTagsUpdate={onTagsUpdate} />);

		await user.click(openAddTagButton());
		const input = screen.getByLabelText("Add tag");
		await user.type(input, "script{Enter}");

		expect(onTagsUpdate).toHaveBeenCalledWith(img, ["cover-up", "script"]);
		// The input clears but the popover itself stays open, so several tags can be added in a row.
		expect(screen.getByLabelText("Add tag")).toBeInTheDocument();
		expect(input).toHaveValue("");
	});

	it("does not add a duplicate tag, but still clears the input", async () => {
		const user = userEvent.setup();
		const onTagsUpdate = vi.fn();
		const img = { url: "img1.png", tags: ["cover-up"] };
		render(<IBImageTagEditor img={img} onTagsUpdate={onTagsUpdate} />);

		await user.click(openAddTagButton());
		const input = screen.getByLabelText("Add tag");
		await user.type(input, "cover-up{Enter}");

		expect(onTagsUpdate).not.toHaveBeenCalled();
		expect(input).toHaveValue("");
	});

	it("submitting a blank input closes the popover instead of adding a tag", async () => {
		const user = userEvent.setup();
		const onTagsUpdate = vi.fn();
		render(<IBImageTagEditor img={{ url: "img1.png", tags: [] }} onTagsUpdate={onTagsUpdate} />);

		await user.click(openAddTagButton());
		await user.type(screen.getByLabelText("Add tag"), "   {Enter}");

		expect(onTagsUpdate).not.toHaveBeenCalled();
		expect(screen.queryByLabelText("Add tag")).not.toBeInTheDocument();
	});

	it("pressing Escape in the input closes the popover", async () => {
		const user = userEvent.setup();
		render(<IBImageTagEditor img={{ url: "img1.png", tags: [] }} onTagsUpdate={vi.fn()} />);

		await user.click(openAddTagButton());
		await user.type(screen.getByLabelText("Add tag"), "{Escape}");

		expect(screen.queryByLabelText("Add tag")).not.toBeInTheDocument();
	});

	// The overlay stops a click reaching whatever's behind it (IBImagesList.jsx's own onClick on
	// the thumbnail <img>, which would otherwise also open the lightbox).
	it("stops a click on itself from bubbling up to a parent handler", async () => {
		const user = userEvent.setup();
		const parentClick = vi.fn();
		render(
			<div onClick={parentClick}>
				<IBImageTagEditor img={{ url: "img1.png", tags: ["cover-up"] }} onTagsUpdate={vi.fn()} />
			</div>,
		);

		await user.click(openAddTagButton());

		expect(parentClick).not.toHaveBeenCalled();
	});
});
