import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBProjectsByArtistSelect from "./IBProjectsByArtistSelect";

const PROJECTS = [
	{
		id: "project-1",
		title: "Botanical sleeve",
		description: "Fine-line botanical piece",
		client: { user: { firstName: "Alex", lastName: "Rivera", avatar: null } },
	},
	{
		id: "project-2",
		title: "Traditional eagle",
		description: "American traditional, full color",
		client: { user: { firstName: "Jordan", lastName: "Blake", avatar: null } },
	},
];

describe("IBProjectsByArtistSelect", () => {
	it("renders each project's title, description, and client name as an option", async () => {
		const user = userEvent.setup();
		render(
			<IBProjectsByArtistSelect data={PROJECTS} label="Project" selectedVal="" />
		);

		await user.click(screen.getByRole("combobox"));
		expect(screen.getByText("Botanical sleeve")).toBeInTheDocument();
		expect(screen.getByText("Fine-line botanical piece")).toBeInTheDocument();
		expect(screen.getByText("Traditional eagle")).toBeInTheDocument();
	});

	it("calls onChange with the selected project's id", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<IBProjectsByArtistSelect
				data={PROJECTS}
				label="Project"
				selectedVal=""
				onChange={onChange}
			/>
		);

		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByText("Traditional eagle"));

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange.mock.calls[0][0].target.value).toBe("project-2");
	});

	it("renders an empty list without crashing", async () => {
		const user = userEvent.setup();
		render(<IBProjectsByArtistSelect data={[]} label="Project" selectedVal="" />);
		await user.click(screen.getByRole("combobox"));
		expect(screen.getByRole("option", { name: "None" })).toBeInTheDocument();
	});
});
