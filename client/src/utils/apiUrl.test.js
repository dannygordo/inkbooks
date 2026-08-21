// Unit tests for utils/apiUrl.js.
//
// The whole point of this module (see its own header comment) is that an unrecognised
// import.meta.env.MODE must NOT throw at import time - and Vitest itself runs in mode "test",
// which is exactly such an unrecognised mode. So the very act of importing this file under Vitest
// and calling these functions with no env stubbing at all is already exercising the fallback path
// the module exists for; the tests below make that explicit rather than relying on it by accident.
import { describe, it, expect, afterEach, vi } from "vitest";
import { apiBaseUrl, apiUrl, socketUrl } from "./apiUrl";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("apiBaseUrl", () => {
	it("falls back to DEVELOPMENT for Vitest's own unrecognised mode ('test')", () => {
		// No stubbing here on purpose - this is the real MODE Vitest runs under, and it's the exact
		// scenario the module's header comment says used to crash at import time.
		expect(apiBaseUrl()).toBe("http://localhost:5500");
	});

	it("resolves PRODUCTION when MODE is production", () => {
		vi.stubEnv("MODE", "production");
		expect(apiBaseUrl()).toBe("https://api.inkbooks.net");
	});

	it("resolves DEVELOPMENT when MODE is development", () => {
		vi.stubEnv("MODE", "development");
		expect(apiBaseUrl()).toBe("http://localhost:5500");
	});

	it("is case-insensitive about MODE", () => {
		vi.stubEnv("MODE", "Production");
		expect(apiBaseUrl()).toBe("https://api.inkbooks.net");
	});

	it("falls back to development for a totally unknown mode, rather than throwing", () => {
		vi.stubEnv("MODE", "staging");
		expect(() => apiBaseUrl()).not.toThrow();
		expect(apiBaseUrl()).toBe("http://localhost:5500");
	});

	it("falls back to development when MODE is empty", () => {
		vi.stubEnv("MODE", "");
		expect(apiBaseUrl()).toBe("http://localhost:5500");
	});

	it("strips a trailing slash from the configured URL", () => {
		// Both PRODUCTION and DEVELOPMENT constants are defined WITH a trailing slash
		// (see constants/app.js) - this is the normalisation the module's header comment describes,
		// guarding against the "half the call sites concatenated .../ and half didn't" bug.
		vi.stubEnv("MODE", "production");
		expect(apiBaseUrl().endsWith("/")).toBe(false);
	});
});

describe("apiUrl", () => {
	it("joins a base and a plain path with exactly one slash", () => {
		vi.stubEnv("MODE", "production");
		expect(apiUrl("square/config")).toBe("https://api.inkbooks.net/square/config");
	});

	it("does not double the slash when the path already starts with one", () => {
		vi.stubEnv("MODE", "production");
		expect(apiUrl("/booking-uploads")).toBe("https://api.inkbooks.net/booking-uploads");
	});

	it("collapses several leading slashes on the path to one", () => {
		vi.stubEnv("MODE", "production");
		expect(apiUrl("///nested")).toBe("https://api.inkbooks.net/nested");
	});

	it("handles an empty path", () => {
		vi.stubEnv("MODE", "production");
		expect(apiUrl("")).toBe("https://api.inkbooks.net/");
	});

	// apiUrl does `String(path)` unconditionally, so a missing path doesn't throw - it just stamps
	// the literal word "undefined" into the URL. Not a crash, but worth pinning down: a caller that
	// forgets to pass a path gets a wrong-looking URL rather than an error pointing at the mistake.
	it("stringifies a missing path instead of throwing", () => {
		vi.stubEnv("MODE", "production");
		expect(apiUrl(undefined)).toBe("https://api.inkbooks.net/undefined");
	});
});

describe("socketUrl", () => {
	it("resolves PRODUCTION's socket URL", () => {
		vi.stubEnv("MODE", "production");
		expect(socketUrl()).toBe("https://api.inkbooks.net/");
	});

	it("resolves DEVELOPMENT's socket URL", () => {
		vi.stubEnv("MODE", "development");
		expect(socketUrl()).toBe("http://localhost:5500/");
	});

	// Unlike apiBaseUrl, socketUrl returns SOCKET_IO_SERVER_URL untouched - there is no trailing-
	// slash strip here. That's an asymmetry between the two "same fallback rule" functions the
	// module's own comment claims: apiBaseUrl normalises the trailing slash away, socketUrl doesn't.
	it("keeps the trailing slash, unlike apiBaseUrl", () => {
		vi.stubEnv("MODE", "production");
		expect(socketUrl().endsWith("/")).toBe(true);
		expect(apiBaseUrl().endsWith("/")).toBe(false);
	});

	it("also falls back to DEVELOPMENT for an unrecognised mode", () => {
		vi.stubEnv("MODE", "staging");
		expect(socketUrl()).toBe("http://localhost:5500/");
	});
});
