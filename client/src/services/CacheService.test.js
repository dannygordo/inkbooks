// CacheService.js's getItem does a *double* JSON.parse (see the file itself) - that's only
// correct because every real caller in this codebase (context/auth.jsx's login/updateCurrentUser)
// pre-stringifies the value with JSON.stringify before ever calling setItem. These tests document
// and lock in that actual (if unusual) contract, rather than "fixing" it to a single parse/
// stringify pair - that would be a real behavior change requiring a matching change in
// context/auth.jsx, out of scope for a test-writing pass. See test/context/auth.test.jsx for the
// integration-level round trip through the real call sites.
import { describe, it, expect, beforeEach } from "vitest";
import { CacheService } from "./CacheService";

beforeEach(() => {
	localStorage.clear();
});

describe("CacheService", () => {
	it("round-trips a pre-stringified value (the real usage pattern)", () => {
		const user = { id: "1", username: "gordo", accessToken: "abc123" };
		CacheService.setItem("token", JSON.stringify(user));
		expect(CacheService.getItem("token")).toEqual(user);
	});

	it("removeItem clears a stored value", () => {
		CacheService.setItem("token", JSON.stringify({ id: "1" }));
		CacheService.removeItem("token");
		expect(localStorage.getItem("token")).toBeNull();
	});

	it("getItem on a never-set key returns null rather than throwing", () => {
		expect(() => CacheService.getItem("nothing-here")).not.toThrow();
		expect(CacheService.getItem("nothing-here")).toBeNull();
	});

	it("setItem/getItem work with primitive values too, not just objects", () => {
		CacheService.setItem("count", JSON.stringify(42));
		expect(CacheService.getItem("count")).toBe(42);
	});
});
