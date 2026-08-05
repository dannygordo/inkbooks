/**
 * A suggested booking handle from a name, for PREFILLING the field.
 *
 * This is deliberately the only piece of slug logic that exists on the client, and it is a
 * display convenience rather than a rule. Whether a slug is actually legal and actually free is
 * answered by the server every time - checkBookingSlugAvailable while typing, and again on write,
 * with the unique index on Artist.bookingSlug as the real guarantee (see
 * server/utils/booking-slug.js).
 *
 * That split matters. Copying the validation regex, the length bounds and the reserved-word list
 * over here would create a second definition of "valid slug" that agrees with the server exactly
 * until someone edits one of them - which is the failure this codebase has hit repeatedly under
 * different names (Artist.shopId vs. ArtistShopConnection, role vs. shop membership,
 * Project.depositAmount vs. the appointment that holds the money). A suggestion that turns out to
 * be unavailable is a normal, handled outcome; a client that believes something is valid when the
 * server disagrees is a broken form.
 *
 * Mirrors the server's own suggestSlug closely enough to be useful. If the two drift, the visible
 * result is a prefilled value the server rejects - annoying, immediately obvious, and not silent.
 */
export function suggestSlug(firstName = "", lastName = "") {
	return `${firstName || ""} ${lastName || ""}`
		.toLowerCase()
		.normalize("NFD")
		// Strip combining accents, so "Renée" suggests "renee" rather than dropping the letter.
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/, "");
}

/**
 * The same guard the server's suggestSlug applies: a suggestion shorter than the minimum isn't a
 * suggestion, it's a value the form will reject the moment it's accepted.
 *
 * "X Æ" reduces to "x". Found by testing the server helper, not by reading it - which is the
 * argument for this file staying as small as it is.
 *
 * Only the length floor is repeated here, not the pattern or the reserved list. This is the one
 * rule that decides whether to show a prefill at all; everything else about validity is the
 * server's answer, arriving via checkBookingSlugAvailable a few hundred milliseconds later.
 */
export function suggestSlugOrBlank(firstName, lastName) {
	const candidate = suggestSlug(firstName, lastName);
	return candidate.length >= 3 ? candidate : "";
}

/** The full public URL for a slug, as the artist will hand it out. */
export function bookingUrl(slug) {
	const origin =
		typeof window !== "undefined" && window.location ? window.location.origin : "";
	return `${origin}/book/${slug || ""}`;
}
