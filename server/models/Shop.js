const mongoose = require('mongoose');

const ShopSchema = new mongoose.Schema({
	name: {type: String, required: true},
	email: {type: String, required: true, unique: true},
	phone: {type: String, default: ""},
	address: {type: String, default: ""},
	city: {type: String, default: ""},
	state: {type: String, default: ""},
	zip: {type: String, default: ""},
	instagram: {type: String, default: ""},
	facebook: {type: String, default: ""},
	website: {type: String},
	shopMinimum: {type: Number, default: 0},
	hourlyRate: {type: Number, default: 0},
	// Added alongside User.flatRate/hourlyRate/billingType so a shop can express a flat-rate
	// expectation for booth-renters too, not just hourly. See ArtistShopConnection.rateSource for
	// which side's rate (shop's or the individual artist's) actually applies to a given
	// connected artist's sessions.
	flatRate: {type: Number, default: 0},
	logo: {type: String, default: ""},
	billingType: {type: String, default: ""},
	status: {type: Number},

	// Square OAuth connection - lets InkBooks create/publish invoices on this shop's behalf
	// (Invoices API) without InkBooks ever touching the money. Tokens are encrypted at rest
	// (see utils/token-crypto.js) per Square's Move-OAuth-to-Production token-handling
	// requirements - "guarded like passwords". squareMerchantId/squareLocationId are not
	// secret and stored in plaintext; they're just identifiers, not credentials.
	squareConnected: {type: Boolean, default: false},
	squareMerchantId: {type: String},
	squareLocationId: {type: String},
	squareAccessTokenEncrypted: {type: String},
	squareRefreshTokenEncrypted: {type: String},
	// Square OAuth access tokens expire every 30 days - this is checked before each use (see
	// utils/square.js's refreshAccessTokenIfNeeded) and proactively refreshed once within 7
	// days of expiry, per Square's own recommendation.
	squareTokenExpiresAt: {type: Date},
	squareConnectedAt: {type: Date}

}, {
	timestamps: true
});
module.exports = mongoose.model('Shop', ShopSchema);
