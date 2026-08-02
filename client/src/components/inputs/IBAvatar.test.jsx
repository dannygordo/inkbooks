import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import IBAvatar from "./IBAvatar";

// Not asserting exact pixel width/height here - MUI's `sx` prop compiles to emotion-generated CSS
// classes injected into <style> tags, which jsdom's CSS engine doesn't reliably resolve back into
// getComputedStyle() values for shorthand-derived properties. These tests cover what's actually
// verifiable: which branch renders, and that the src/alt props reach the real <img>.
describe("IBAvatar", () => {
	it("renders a plain avatar with the given image and alt label", () => {
		render(<IBAvatar imgUrl="https://example.com/avatar.png" label="Maya Chen" size={40} />);
		const img = screen.getByRole("img", { name: "Maya Chen" });
		expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
	});

	it("renders the online-status badge variant when isOnline is true", () => {
		const { container } = render(
			<IBAvatar imgUrl="https://example.com/avatar.png" label="Maya Chen" isOnline size={40} />
		);
		// MuiBadge only renders in the isOnline branch - its presence confirms which branch ran.
		expect(container.querySelector(".MuiBadge-root")).not.toBeNull();
	});

	it("does not render a badge when isOnline is false", () => {
		const { container } = render(
			<IBAvatar imgUrl="https://example.com/avatar.png" label="Maya Chen" size={40} />
		);
		expect(container.querySelector(".MuiBadge-root")).toBeNull();
	});
});
