// CreateArtist.jsx tests.
//
// Read in full before writing this: CreateArtist.jsx is currently a placeholder page component -
// `<div>CreateArtist</div>` and nothing else. It renders no form, holds no state, and does not
// import AccountService, ArtistService, or BookingSlugField. The real "create an artist account"
// flow already exists elsewhere in this codebase - CreateArtistWizard in
// ../../wizards/AccountWizards.jsx, which fires AccountService.CREATE_ARTIST_ACCOUNT and is what
// IBPageActionBar's "Add Artist" action actually opens - but nothing in this file wires that wizard
// (or any other form) in. This test file is scoped to CreateArtist.jsx as it exists, not to the
// account-creation flow living in that sibling file; it should be replaced with real
// coverage (form validation, the create-account mutation, success/error handling) once
// CreateArtist.jsx grows the form its name and file location imply.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CreateArtist from "./CreateArtist";

describe("CreateArtist (placeholder)", () => {
	it("renders without crashing", () => {
		render(<CreateArtist />);
		expect(screen.getByText("CreateArtist")).toBeInTheDocument();
	});

	it("renders no form controls yet - nothing to submit, validate, or wire to AccountService", () => {
		render(<CreateArtist />);

		expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.queryByRole("form")).not.toBeInTheDocument();
	});

	// Pinning down the exact current markup so a future change to this file (e.g. swapping in the
	// real form) is a deliberate, visible diff here rather than a silent behaviour change.
	it("renders a single div with the literal text 'CreateArtist'", () => {
		const { container } = render(<CreateArtist />);
		expect(container.firstChild.tagName).toBe("DIV");
		expect(container.firstChild).toHaveTextContent("CreateArtist");
	});
});
