// The message-preview subject line.
//
// Two separate reasons this exists, and the second one is why it gets its own file rather than
// being checked incidentally through a send.
//
// Readability: every message notification used one fixed subject, so clients that thread by
// subject - Gmail among them - folded an entire back-and-forth into a single conversation. The
// second and third emails were indistinguishable from no email arriving, which is exactly how the
// problem was reported.
//
// Safety: the snippet is text a stranger typed, going into a MAIL HEADER. A newline in a header
// value terminates it and starts a new one, which is how "hi\nBcc: someone@else" becomes an extra
// recipient. That is a boundary, and boundaries get direct tests rather than inferred ones.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const {
	snippetForSubject,
	subjectForNewMessage,
	SUBJECT_SNIPPET_MAX,
} = require('../../utils/email');

describe('header safety', () => {
	it('strips newlines, so a message cannot inject a header', () => {
		// THE test in this file. Everything else here is polish; this one is the difference between
		// a subject line and an open relay.
		const injected = 'Looks harmless\r\nBcc: attacker@example.com';
		const result = snippetForSubject(injected);

		expect(result).not.toContain('\n');
		expect(result).not.toContain('\r');
		expect(result).toBe('Looks harmless Bcc: attacker@example.com');
	});

	it('flattens every kind of whitespace, not just \\n', () => {
		// A test that only checked \n would pass against a `.replace(/\n/g, ' ')` that still lets a
		// bare \r through - and a bare carriage return is enough on its own in some MTAs.
		expect(snippetForSubject('a\tb\r\nc d   e')).toBe('a b c d e');
	});

	it('does the stripping even when the text is short enough not to truncate', () => {
		// The early-return path for short strings is the one most likely to skip sanitising, since
		// nothing else has to happen to it.
		expect(snippetForSubject('hi\nthere')).toBe('hi there');
	});
});

describe('readability', () => {
	it('passes a short message through untouched', () => {
		expect(snippetForSubject('Tuesday works for me')).toBe('Tuesday works for me');
	});

	it('trims to a word boundary rather than mid-word', () => {
		const long =
			'I was thinking about the forearm piece we discussed and whether we could shift it';
		const result = snippetForSubject(long);

		expect(result.endsWith('…')).toBe(true);
		expect(result.length).toBeLessThanOrEqual(SUBJECT_SNIPPET_MAX + 1);
		// Cut at a space, so the last word is whole.
		expect(result.slice(0, -1)).toBe(result.slice(0, -1).trimEnd());
		expect(long.startsWith(result.slice(0, -1))).toBe(true);
	});

	it('hard-cuts a single long token instead of returning almost nothing', () => {
		// Word-boundary trimming with no guard turns a 200-character URL into an empty string,
		// because there is no space to break on until the end.
		const result = snippetForSubject('x'.repeat(200));
		expect(result).toBe(`${'x'.repeat(SUBJECT_SNIPPET_MAX)}…`);
	});

	it('returns empty for nothing usable', () => {
		expect(snippetForSubject('')).toBe('');
		expect(snippetForSubject('    \n\t  ')).toBe('');
		expect(snippetForSubject(null)).toBe('');
		expect(snippetForSubject(undefined)).toBe('');
	});
});

describe('the composed subject', () => {
	it('leads with the sender and the message', () => {
		expect(subjectForNewMessage('Cass Brown', 'Tuesday at 2 works, see you then', 'fallback')).toBe(
			'Cass Brown: Tuesday at 2 works, see you then',
		);
	});

	it('uses the fallback when there is nothing to preview', () => {
		// An image-only or whitespace-only message must not produce a subject ending in a bare
		// colon, which is what a naive template would give.
		expect(subjectForNewMessage('Cass Brown', '   ', 'Cass Brown replied to your request')).toBe(
			'Cass Brown replied to your request',
		);
		expect(subjectForNewMessage('Cass Brown', null, 'Cass Brown replied to your request')).toBe(
			'Cass Brown replied to your request',
		);
	});

	it('sanitises through the composed path too, not just the helper', () => {
		// The helper is tested directly above, but the thing that ships is this composition - so
		// the boundary is asserted where it is actually used.
		const subject = subjectForNewMessage('Cass Brown', 'hi\r\nBcc: attacker@example.com', 'x');
		expect(subject).not.toMatch(/[\r\n]/);
	});

	it('gives two different messages two different subjects', () => {
		// The whole point. Identical subjects are what let Gmail thread a conversation into one
		// entry and make later emails look like they never arrived.
		const a = subjectForNewMessage('Cass Brown', 'Tuesday works', 'fallback');
		const b = subjectForNewMessage('Cass Brown', 'Actually, can we do Thursday?', 'fallback');
		expect(a).not.toBe(b);
	});
});
