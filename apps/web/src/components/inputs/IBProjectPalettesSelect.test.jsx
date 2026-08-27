import React, { useRef } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBProjectPalettesSelect from "./IBProjectPalettesSelect";

// Real usage (Project.jsx) doesn't pass selectedVal/onChange at all - it reads the chosen value at
// submit time via inputRef.current.value (an uncontrolled-input-style pattern), seeded with
// defaultValue. This component doesn't even destructure/forward an onChange prop to the underlying
// IBSelect, so these tests exercise the actual, real contract rather than assuming a controlled
// onChange path that doesn't exist here.
function RefHarness({ defaultValue }) {
	const ref = useRef();
	return (
		<div>
			<IBProjectPalettesSelect inputRef={ref} defaultValue={defaultValue} />
			<button onClick={() => (document.title = ref.current.value)}>
				read ref
			</button>
		</div>
	);
}

describe("IBProjectPalettesSelect", () => {
	it("renders the Palette label, helper text, and the real dropdown values", async () => {
		const user = userEvent.setup();
		render(<IBProjectPalettesSelect />);

		expect(screen.getByText("Select black & grey or color")).toBeInTheDocument();

		await user.click(screen.getByRole("combobox"));
		// These are the exact values updateProjectInputSchema's zod enum requires (see the
		// server-side palette bug fixed earlier this session) - "Black and Grey"/"Color" labels,
		// "black"/"color" values.
		expect(screen.getByRole("option", { name: "Black and Grey" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Color" })).toBeInTheDocument();
	});

	it("seeds the underlying select's value from defaultValue, readable via inputRef", async () => {
		const user = userEvent.setup();
		render(<RefHarness defaultValue="color" />);

		await user.click(screen.getByText("read ref"));
		expect(document.title).toBe("color");
	});

	it("updates the ref-readable value after picking a new option", async () => {
		const user = userEvent.setup();
		render(<RefHarness defaultValue="black" />);

		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByRole("option", { name: "Color" }));

		await user.click(screen.getByText("read ref"));
		expect(document.title).toBe("color");
	});
});
