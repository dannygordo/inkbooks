// REGRESSION for a real bug found while writing test/integration/reminders.test.js (X68):
// utils/email.js's own sendEmail() - the raw primitive every other send*() function in that file
// calls - was never in its module.exports. utils/reminders.js needs it directly (it builds its
// own subject/body from ReminderSettings templates rather than going through any of email.js's
// named send*() wrappers), so `const { sendEmail } = require('./email')` there was silently
// destructuring undefined. Every attempted email reminder threw "sendEmail is not a function",
// caught by sendRemindersForArtist's own per-channel try/catch and logged to ReminderLog as
// 'failed' - the sweep never crashed, and nothing anywhere surfaced it. Every existing test that
// touches reminders.js's email path mocks the entire ../../utils/email module
// (vi.mock('../../utils/email', () => ({ sendEmail: vi.fn() }))), which replaces the real module
// outright and could never have caught a missing export on the real one. Fixed by adding sendEmail
// to utils/email.js's module.exports.
//
// describe/it/expect come from Vitest's `globals: true` config.
const email = require('../../utils/email');
const sms = require('../../utils/sms');

describe('utils/email.js exports its own base send primitive', () => {
	it('exports sendEmail as a real function - the exact thing that was missing', () => {
		expect(typeof email.sendEmail).toBe('function');
	});

	// The actual break site: reminders.js destructures sendEmail/sendSms at require time, so a
	// missing export there is invisible until something actually calls it. Requiring the two real
	// (unmocked) modules the same way reminders.js does is the most direct possible regression
	// guard against this exact class of bug recurring for either channel.
	it('resolves a real sendEmail/sendSms the same way utils/reminders.js destructures them', () => {
		const { sendEmail } = require('../../utils/email');
		const { sendSms } = require('../../utils/sms');

		expect(typeof sendEmail).toBe('function');
		expect(typeof sendSms).toBe('function');
	});
});

// Neither sendEmail nor sendSms has ever been exercised for real anywhere in the suite - every
// consumer test mocks the whole module instead (see utils/notifications.js's own comment on why a
// destructured import gets vi.mock'd rather than vi.spyOn'd). This test environment has no
// RESEND_API_KEY/TWILIO_* configured (the same state most dev/CI environments start in before
// those are provisioned), so this is real, unmocked coverage of the "not configured" branch both
// files are explicitly designed to degrade gracefully through, rather than crash on.
describe('sendEmail: real behavior with no provider configured', () => {
	it('returns null rather than throwing when RESEND_API_KEY/EMAIL_FROM_ADDRESS are unset', async () => {
		const result = await email.sendEmail({
			to: 'client@example.com',
			subject: 'Test',
			htmlBody: '<p>hi</p>',
			textBody: 'hi',
		});

		expect(result).toBeNull();
	});
});

describe('sendSms: real behavior with no provider configured', () => {
	it('returns null rather than throwing when TWILIO_* env vars are unset', async () => {
		const result = await sms.sendSms({ to: '+15095550100', body: 'Test' });

		expect(result).toBeNull();
	});
});
