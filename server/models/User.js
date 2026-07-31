const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {type: String, required: true, unique: true},
    email: {type: String, required: true, unique: true},
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