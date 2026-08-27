// React imported explicitly - see the note in IBDateTimePicker.jsx/AppointmentTypeChip.jsx and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AppointmentTypeChip from "./AppointmentTypeChip";

describe("AppointmentTypeChip", () => {
	it("renders nothing when type is missing", () => {
		const { container } = render(<AppointmentTypeChip type={null} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders a filled consult chip with its own colours and label", () => {
		render(<AppointmentTypeChip type="consult" />);
		const chip = screen.getByText("Consult");
		expect(chip).toHaveStyle({
			backgroundColor: "#fdf0d5",
			color: "rgb(138, 90, 0)",
			borderColor: "#f0d9a8",
		});
	});

	it("renders a filled session chip with its own colours and label", () => {
		render(<AppointmentTypeChip type="session" />);
		const chip = screen.getByText("Session");
		expect(chip).toHaveStyle({
			backgroundColor: "#e6e8f7",
			color: "rgb(59, 63, 143)",
			borderColor: "#c9cdf0",
		});
	});

	it("falls back to a neutral grey chip and a capitalised label for an unrecognised type", () => {
		render(<AppointmentTypeChip type="other" />);
		const chip = screen.getByText("Other");
		expect(chip).toHaveStyle({ backgroundColor: "#eeeeee", color: "rgb(85, 85, 85)" });
	});

	it("applies the small-size class when size='small'", () => {
		render(<AppointmentTypeChip type="consult" size="small" />);
		expect(screen.getByText("Consult")).toHaveClass("appointmentTypeChipSmall");
	});

	// The whole point of `personal` - see this component's own header comment. A personal
	// appointment is always labelled "Personal", regardless of whether its underlying
	// appointmentType is 'consult', 'session', or the internal 'other' bucket the wizard actually
	// stores (see AppointmentWizard.jsx's handleSubmitPersonal) - the label is a property of WHOSE
	// calendar this is on, not of the stored type.
	it.each(["consult", "session", "other"])(
		"labels a personal appointment 'Personal' regardless of its underlying type (%s)",
		(type) => {
			render(<AppointmentTypeChip type={type} personal tagColor="#c69818" />);
			expect(screen.getByText("Personal")).toBeInTheDocument();
			expect(screen.queryByText("Consult")).not.toBeInTheDocument();
			expect(screen.queryByText("Session")).not.toBeInTheDocument();
		},
	);

	it("renders a personal chip outlined in the owner's tagColor with a transparent fill", () => {
		render(<AppointmentTypeChip type="session" personal tagColor="#c69818" />);
		const chip = screen.getByText("Personal");
		// jsdom normalises "transparent" to its rgba equivalent under getComputedStyle, which is
		// what toHaveStyle actually diffs against - asserted directly via the style attribute
		// instead so the test reads as "transparent", matching the source, rather than a value only
		// jsdom would produce.
		expect(chip.style.backgroundColor).toBe("transparent");
		expect(chip).toHaveStyle({ color: "rgb(198, 152, 24)" });
		expect(chip.style.borderColor).toBe("rgb(198, 152, 24)");
		expect(chip).toHaveClass("appointmentTypeChipPersonal");
	});

	// resolveTagColor's own fallback (see utils/tagColor.js) - a personal chip for an artist with
	// no tagColor assigned yet still renders legibly instead of white-on-transparent (invisible).
	it("falls back to the neutral tag colour when the owner has none set", () => {
		render(<AppointmentTypeChip type="session" personal tagColor={undefined} />);
		const chip = screen.getByText("Personal");
		expect(chip).toHaveStyle({ color: "rgb(95, 99, 104)", borderColor: "rgb(95, 99, 104)" });
	});

	it("never shows the underlying type's own filled colours when personal is set", () => {
		render(<AppointmentTypeChip type="session" personal tagColor="#c69818" />);
		const chip = screen.getByText("Personal");
		// Session's own filled background (#e6e8f7) must not leak through.
		expect(chip).not.toHaveStyle({ backgroundColor: "#e6e8f7" });
	});
});
