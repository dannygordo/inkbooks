// Square's client-side credentials, fetched from the server rather than written down here.
//
// This file used to export hardcoded literals. They drifted: the applicationId here belonged to
// one Square sandbox application and SQUARE_SANDBOX_ACCESS_TOKEN on the server belonged to a
// different one. The browser minted a card nonce with app A, the server charged it with app B's
// token, and Square refused with:
//
//   "Card nonce not found in this application environment. Please ensure an application ID
//    belonging to the same environment is used when generating the nonce."
//
// which is an accurate description of the problem and completely opaque until you know to compare
// two values living in different halves of the repo. Neither half was wrong on its own - which is
// the whole shape of this bug, and the same shape as Artist.shopId vs. ArtistShopConnection and
// Project.depositAmount vs. the appointment actually holding the money.
//
// A nonce is only chargeable by the application that minted it. So the app id and the access token
// are not two related settings - they are one setting, and it now lives in exactly one place: the
// server's environment. See GET /square/config in server/routes/squarePayments.js.
import { APP_SETTINGS_CONSTANTS } from "../../constants";

const CONFIG_URL =
	APP_SETTINGS_CONSTANTS[import.meta.env.MODE.toUpperCase()].GRAPHQL_SERVER_URL + "square/config";

// Cached for the page's lifetime - the card form can mount several times in one session (a
// multi-sitting booking, a retry after a decline) and this answer doesn't change.
let configPromise = null;

export function loadSquareConfig() {
	if (!configPromise) {
		configPromise = fetch(CONFIG_URL)
			.then(async (response) => {
				const data = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(data.error || "Could not load Square configuration.");
				}
				return data;
			})
			.catch((err) => {
				// Cleared so a transient network failure doesn't poison every later mount with a
				// rejected promise nobody can retry out of.
				configPromise = null;
				throw err;
			});
	}
	return configPromise;
}

export default { loadSquareConfig };
