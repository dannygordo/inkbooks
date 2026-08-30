const mongoose = require('mongoose');

/**
 * One row per (app install, device) - not per user.
 *
 * An Expo push token is minted by the app install itself, not by whoever happens to be logged in
 * when it registers - and that distinction matters for exactly the case a tattoo shop's
 * front-desk iPad hits constantly: one person logs out, someone else logs in on the SAME physical
 * device. The token doesn't change; only who should receive it does. That is why
 * registerDeviceToken (resolvers/pushTokens.js) upserts BY TOKEN rather than by (userId, token) -
 * the unique index below is what makes a token belong to exactly whoever is currently signed in
 * on that device, never to two people at once, and never duplicated into a second row on re-login.
 */
const pushTokenSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
	token: { type: String, required: true, unique: true },
	platform: { type: String, required: true, enum: ['ios', 'android'] },
	createdAt: { type: Date, required: true, default: Date.now },
	// Bumped on every re-registration (app foreground, login) - not load-bearing for anything yet,
	// but the field a future staleness sweep (unregister tokens nobody's app has touched in N
	// months) would key off, the same shape ReminderLog/Notification already lean on elsewhere in
	// this codebase for "when did we last actually hear from this."
	lastSeenAt: { type: Date, required: true, default: Date.now },
});

// The lookup utils/push.js's sendPushForRecipients runs on every notify() call.
pushTokenSchema.index({ userId: 1 });

module.exports = mongoose.model('PushToken', pushTokenSchema);
