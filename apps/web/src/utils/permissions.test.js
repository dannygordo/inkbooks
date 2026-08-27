// Unit tests for utils/permissions.js - canManageAppointment, the client-side mirror of the
// server's canManageArtist default floor. Per its own header comment this is PRESENTATION ONLY -
// what matters here is that the UI's idea of "can this person open this" matches what the server
// will actually allow, so the click isn't offered only to be refused a request later.
import { describe, it, expect } from "vitest";
import { ROLES } from "../constants/auth";
import { canManageAppointment } from "./permissions";

const owner = { id: "artist-1", role: ROLES.ARTIST };

describe("canManageAppointment", () => {
	it("returns false when there is no appointment or no user", () => {
		expect(canManageAppointment(owner, null)).toBe(false);
		expect(canManageAppointment(owner, undefined)).toBe(false);
		expect(canManageAppointment(null, { userId: "artist-1" })).toBe(false);
		expect(canManageAppointment(undefined, { userId: "artist-1" })).toBe(false);
	});

	it("allows the appointment's own artist via userId", () => {
		expect(canManageAppointment(owner, { userId: "artist-1" })).toBe(true);
	});

	it("allows the appointment's own artist via the nested user.id fallback", () => {
		expect(canManageAppointment(owner, { user: { id: "artist-1" } })).toBe(true);
	});

	it("prefers the flat userId over the nested user.id when both are present", () => {
		expect(
			canManageAppointment(owner, { userId: "artist-1", user: { id: "someone-else" } }),
		).toBe(true);
	});

	it("compares ids as strings, so a numeric id still matches a string id", () => {
		expect(canManageAppointment({ id: 42, role: ROLES.ARTIST }, { userId: "42" })).toBe(true);
	});

	// The intentional floor named in the header comment: SHOP_ADMIN and better are always allowed,
	// even for someone else's appointment.
	it("allows a shop admin to manage a fellow artist's appointment", () => {
		const admin = { id: "admin-1", role: ROLES.SHOP_ADMIN };
		expect(canManageAppointment(admin, { userId: "artist-1" })).toBe(true);
	});

	it("allows the reserved ADMIN role too", () => {
		const superAdmin = { id: "admin-1", role: ROLES.ADMIN };
		expect(canManageAppointment(superAdmin, { userId: "artist-1" })).toBe(true);
	});

	// The other half of the header comment's point: a fellow artist is not allowed, and neither is
	// shop STAFF - this deliberately uses the tighter SHOP_ADMIN floor rather than the looser
	// SHOP_STAFF floor some other checks in this codebase use.
	it("denies a fellow artist who is not the owner", () => {
		const otherArtist = { id: "artist-2", role: ROLES.ARTIST };
		expect(canManageAppointment(otherArtist, { userId: "artist-1" })).toBe(false);
	});

	it("denies shop staff who are not the owner", () => {
		const staff = { id: "staff-1", role: ROLES.SHOP_STAFF };
		expect(canManageAppointment(staff, { userId: "artist-1" })).toBe(false);
	});

	it("denies a client", () => {
		const client = { id: "client-1", role: ROLES.CLIENT };
		expect(canManageAppointment(client, { userId: "artist-1" })).toBe(false);
	});

	it("falls through to the role check when ownerId is present but falsy", () => {
		// An empty-string userId fails the `ownerId &&` guard, so this isn't treated as "owned by
		// nobody in particular" - it falls straight to the role floor.
		const admin = { id: "admin-1", role: ROLES.SHOP_ADMIN };
		expect(canManageAppointment(admin, { userId: "" })).toBe(true);
		expect(canManageAppointment(owner, { userId: "" })).toBe(false);
	});

	it("falls through to the role check when neither userId nor user.id is present", () => {
		const admin = { id: "admin-1", role: ROLES.SHOP_ADMIN };
		expect(canManageAppointment(admin, {})).toBe(true);
		expect(canManageAppointment(owner, {})).toBe(false);
	});

	// SURPRISING: `Boolean(user.role)` treats a role of 0 as falsy, so a (currently nonexistent,
	// but not type-checked-against) role of 0 would be denied by the role floor even though
	// `0 <= ROLES.SHOP_ADMIN` is mathematically true. Not reachable with today's ROLES values (the
	// most privileged is ADMIN = 1), but worth pinning down as the actual behaviour rather than
	// assuming role 0 would be treated as "more privileged than ADMIN".
	it("denies a role of 0 for a non-owner, since Boolean(0) is falsy", () => {
		const zeroRole = { id: "mystery-1", role: 0 };
		expect(canManageAppointment(zeroRole, { userId: "artist-1" })).toBe(false);
	});

	it("denies a user with no role at all, for someone else's appointment", () => {
		const noRole = { id: "nobody" };
		expect(canManageAppointment(noRole, { userId: "artist-1" })).toBe(false);
	});
});
