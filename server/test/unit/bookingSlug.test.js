// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.
const {
	suggestSlug,
	slugFormatError,
	normalizeSlug,
	RESERVED_SLUGS,
} = require('../../utils/booking-slug');

describe('suggestSlug', () => {
	it('builds a handle from a name', () => {
		expect(suggestSlug('Maya', 'Chen')).toBe('maya-chen');
	});

	it('keeps the letter when stripping accents', () => {
		// "renee", not "ren" - decomposing and dropping the combining mark preserves the base
		// character. Getting this wrong silently shortens people's names.
		expect(suggestSlug('Renée', 'Dubois')).toBe('renee-dubois');
	});

	it('collapses punctuation and spacing rather than emitting an illegal slug', () => {
		const result = suggestSlug("Jon  ", "O'Neill");
		expect(slugFormatError(result)).toBeNull();
	});

	it('returns empty rather than a mystery string when there is nothing usable', () => {
		// A name in a non-Latin script. The caller shows an empty field and lets the artist type
		// their own, which is a better outcome than prefilling something they didn't write.
		expect(suggestSlug('日本', '語')).toBe('');
	});

	it('never suggests something the validator would reject', () => {
		const names = [
			['Maya', 'Chen'],
			['Renée', 'Dubois'],
			['Jean-Luc', 'Picard'],
			['  Jon  ', "O'Neill  "],
			['X', 'Æ'],
			['Bob', ''],
		];
		for (const [first, last] of names) {
			const suggestion = suggestSlug(first, last);
			if (suggestion === '') {
				continue; // legitimately nothing usable - the caller handles this
			}
			expect({ name: `${first} ${last}`, error: slugFormatError(suggestion) }).toEqual({
				name: `${first} ${last}`,
				error: null,
			});
		}
	});
});

describe('slugFormatError', () => {
	it('accepts a normal handle', () => {
		expect(slugFormatError('maya-chen')).toBeNull();
		expect(slugFormatError('ink247')).toBeNull();
	});

	it('normalises case rather than rejecting it', () => {
		// Same call the server makes on write. Refusing "Maya-Chen" would be the form making the
		// person do the computer's job - see the note in utils/booking-slug.js.
		expect(slugFormatError('Maya-Chen')).toBeNull();
		expect(normalizeSlug('  Maya-Chen ')).toBe('maya-chen');
	});

	it('rejects the shapes that would make an ambiguous or ugly URL', () => {
		expect(slugFormatError('maya chen')).toBeTruthy(); // space
		expect(slugFormatError('maya_chen')).toBeTruthy(); // underscore - invisible when underlined
		expect(slugFormatError('maya.chen')).toBeTruthy(); // dot - reads as a domain boundary
		expect(slugFormatError('-maya')).toBeTruthy();
		expect(slugFormatError('maya-')).toBeTruthy();
		expect(slugFormatError('maya--chen')).toBeTruthy();
		expect(slugFormatError('ab')).toBeTruthy(); // too short
		expect(slugFormatError('a'.repeat(41))).toBeTruthy(); // too long
		expect(slugFormatError('')).toBeTruthy();
		expect(slugFormatError(null)).toBeTruthy();
		expect(slugFormatError(undefined)).toBeTruthy();
	});

	it('rejects unicode lookalikes', () => {
		// The whole purpose of a booking slug is identifying one specific artist, so a handle that
		// renders identically to somebody else's is an impersonation vector, not a cosmetic issue.
		expect(slugFormatError('mауa-chen')).toBeTruthy(); // Cyrillic 'а' and 'у'
	});

	it('rejects every reserved word', () => {
		for (const reserved of RESERVED_SLUGS) {
			expect({ slug: reserved, error: Boolean(slugFormatError(reserved)) }).toEqual({
				slug: reserved,
				error: true,
			});
		}
	});

	it('reserves the words that would let someone pose as the platform', () => {
		// Distinct from the route-collision reason. /book/support with the studio's own branding
		// on it is a phishing page, and it is worse than an ugly URL.
		for (const impersonation of ['admin', 'support', 'billing', 'official', 'inkbooks']) {
			expect(slugFormatError(impersonation)).toBeTruthy();
		}
	});

	it('gives a different reason for each kind of failure', () => {
		// The UI shows this string. "Unavailable" covering taken, too-short and reserved would
		// make the person guess what to change.
		const reasons = new Set(
			['ab', 'maya chen', 'admin', 'a'.repeat(41)].map((s) => slugFormatError(s)),
		);
		expect(reasons.size).toBe(4);
	});
});
