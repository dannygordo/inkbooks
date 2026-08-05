const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // Email IS the identity. There was a separate required `username` alongside it, auto-derived
    // from the email's local part plus random hex - invisible to the person it belonged to, never
    // shown anywhere in the UI, and the only key login() would accept. Every invited artist and
    // staff member could set a password and then had no way to sign in, because nothing told them
    // what their username was. A credential nobody can know is not a credential.
    //
    // A human-readable public handle is a real thing to want later - /book/maya-chen reads better
    // than an ObjectId - but that's a profile SLUG on Artist: optional, chosen, changeable. It is
    // not an auth field, and conflating the two is what produced the lockout.
    //
    // lowercase + trim are enforced HERE rather than at each call site. Some paths normalised and
    // some didn't, which was harmless while email was only a contact field and becomes "why can't
    // I log in" the moment it's the credential: Maya@shop.com and maya@shop.com have to be one
    // account, and the unique index only agrees if the stored value is canonical.
    email: {type: String, required: true, unique: true, lowercase: true, trim: true, index: true},
    password: {type: String, required: true},
    role: {type: Number, required: true},
    userType: {type: String, required: true},
    firstName: {type: String},
    lastName: {type: String},
    avatar: {type: String},
    tagColor: {type: String},
    // Guest accounts (created behind the scenes when a booking-request intake form is
    // submitted - see models/BookingRequest.js) still populate `password` with an unusable
    // random hash to satisfy the required field above, rather than making password optional
    // and rippling that into every bcrypt.compare call elsewhere. This flag is the actual
    // signal: false means the account was never really "claimed" with a real password, which
    // is also the security gate on whether a guest magic-link token is allowed to work for
    // this user - see utils/guest-auth.js.
    hasSetPassword: {type: Boolean, required: true, default: true}

}, {
    timestamps: true
});
module.exports = mongoose.model('User', UserSchema);