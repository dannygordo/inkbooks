const PushToken = require('../../models/PushToken');
const withAuth = require('../../utils/with-auth');
const { UserInputError } = require('../../utils/errors');

const VALID_PLATFORMS = ['ios', 'android'];

module.exports = {
	Mutation: {
		/**
		 * Upserts BY TOKEN, not by (userId, token) - see models/PushToken.js's comment on why.
		 * Whoever is signed in right now on this device is who its pushes should reach, so a second
		 * account signing in on the same phone reassigns the existing row rather than leaving two
		 * rows racing to own one physical device. Mongoose applies schema defaults (createdAt) on an
		 * upsert-created document automatically (setDefaultsOnInsert is on by default), so only the
		 * fields that actually change need setting here.
		 */
		registerDeviceToken: withAuth(async (_, { token, platform }, context, info, user) => {
			if (!VALID_PLATFORMS.includes(platform)) {
				throw new UserInputError('Errors', {
					errors: { platform: 'platform must be ios or android' },
				});
			}
			await PushToken.findOneAndUpdate(
				{ token },
				{ $set: { userId: user.id, platform, lastSeenAt: new Date() } },
				{ upsert: true },
			);
			return true;
		}),
		// Called on logout - a signed-out device must stop receiving push for the account it just
		// left, the same reason TokenStorageService's cache wipe exists for on the client side.
		// Not an error if the token was never registered (a device that never got past permission
		// prompt), so this always succeeds rather than requiring the caller to know whether one
		// exists first.
		unregisterDeviceToken: withAuth(async (_, { token }) => {
			await PushToken.deleteOne({ token });
			return true;
		}),
	},
};
