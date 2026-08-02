import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBSelect from "./IBSelect";

const OPTIONS = [
	{ value: "black", label: "Black and Grey" },
	{ value: "color", label: "Color" },
];

describe("IBSelect", () => {
	it("renders the label, helper text, and every option (plus the built-in None)", async () => {
		const user = userEvent.setup();
		render(
			<IBSelect
				data={OPTIONS}
				label="Palette"
				helperText="Select black & grey or color"
				selectedVal=""
			/>
		);
		expect(screen.getByText("Select black & grey or color")).toBeInTheDocument();

		await user.click(screen.getByRole("combobox"));
		expect(screen.getByRole("option", { name: "None" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Black and Grey" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Color" })).toBeInTheDocument();
	});

	// Regression test: handleOnChange used to do `return onChange;` instead of `onChange(e)`,
	// meaning a caller's onChange handler was silently never invoked - see the fix and comment in
	// IBSelect.jsx. Confirms the fixed behavior.
	it("calls onChange with the change event when an option is selected", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<IBSelect data={OPTIONS} label="Palette" selectedVal="" onChange={onChange} />
		);

		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByRole("option", { name: "Color" }));

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange.mock.calls[0][0].target.value).toBe("color");
	});

	it("falls back to logging the value when no onChange is provided (doesn't throw)", async () => {
		const user = userEvent.setup();
		render(<IBSelect data={OPTIONS} label="Palette" selectedVal="" />);

		await user.click(screen.getByRole("combobox"));
		await expect(
			user.click(screen.getByRole("option", { name: "Black and Grey" }))
		).resolves.not.toThrow();
	});
});
