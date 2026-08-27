import { describe, it, expect } from "vitest";
import { shouldShowChrome } from "./appChrome";
import { ROUTE_CONSTANTS } from "../constants/app";

describe("shouldShowChrome", () => {
	it("hides the nav on the signup wizard even though the user is signed in", () => {
		// THE regression. The wizard creates the account at step two so steps three to five can save
		// through authenticated mutations - so a sidebar and header keyed on `user` alone appeared
		// mid-setup, offering navigation into an app that wasn't configured yet.
		expect(shouldShowChrome({ id: "u1" }, ROUTE_CONSTANTS.REGISTER)).toBe(false);
	});

	it("shows it everywhere else once signed in", () => {
		expect(shouldShowChrome({ id: "u1" }, ROUTE_CONSTANTS.HOME)).toBe(true);
		expect(shouldShowChrome({ id: "u1" }, "/settings")).toBe(true);
		// Not in the list, and must not be - a route nobody thought about should get chrome, not
		// lose it. Hiding is the exception.
		expect(shouldShowChrome({ id: "u1" }, "/some/route/added/later")).toBe(true);
	});

	it("shows nothing at all without a session", () => {
		// The original rule, unchanged. /login, /book/:handle and /set-password/:token are covered
		// by this and are deliberately absent from the route list.
		expect(shouldShowChrome(null, "/login")).toBe(false);
		expect(shouldShowChrome(null, ROUTE_CONSTANTS.HOME)).toBe(false);
		expect(shouldShowChrome(undefined, "/book/maya-chen")).toBe(false);
	});
});
