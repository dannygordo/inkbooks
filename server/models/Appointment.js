const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
	appointmentDate: {type: Date, required: true},
	projectId: {type: mongoose.Schema.Types.ObjectId},
	shopId: {type: mongoose.Schema.Types.ObjectId},
	userId: {type: mongoose.Schema.Types.ObjectId},
	title: {type: String},
	description: {type: String},
	total: {type: Number, default: 0},
	tip: {type: Number, default: 0},
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
	// The dollar amount the artist owes the shop for this appointment - separate from `total`/
	// `tip` since the shop's cut is usually a percentage of those, computed by the client at
	// creation time, not automatically derived here (no hardcoded split-percentage assumption).
	shopCutAmount: {type: Number},
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