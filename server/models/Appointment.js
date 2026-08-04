const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
	appointmentDate: {type: Date, required: true},
	projectId: {type: mongoose.Schema.Types.ObjectId},
	shopId: {type: mongoose.Schema.Types.ObjectId},
	userId: {type: mongoose.Schema.Types.ObjectId},
	title: {type: String},
	description: {type: String},
	// ---------------------------------------------------------------------------------------
	// Money. All integer CENTS - see utils/money.js for why, and scripts/migrate-money-to-cents.js
	// for the conversion of the old whole-dollar `total`/`tip`/`shopCutAmount` fields.
	//
	// The breakdown is stored as individual components rather than one `total`, because the
	// components are not interchangeable and the shop cut depends on telling them apart:
	//
	//   subtotalCents - the tattoo work itself. This is the artist's actual earnings and the ONLY
	//                   figure the shop cut is computed against.
	//   taxCents      - sales tax collected. Not income; it's remitted onward.
	//   feeCents      - processing fees (Square's cut). Not income either.
	//   tipCents      - the tip. Never part of the shop cut - see shopCutCents below.
	//   totalCents    - what the client actually paid: subtotal + tax + fee + tip. Stored rather
	//                   than derived so it always reflects the amount really charged, even if a
	//                   component is later corrected or a payment was taken outside the app.
	//
	// `total` used to mean "the session's price" in some places and "everything collected" in
	// others - ArtistPerformancePanel summed total + tip to get revenue, implying total excluded
	// tip, while SessionDetail's "Charge via Square" charged `total` alone, implying it was the
	// full amount due. Naming the components separately removes the ambiguity rather than picking
	// one of the two readings and hoping every call site agrees.
	subtotalCents: {type: Number, default: 0},
	taxCents: {type: Number, default: 0},
	feeCents: {type: Number, default: 0},
	tipCents: {type: Number, default: 0},
	totalCents: {type: Number, default: 0},

	// --- Deposits ---------------------------------------------------------------------------
	// A deposit is normally taken at the consult, before anyone knows how many sittings the work
	// will need, and is credited against the client's final session.
	//
	// It is recorded on the appointment that COLLECTED it, not on the Project, for two reasons.
	// The money has a date and a payer and belongs to the transaction that took it - that's what
	// makes it auditable against Square. And a consult often exists before its Project does (a
	// consult that never converts has no Project at all), so a Project-level field would have
	// nowhere to live at the moment the money actually changes hands.
	//
	// SINGLE USE is the property that matters most here, and it's enforced by state on this
	// document rather than by counting applications elsewhere: a deposit is 'available' until it
	// is applied, then 'applied' forever. Answering "has this been spent" by summing credits
	// across other appointments would be one missed query away from letting the same $200 be
	// credited to two different sessions.
	depositCents: {type: Number, default: 0},
	// 'none' when no deposit was taken. Deliberately a status rather than a nullable
	// depositAppliedAt: it makes the three states nameable in a query and impossible to confuse
	// with "a deposit of zero was taken".
	depositStatus: {
		type: String,
		enum: ['none', 'available', 'applied', 'refunded'],
		default: 'none',
	},
	depositCollectedAt: {type: Date},
	// Which appointment consumed it, and when. Kept as a trail rather than just flipping the
	// status, so "where did that deposit go" is answerable from the deposit's own record.
	depositAppliedToAppointmentId: {type: mongoose.Schema.Types.ObjectId},
	depositAppliedAt: {type: Date},
	depositAppliedBy: {type: mongoose.Schema.Types.ObjectId},

	// The other side of the same transaction: a credit applied TO this appointment, and the
	// deposit it came from. Stored on both documents on purpose - the deposit needs to know it's
	// spent, and the session needs to know why its total is lower than its subtotal, and neither
	// question should require walking the other way round.
	//
	// The credit REDUCES what the client owes on this session, and the shop cut is computed on
	// the reduced figure - see utils/shop-cut.js. That's a deliberate rule: a $200 session with a
	// $100 deposit applied is a $100 session for shop-cut purposes, because the shop already took
	// its cut on the deposit at the consult that collected it.
	depositCreditCents: {type: Number, default: 0},
	depositCreditFromAppointmentId: {type: mongoose.Schema.Types.ObjectId},
	// Was `required: true` - broke independent artists (no shop, nothing to owe) unless every
	// caller remembered to pass a throwaway value. 'none' is the real default for that case;
	// the rest of the enum is the shop-cut payment lifecycle (see PRODUCTION_ROADMAP.md's
	// "Shop-cut ledger" section for the full design):
	//   none                - no shop involved, nothing owed
	//   unpaid              - shop cut owed, nothing initiated yet
	//   invoice_sent        - a Square invoice was created and sent to the artist; awaiting payment
	//   pending_confirmation - artist marked this paid manually (e.g. cash); awaiting the shop's
	//                          confirmation - see mutations/shopCutPayments.js's dual-control design
	//   paid                - confirmed paid, either by Square's invoice.payment_made webhook or
	//                          by the shop manually confirming a pending_confirmation record
	// 'received' is a pre-existing value from before this change (see client/src/constants/app.js's
	// SHOP_CUT_STATUS dropdown) - kept in the enum for backward compatibility with any Appointment
	// already written with it, even though its exact intended meaning next to 'paid' predates this
	// work and isn't being redefined here.
	shopCutStatus: {
		type: String,
		enum: ['none', 'unpaid', 'invoice_sent', 'pending_confirmation', 'paid', 'received'],
		default: 'none',
	},
	// What the artist owes the shop for this appointment, in cents.
	//
	// Computed from subtotalCents ONLY - never from totalCents. Tips are excluded because the
	// artist keeps every tip, full stop; tax is excluded because it isn't income, it's money owed
	// to the state; processing fees are excluded because they're Square's, not the artist's. The
	// shop's cut is a share of the work, so it's a share of what the work was priced at.
	//
	// Previously this was a plain number in dollars that nothing in the app ever actually set -
	// createAppointment didn't even accept it, no UI wrote it, and the only non-null values in
	// existence came from seed data. The shop-cut payout dashboard and the Square invoice flow
	// were both reading a field that, on real data, was always null. See utils/shop-cut.js for
	// the computation and models/Shop.js's shopCutPercent for where the percentage comes from.
	shopCutCents: {type: Number, default: 0},
	// The percentage actually applied when shopCutCents was computed, captured at that moment.
	// Stored rather than looked up on read because a shop changing its rate must not silently
	// rewrite what artists already owe on past sessions - a ledger entry has to stay auditable
	// against the terms in force when it was created.
	shopCutPercentApplied: {type: Number},
	shopCutPaymentMethod: {type: String, enum: ['square_invoice', 'manual']},
	// Square's invoice id - set when createShopCutInvoice runs, used by the webhook handler to
	// look this Appointment back up when invoice.payment_made fires.
	shopCutSquareInvoiceId: {type: String},
	// Manual/cash-payment dual-control trail - who marked it paid (the artist) and, separately,
	// who on the shop side actually confirmed it (see mutations/shopCutPayments.js). Kept as two
	// separate fields rather than trusting the artist's own claim alone, since this is exactly
	// the kind of unverified self-report a shop needs to be able to dispute.
	shopCutMarkedPaidBy: {type: mongoose.Schema.Types.ObjectId},
	shopCutMarkedPaidAt: {type: Date},
	shopCutConfirmedBy: {type: mongoose.Schema.Types.ObjectId},
	shopCutConfirmedAt: {type: Date},
	appointmentType: {type: String, required: true},
	appointmentStatus: {type: String, required: true},
	// Set by convertBookingRequest (mutations/bookingRequests.js) when this Appointment was created
	// from a BookingRequest (consult or session) - not set on the "Other" type or the
	// existing-project session path (both created via plain createAppointment, with nothing to
	// point back to). Lets a consult Appointment - which has no Project of its own to hold intake
	// details or a "convert to session" action - link back to its originating BookingRequest for
	// both (see the Appointment.bookingRequest field resolver in resolvers/index.js).
	bookingRequestId: {type: mongoose.Schema.Types.ObjectId},
    createdAt: {type: Date, required: true},
    updatedAt: {type: Date, required: true},

	// Session timer - see mutations/appointments.js's startSessionTimer/stopSessionTimer/
	// resetSessionTimer. Deliberately not exposed on AppointmentInput (the generic updateAppointment
	// mutation's input type) - only those three dedicated, ownership-checked mutations are allowed
	// to change these, so a client can't corrupt timer state through the general-purpose update
	// path. Server-persisted rather than pure client-side React state so a page refresh, browser
	// close, or laptop sleep mid-session doesn't lose the actual elapsed time - accumulatedSeconds
	// holds everything already banked from prior start/stop cycles, timerStartedAt (only set while
	// timerStatus is 'running') is when the *current* running interval began; the live total while
	// running is accumulatedSeconds + (now - timerStartedAt), computed on read, not stored.
	timerStatus: {type: String, enum: ['stopped', 'running'], default: 'stopped'},
	timerStartedAt: {type: Date},
	accumulatedSeconds: {type: Number, default: 0},
	// Session notes - unlike the timer fields above, this one *is* editable through the regular
	// updateAppointment mutation (see AppointmentInput) - a plain autosaved textarea doesn't need
	// its own dedicated mutation the way timer state, which has real start/stop/reset semantics
	// to protect, does.
	sessionNotes: {type: String}

});
module.exports = mongoose.model('Appointment', AppointmentSchema);