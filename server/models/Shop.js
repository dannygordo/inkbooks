const mongoose = require('mongoose');

const ShopSchema = new mongoose.Schema({
	name: {type: String, required: true},
	email: {type: String, required: true, unique: true},
	phone: {type: String, default: ""},
	address: {type: String, default: ""},
	city: {type: String, default: ""},
	state: {type: String, default: ""},
	zip: {type: String, default: ""},
	// Seeds User.timezone when somebody joins this shop, and is never read at send time - see
	// models/User.js. IANA name ('America/Los_Angeles'), never an offset.
	timezone: {type: String},
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
	// The shop's percentage cut of an artist's session work, e.g. 40 for 40%. A percentage rather
	// than a stored amount because that's how commission shops actually express it, and because a
	// stored amount can't be re-derived or audited against the session it came from.
	//
	// Defaults to 0 - deliberately, so nothing starts silently billing artists a cut nobody
	// configured. A shop that hasn't set this owes exactly what it did before: nothing. Individual
	// artists can be given a different rate via ArtistShopConnection.shopCutPercent (booth-renters
	// and guest artists commonly are).
	//
	// This is applied to Appointment.subtotalCents only - not tips, not tax, not processing fees.
	// See utils/shop-cut.js.
	shopCutPercent: {type: Number, default: 0},
	logo: {type: String, default: ""},
	billingType: {type: String, default: ""},
	status: {type: Number},

	// THE SQUARE CONNECTION IS NOT HERE ANY MORE. It lives on models/SquareAccount.js, keyed
	// {ownerType: 'SHOP', ownerId: this shop's _id} - see DECISIONS.md M9. It moved because a
	// connection belongs to an OWNER, and an independent artist is an owner too: with these fields
	// inline on Shop, "who can take a card" and "who is a shop" were the same question, which left
	// an unaffiliated artist able to configure a tax rate and unable to charge anything.
	//
	// The seven old fields (squareConnected, squareMerchantId, squareLocationId, both encrypted
	// tokens, squareTokenExpiresAt, squareConnectedAt) are deliberately still on existing DOCUMENTS
	// until scripts/migrate-square-accounts.js has run everywhere and charges are confirmed
	// working. Nothing reads them - not this schema, not the resolvers - only that script does.
	// Drop them in a follow-up once the migration is settled.

	// --- Square pricing configuration -----------------------------------------------------------
	// These stay. They are BUSINESS settings, not credentials, and they are read on every charge
	// whether or not Square is connected at all - which is exactly why they never belonged with the
	// connection fields in the first place.

	// Sales tax, in BASIS POINTS. 940 = 9.40%.
	//
	// Not a float percentage, for the same reason money is integer cents here: 9.4 cannot be
	// represented exactly, and a rate multiplied into a total is precisely where that stops being
	// academic. Basis points give hundredths of a percent, which is finer than any real rate.
	//
	// DESTINATION-BASED, so it belongs to the SHOP's location rather than the artist's - a client is
	// taxed where the work happens. An independent artist carries their own on Artist.
	taxRateBasisPoints: {type: Number, default: 0},

	// Square_Fee_Offset, per hour, in cents. See DECISIONS.md M5.
	//
	// Added to the price to recover Square's processing fee. Offered as a CHOICE at charge time and
	// never applied silently, and never on cash - it exists to recover a card fee, so charging it on
	// cash would be taking money for a cost nobody incurred.
	squareFeeOffsetCents: {type: Number, default: 0}

}, {
	timestamps: true
});
module.exports = mongoose.model('Shop', ShopSchema);
