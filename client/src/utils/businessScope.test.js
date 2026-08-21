// Unit tests for utils/businessScope.js - the client-side mirror of the server's
// shopId-XOR-artistUserId ownership shape for expense/income records.
import { describe, it, expect } from "vitest";
import { ROLES } from "../constants/auth";
import {
	isShopAdminOrBetter,
	hasShop,
	businessScopeFor,
	createScopeFor,
} from "./businessScope";

const withShop = (role, shopId = "shop-1") => ({
	id: "user-1",
	role,
	userInfo: { shop: { id: shopId } },
});
const withoutShop = (role) => ({ id: "user-1", role, userInfo: {} });

describe("isShopAdminOrBetter", () => {
	it("is true for ADMIN and SHOP_ADMIN (lower number = more privileged)", () => {
		expect(isShopAdminOrBetter({ role: ROLES.ADMIN })).toBe(true);
		expect(isShopAdminOrBetter({ role: ROLES.SHOP_ADMIN })).toBe(true);
	});

	it("is false for anything less privileged than SHOP_ADMIN", () => {
		expect(isShopAdminOrBetter({ role: ROLES.SHOP_STAFF })).toBe(false);
		expect(isShopAdminOrBetter({ role: ROLES.ARTIST })).toBe(false);
		expect(isShopAdminOrBetter({ role: ROLES.CLIENT })).toBe(false);
	});
});

describe("hasShop", () => {
	it("is true when userInfo.shop.id is set", () => {
		expect(hasShop(withShop(ROLES.SHOP_ADMIN))).toBe(true);
	});

	it("is false when there is no shop, no userInfo, or an empty shop id", () => {
		expect(hasShop(withoutShop(ROLES.ARTIST))).toBe(false);
		expect(hasShop({ id: "u1" })).toBe(false);
		expect(hasShop({ id: "u1", userInfo: { shop: { id: "" } } })).toBe(false);
		expect(hasShop({ id: "u1", userInfo: { shop: null } })).toBe(false);
	});
});

describe("businessScopeFor", () => {
	it("scopes a shop admin with a shop to that shop", () => {
		const user = withShop(ROLES.SHOP_ADMIN, "shop-42");
		expect(businessScopeFor(user)).toEqual({ shopId: "shop-42" });
	});

	it("scopes an independent artist to themselves", () => {
		const user = withoutShop(ROLES.ARTIST);
		expect(businessScopeFor(user)).toEqual({ artistUserId: "user-1" });
	});

	it("scopes a shop admin who has no shop to themselves, same as an independent artist", () => {
		const user = withoutShop(ROLES.SHOP_ADMIN);
		expect(businessScopeFor(user)).toEqual({ artistUserId: "user-1" });
	});

	// Per the header comment, the two callers this is meant for are "a shop admin at their own
	// shop, or an independent artist with no shop". Shop STAFF is neither - even a staff member
	// who does belong to a shop falls through to the artistUserId branch here, since
	// isShopAdminOrBetter(role 15) is false. Whether that's ever actually reached depends entirely
	// on the visibility gate (hasAuditAuthority) upstream, but the function itself doesn't guard
	// against it - worth pinning down as the actual behaviour.
	it("scopes shop staff (who are not shop-admin-or-better) to themselves even with a shop", () => {
		const user = withShop(ROLES.SHOP_STAFF);
		expect(businessScopeFor(user)).toEqual({ artistUserId: "user-1" });
	});

	// Both hasShop and isShopAdminOrBetter dereference properties straight off `user` with no null
	// guard on `user` itself - only the nested userInfo/shop access is optional-chained. A missing
	// user throws rather than degrading to a scope.
	it("throws for a missing user rather than silently returning an unscoped result", () => {
		expect(() => businessScopeFor(null)).toThrow();
		expect(() => businessScopeFor(undefined)).toThrow();
	});
});

describe("createScopeFor", () => {
	it("passes through shopId for a shop admin's scope", () => {
		const user = withShop(ROLES.SHOP_ADMIN, "shop-42");
		expect(createScopeFor(user)).toEqual({ shopId: "shop-42" });
	});

	// The whole reason this function exists: an artistUserId scope would be an unknown input field
	// on a create mutation, so it's dropped entirely rather than passed through.
	it("returns an empty object for an independent artist's scope, dropping artistUserId", () => {
		const user = withoutShop(ROLES.ARTIST);
		expect(createScopeFor(user)).toEqual({});
	});

	it("returns an empty object for a shop admin with no shop", () => {
		const user = withoutShop(ROLES.SHOP_ADMIN);
		expect(createScopeFor(user)).toEqual({});
	});
});
