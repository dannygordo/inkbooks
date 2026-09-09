import { formatFormAnswer } from '@/utils/formAnswers';

describe('formatFormAnswer', () => {
	it('returns an em dash for a missing answer', () => {
		expect(formatFormAnswer({ type: 'short_text' }, null)).toBe('—');
		expect(formatFormAnswer({ type: 'short_text' }, undefined)).toBe('—');
	});

	it('renders short_text/paragraph answers as their raw text', () => {
		expect(formatFormAnswer({ type: 'short_text' }, { textValue: 'Peanut allergy' })).toBe('Peanut allergy');
		expect(formatFormAnswer({ type: 'paragraph' }, { textValue: '' })).toBe('—');
	});

	it('joins single_choice/multi_choice selections with a comma', () => {
		expect(formatFormAnswer({ type: 'single_choice' }, { selectedOptions: ['Yes'] })).toBe('Yes');
		expect(formatFormAnswer({ type: 'multi_choice' }, { selectedOptions: ['A', 'B'] })).toBe('A, B');
		expect(formatFormAnswer({ type: 'multi_choice' }, { selectedOptions: [] })).toBe('—');
	});

	it('formats a date answer in UTC, not the local timezone - a pure calendar date has no time-of-day meaning', () => {
		// UTC midnight on the 2nd - a naive local-timezone read west of UTC would show the 1st.
		expect(formatFormAnswer({ type: 'date' }, { dateValue: '1995-03-02T00:00:00.000Z' })).toBe('Mar 2, 1995');
	});

	it('summarizes file_upload as a count, not the raw URLs', () => {
		expect(formatFormAnswer({ type: 'file_upload' }, { fileUrls: ['a.jpg'] })).toBe('1 file');
		expect(formatFormAnswer({ type: 'file_upload' }, { fileUrls: ['a.jpg', 'b.png'] })).toBe('2 files');
		expect(formatFormAnswer({ type: 'file_upload' }, { fileUrls: [] })).toBe('—');
	});

	it('formats a signature with the signed name and a LOCAL (not UTC) timestamp - signedAt is a real instant, unlike dateValue above', () => {
		// Computed from the same runner-local timezone the function itself reads, rather than a
		// hardcoded clock time - this asserts the actual behavior (signedName plumbed through,
		// signedAt read in local time) without the test itself becoming timezone-flaky.
		const signedAt = '2026-01-15T18:30:00.000Z';
		const d = new Date(signedAt);
		const expectedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		const expectedTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		expect(
			formatFormAnswer({ type: 'signature' }, { signature: { signedName: 'Alex Rivera', signedAt } }),
		).toBe(`Signed "Alex Rivera" on ${expectedDate} ${expectedTime}`);
	});

	it('returns an em dash for an unsigned signature or an unknown field type', () => {
		expect(formatFormAnswer({ type: 'signature' }, { signature: null })).toBe('—');
		expect(formatFormAnswer({ type: 'mystery' }, { textValue: 'x' })).toBe('—');
	});
});
