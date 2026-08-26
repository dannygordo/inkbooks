// IBTagsWidget.jsx tests. Renders each tag as an MUI Chip with its own delete (Cancel) icon - see
// Project.test.jsx's own tag-deletion test, which already relies on exactly this shape
// (`within(chip).getByTestId("CancelIcon")`) to delete one tag among several.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBTagsWidget from "./IBTagsWidget";

describe("IBTagsWidget", () => {
	it("renders one Chip per tag", () => {
		render(<IBTagsWidget tags={["outline", "koi"]} onDelete={vi.fn()} />);
		expect(screen.getByText("outline")).toBeInTheDocument();
		expect(screen.getByText("koi")).toBeInTheDocument();
		expect(document.querySelectorAll(".MuiChip-root")).toHaveLength(2);
	});

	it("renders nothing but the empty list wrapper when given no tags", () => {
		const { container } = render(<IBTagsWidget tags={[]} onDelete={vi.fn()} />);
		expect(container.querySelectorAll(".MuiChip-root")).toHaveLength(0);
	});

	it("calls onDelete with the event and the specific tag clicked", async () => {
		const user = userEvent.setup();
		const onDelete = vi.fn();
		render(<IBTagsWidget tags={["outline", "koi"]} onDelete={onDelete} />);

		const outlineChip = screen.getByText("outline").closest(".MuiChip-root");
		await user.click(within(outlineChip).getByTestId("CancelIcon"));

		expect(onDelete).toHaveBeenCalledTimes(1);
		// First arg is the click event, second is the tag that was deleted.
		expect(onDelete.mock.calls[0][1]).toBe("outline");
	});

	it("deleting one tag does not call onDelete for the others", async () => {
		const user = userEvent.setup();
		const onDelete = vi.fn();
		render(<IBTagsWidget tags={["outline", "koi", "sleeve"]} onDelete={onDelete} />);

		const koiChip = screen.getByText("koi").closest(".MuiChip-root");
		await user.click(within(koiChip).getByTestId("CancelIcon"));

		expect(onDelete).toHaveBeenCalledTimes(1);
		expect(onDelete.mock.calls[0][1]).toBe("koi");
	});

	// onDelete is optional on the component (there's a dead, commented-out local-state fallback
	// in IBTagsWidget.jsx for when it's absent) - clicking delete with none provided must not
	// throw.
	it("does not throw when clicked with no onDelete provided", async () => {
		const user = userEvent.setup();
		render(<IBTagsWidget tags={["outline"]} />);

		const chip = screen.getByText("outline").closest(".MuiChip-root");
		await expect(user.click(within(chip).getByTestId("CancelIcon"))).resolves.not.toThrow();
		// The widget itself has no state of its own to react to the click with, so the tag is
		// still rendered - deleting is entirely the parent's responsibility via onDelete.
		expect(screen.getByText("outline")).toBeInTheDocument();
	});
});
