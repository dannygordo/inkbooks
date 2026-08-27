// TokenStorageService.js replaces CacheService.js (see that file's own git history / DECISIONS.md's
// X5) with an interface shaped like expo-secure-store's real API: setItemAsync/getItemAsync/
// deleteItemAsync, strings only, no JSON encoding done by the service itself - callers own their
// own stringify/parse, same as they will against the real mobile implementation. These tests cover
// exactly that contract: single encode/decode (not CacheService's old double one), a resolved
// Promise from every method, and a never-set key returning null rather than throwing.
//
// describe/it/expect come from Vitest's `globals: true` config - see the equivalent note in
// constants/auth.test.js for why there's no `import { describe } from "vitest"` here.
import { beforeEach } from "vitest";
import { TokenStorageService } from "./TokenStorageService";

beforeEach(() => {
	localStorage.clear();
});

describe("TokenStorageService", () => {
	it("round-trips a string value through a single JSON encode/decode pair, done by the caller", async () => {
		const user = { id: "1", email: "gordo@example.com", accessToken: "abc123" };
		await TokenStorageService.setItemAsync("token", JSON.stringify(user));
		const raw = await TokenStorageService.getItemAsync("token");
		expect(JSON.parse(raw)).toEqual(user);
	});

	it("stores the value with a single encoding, not CacheService's old double one", async () => {
		const user = { id: "1" };
		await TokenStorageService.setItemAsync("token", JSON.stringify(user));
		// If this were double-encoded, localStorage's raw string would itself be valid JSON whose
		// parsed value is ANOTHER JSON string, not the object - i.e. JSON.parse of the raw value
		// would still be a string. Single encoding means parsing it once already yields the object.
		expect(JSON.parse(localStorage.getItem("token"))).toEqual(user);
	});

	it("every method returns a Promise, even though the web implementation is synchronous underneath", () => {
		expect(TokenStorageService.setItemAsync("k", "v")).toBeInstanceOf(Promise);
		expect(TokenStorageService.getItemAsync("k")).toBeInstanceOf(Promise);
		expect(TokenStorageService.deleteItemAsync("k")).toBeInstanceOf(Promise);
	});

	it("deleteItemAsync removes a stored value", async () => {
		await TokenStorageService.setItemAsync("token", JSON.stringify({ id: "1" }));
		await TokenStorageService.deleteItemAsync("token");
		expect(await TokenStorageService.getItemAsync("token")).toBeNull();
	});

	it("getItemAsync on a never-set key resolves to null rather than throwing or rejecting", async () => {
		await expect(TokenStorageService.getItemAsync("nothing-here")).resolves.toBeNull();
	});

	it("setItemAsync/getItemAsync work with any stringified value, not just objects", async () => {
		await TokenStorageService.setItemAsync("count", JSON.stringify(42));
		expect(JSON.parse(await TokenStorageService.getItemAsync("count"))).toBe(42);
	});
});
