// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.
//
// Run for real on 2026-08-18 (see HANDOFF.md's Auto-Responses entry) - passed clean, as expected
// for a DB-free pure-function suite.
//
// renderTemplate moved here from utils/reminders.js verbatim (see utils/message-templates.js's own
// header comment) the moment Auto-Responses needed the identical {{field}} substitution -
// reminders.js re-exports it unchanged, so this is the one place its behavior is pinned down.
const { renderTemplate } = require('../../utils/message-templates');

describe('renderTemplate', () => {
	it('substitutes every known field', () => {
		const result = renderTemplate('Hi {{clientFirstName}}, from {{artistName}}.', {
			clientFirstName: 'Alex',
			artistName: 'Maya',
		});
		expect(result).toBe('Hi Alex, from Maya.');
	});

	it('leaves an unknown field untouched rather than blanking it', () => {
		// A typo'd or not-yet-supported merge field in a template must not silently disappear -
		// that would turn a visible mistake into an invisible one. hasOwnProperty is what makes
		// this the behavior rather than `vars[key] || match`, which would also fire on a legitimate
		// empty-string value.
		const result = renderTemplate('Hi {{clientFirstName}}, {{notARealField}}.', {
			clientFirstName: 'Alex',
		});
		expect(result).toBe('Hi Alex, {{notARealField}}.');
	});

	it('tolerates whitespace inside the braces', () => {
		const result = renderTemplate('Hi {{ clientFirstName }}!', { clientFirstName: 'Alex' });
		expect(result).toBe('Hi Alex!');
	});

	it('substitutes the same field every time it appears', () => {
		const result = renderTemplate('{{artistName}} says hi, from {{artistName}}.', {
			artistName: 'Maya',
		});
		expect(result).toBe('Maya says hi, from Maya.');
	});

	it('treats a null/undefined template as an empty string rather than throwing', () => {
		expect(renderTemplate(null, {})).toBe('');
		expect(renderTemplate(undefined, {})).toBe('');
	});

	it('renders a real Auto-Response default template end to end', () => {
		// DEFAULT_TEMPLATES.SESSION_COMPLETED.emailSubject from utils/auto-responses.js - a real
		// merge case rather than a synthetic one, since this is exactly what a client sees when an
		// artist/shop never overrides the built-in wording.
		const result = renderTemplate('Aftercare instructions from {{artistName}}', {
			artistName: 'Maya Chen',
		});
		expect(result).toBe('Aftercare instructions from Maya Chen');
	});
});
