// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// src/services/CacheService.test.js for why there's no `import { describe } from "vitest"` here.
import { ROLES, ROLE_LABELS, roleLabel } from "./auth";

describe("roleLabel", () => {
	it("names every role", () => {
		expect(roleLabel(ROLES.ADMIN)).toBe("Admin");
		expect(roleLabel(ROLES.SHOP_ADMIN)).toBe("Shop Admin");
		expect(roleLabel(ROLES.SHOP_STAFF)).toBe("Shop Staff");
		expect(roleLabel(ROLES.ARTIST)).toBe("Artist");
		expect(roleLabel(ROLES.CLIENT)).toBe("Client");
	});

	// The sidebar renders this string next to the user's name, so a role that gained a number and
	// not a label would show a blank where the role should be. Asserting the two stay in step is
	// cheaper than noticing it on screen.
	it("has a label for every role, and no labels for roles that do not exist", () => {
		expect(Object.keys(ROLE_LABELS).sort()).toEqual(
			Object.values(ROLES)
				.map(String)
				.sort()
		);
	});

	it("returns an empty string for an unknown role rather than guessing", () => {
		// A token older than this build, or something genuinely wrong. Falling back to "Client" -
		// the safe-looking default - would put a confident, wrong word on screen next to
		// somebody's name, which is worse than showing no role at all.
		expect(roleLabel(999)).toBe("");
		expect(roleLabel(undefined)).toBe("");
		expect(roleLabel(null)).toBe("");
	});
});
