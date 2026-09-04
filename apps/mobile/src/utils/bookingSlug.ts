/**
 * A suggested booking handle from a name, for PREFILLING the new-artist form's booking-slug
 * field. Direct port of apps/web's utils/bookingSlug.js `suggestSlug`/`suggestSlugOrBlank` -
 * byte-for-byte, including the accent-stripping and length floor - see that file's own header
 * comment for why this is deliberately the ONLY piece of slug logic duplicated off the server:
 * whether a slug is actually legal and actually free is answered by the server on write, with the
 * unique index on Artist.bookingSlug as the real guarantee (server/utils/booking-slug.js). This
 * file only decides whether to show a prefill at all.
 *
 * checkBookingSlugAvailable's live-as-you-type courtesy check (web's BookingSlugField.jsx) is NOT
 * ported here, same call X42's `settings/your-link.tsx` already made for the exact same field on
 * an existing artist: "cutting the courtesy doesn't cut the guarantee... building a debounced,
 * race-guarded live check (this app's first) for one field felt like real, separate scope." A
 * taken handle is discovered on submit instead, via the same
 * `err.graphQLErrors[0]?.extensions?.errors.bookingSlug` path `your-link.tsx` already reads.
 */
export function suggestSlug(firstName: string = '', lastName: string = ''): string {
	return `${firstName || ''} ${lastName || ''}`
		.toLowerCase()
		.normalize('NFD')
		// Strip combining accents, so "Renée" suggests "renee" rather than dropping the letter.
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
		.replace(/-+$/, '');
}

/**
 * The same guard the server's suggestSlug applies: a suggestion shorter than the minimum isn't a
 * suggestion, it's a value the server will reject the moment it's accepted.
 */
export function suggestSlugOrBlank(firstName: string, lastName: string): string {
	const candidate = suggestSlug(firstName, lastName);
	return candidate.length >= 3 ? candidate : '';
}
