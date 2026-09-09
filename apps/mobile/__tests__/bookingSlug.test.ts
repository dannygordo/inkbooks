import { suggestSlug, suggestSlugOrBlank } from '@/utils/bookingSlug';

// Ported from apps/web's utils/bookingSlug.test.js - only the suggestSlug/suggestSlugOrBlank
// cases, since bookingUrl/formUrl (window.location-dependent) aren't part of this port. See
// utils/bookingSlug.ts's own header comment for what's deliberately NOT duplicated from the
// server here.
describe('suggestSlug', () => {
	it('lower-cases and hyphenates a normal name', () => {
		expect(suggestSlug('John', 'Doe')).toBe('john-doe');
	});

	it('strips combining accents rather than dropping the letter', () => {
		expect(suggestSlug('Renée', '')).toBe('renee');
	});

	it('discards a non-decomposing character like Æ rather than transliterating it', () => {
		expect(suggestSlug('X', 'Æ')).toBe('x');
	});

	it('strips punctuation such as apostrophes and hyphens in the source name', () => {
		expect(suggestSlug("O'Brien", 'Jean-Paul')).toBe('o-brien-jean-paul');
	});

	it('returns an empty string for two empty names', () => {
		expect(suggestSlug('', '')).toBe('');
	});

	it('defaults both names to empty when called with no arguments', () => {
		expect(suggestSlug()).toBe('');
	});

	it('truncates to 40 characters', () => {
		const result = suggestSlug('A'.repeat(50), '');
		expect(result).toHaveLength(40);
		expect(result).toBe('a'.repeat(40));
	});

	it('does not leave a dangling hyphen when the 40-char cut lands on one', () => {
		const result = suggestSlug('A'.repeat(39), 'Zz');
		expect(result).toBe('a'.repeat(39));
		expect(result.endsWith('-')).toBe(false);
	});

	it('collapses internal whitespace/punctuation runs to a single hyphen', () => {
		expect(suggestSlug('Mary   Jane', "O'Neil-Smith")).toBe('mary-jane-o-neil-smith');
	});
});

describe('suggestSlugOrBlank', () => {
	it('returns the suggestion when it meets the 3-character floor', () => {
		expect(suggestSlugOrBlank('Bob', '')).toBe('bob');
	});

	it('returns an empty string when the suggestion is too short to be useful', () => {
		expect(suggestSlugOrBlank('Al', '')).toBe('');
	});

	it("returns an empty string for the X-Æ case (reduces to a 1-character 'x')", () => {
		expect(suggestSlugOrBlank('X', 'Æ')).toBe('');
	});

	it('returns an empty string for two empty names', () => {
		expect(suggestSlugOrBlank('', '')).toBe('');
	});

	it('accepts a suggestion exactly at the floor', () => {
		expect(suggestSlugOrBlank('Amy', '')).toBe('amy');
	});
});
