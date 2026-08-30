const { Expo } = require('expo-server-sdk');
const PushToken = require('../models/PushToken');
const { reportError } = require('./error-reporting');

/**
 * Expo push, as the fourth notification channel (PRODUCTION_ROADMAP.md Phase 5 step 7) - wired
 * into utils/notifications.js's notify(), not a parallel system alongside it.
 *
 * Unlike utils/email.js's Resend integration, sending needs no API key: Expo's push service is
 * open for the volume this app will ever produce (an access token only raises the rate limit,
 * which is not a problem this app has). So there is no "not configured" state to check for the
 * way sendEmail() has - a recipient with no registered device simply produces zero messages below,
 * the same shape as a recipient with no email address.
 */

// Cached lazily rather than constructed at module load, so a test can inject its own fake client
// (see sendPushForRecipients's expoClient option) without ever touching this one.
let cachedClient = null;
function client() {
	if (!cachedClient) {
		cachedClient = new Expo();
	}
	return cachedClient;
}

/**
 * Sends one push message to every device on file for a set of recipients.
 *
 * Never throws. A push failure is reported (reportError) and folded into the returned counts
 * instead - the same "silent failure gets caught, but never at the cost of the thing that
 * triggered it" rule utils/notifications.js's notifySafely() enforces one level up. notify()
 * calls this without awaiting it specifically so an Expo outage can never add latency to a
 * deposit, a booking, or any other real action - see the comment at the call site.
 *
 * `expoClient` is injectable for tests, matching sendEmail's `send` param in utils/email.js -
 * nothing in production passes it.
 */
async function sendPushForRecipients(recipientIds, { title, body, data = {} }, { expoClient } = {}) {
	const ids = Array.from(new Set((recipientIds || []).map(String)));
	if (ids.length === 0) {
		return { sent: 0, pruned: 0 };
	}

	let tokens;
	try {
		tokens = await PushToken.find({ userId: { $in: ids } }).select('token');
	} catch (err) {
		reportError(err, { context: '[push] failed to look up device tokens' });
		return { sent: 0, pruned: 0 };
	}

	if (tokens.length === 0) {
		return { sent: 0, pruned: 0 };
	}

	const expo = expoClient || client();

	const messages = [];
	for (const { token } of tokens) {
		// registerDeviceToken doesn't validate token format on write (Expo's own format can change
		// between SDK releases, and rejecting a real device at registration time is a worse failure
		// than skipping one bad row here) - so this is the actual gate, and it's cheap enough to run
		// on every send rather than trust what's in the database.
		if (!Expo.isExpoPushToken(token)) {
			continue;
		}
		messages.push({ to: token, sound: 'default', title, body, data });
	}

	if (messages.length === 0) {
		return { sent: 0, pruned: 0 };
	}

	let sent = 0;
	let pruned = 0;

	const chunks = expo.chunkPushNotifications(messages);
	for (const chunk of chunks) {
		let tickets;
		try {
			// eslint-disable-next-line no-await-in-loop
			tickets = await expo.sendPushNotificationsAsync(chunk);
		} catch (err) {
			reportError(err, { context: '[push] Expo push send request failed' });
			continue;
		}

		for (let i = 0; i < tickets.length; i += 1) {
			const ticket = tickets[i];
			if (ticket.status === 'ok') {
				sent += 1;
				continue;
			}

			// DeviceNotRegistered is the one error Expo documents as permanent - the app was
			// uninstalled, or the OS revoked the token - so the row is dead and pruning it now saves
			// every future notify() call a wasted lookup. Everything else (rate limits, a malformed
			// message, a transient provider error) is reported but leaves the token in place, since
			// the token itself may still be good.
			if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
				const deadToken = chunk[i] && chunk[i].to;
				if (deadToken) {
					// eslint-disable-next-line no-await-in-loop
					await PushToken.deleteOne({ token: deadToken }).catch(() => {});
					pruned += 1;
				}
			} else {
				reportError(new Error(ticket.message || 'Expo push ticket error'), {
					context: '[push] Expo push ticket error',
					details: ticket.details,
				});
			}
		}
	}

	return { sent, pruned };
}

module.exports = { sendPushForRecipients };
