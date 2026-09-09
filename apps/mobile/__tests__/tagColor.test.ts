import { FALLBACK_TAG_COLOR, resolveTagColor, tagColorRowStyle } from '@/utils/tagColor';

describe('resolveTagColor', () => {
	it('passes through a real color unchanged', () => {
		expect(resolveTagColor('#e2d355')).toBe('#e2d355');
	});

	it('falls back for missing or literal-white values - the silently-invisible-label bug', () => {
		expect(resolveTagColor(null)).toBe(FALLBACK_TAG_COLOR);
		expect(resolveTagColor(undefined)).toBe(FALLBACK_TAG_COLOR);
		expect(resolveTagColor('')).toBe(FALLBACK_TAG_COLOR);
		expect(resolveTagColor('#fff')).toBe(FALLBACK_TAG_COLOR);
		expect(resolveTagColor('#FFFFFF')).toBe(FALLBACK_TAG_COLOR);
	});
});

describe('tagColorRowStyle', () => {
	it('returns a tinted background and a solid left bar for a real color', () => {
		expect(tagColorRowStyle('#122152')).toEqual({
			backgroundColor: 'rgba(18, 33, 82, 0.14)',
			borderLeftWidth: 4,
			borderLeftColor: 'rgb(18, 33, 82)',
		});
	});

	it('expands a 3-digit hex the same as a 6-digit one', () => {
		expect(tagColorRowStyle('#abc')).toEqual(tagColorRowStyle('#aabbcc'));
	});

	it('falls back to the resolved (grey) color rather than an empty style', () => {
		expect(tagColorRowStyle(null)).toEqual(tagColorRowStyle(FALLBACK_TAG_COLOR));
	});

	it('returns an empty object for an unparseable color', () => {
		expect(tagColorRowStyle('not-a-color')).toEqual({});
	});
});
