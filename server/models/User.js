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
    // Light/dark/system, chosen from Settings - Appearance. An account fact, not a device fact:
    // deliberately NOT localStorage, so it follows the person to whatever browser or device they
    // sign into next, the same reasoning notificationPrefs below already applies to email/in-app
    // preferences. Absent/undefined behaves as 'system' at read time (see ThemeModeProvider.jsx)
    // rather than defaulting a value into every existing account via migration.
    themePreference: {type: String, enum: ['light', 'dark', 'system']},
    // Guest accounts (created behind the scenes when a booking-request intake form is
    // submitted - see models/BookingRequest.js) still populate `password` with an unusable
    // random hash to satisfy the required field above, rather than making password optional
    // and rippling that into every bcrypt.compare call elsewhere. This flag is the actual
    // signal: false means the account was never really "claimed" with a real password, which
    // is also the security gate on whether a guest magic-link token is allowed to work for
    // this user - see utils/guest-auth.js.
    hasSetPassword: {type: Boolean, required: true, default: true},

    /**
     * Notification preferences: per CATEGORY x per CHANNEL. Six toggles, not forty.
     *
     * Per-event-type settings are the obvious "more control" answer and they produce a settings
     * page nobody reads, which means the defaults do all the work anyway - with far more code
     * behind them. Six is few enough that somebody annoyed by one thing goes and fixes that one
     * thing instead of muting everything.
     *
     * ONLY the email channel can be turned off. In-app is always on, because the inbox is also
     * the record - "did we tell the shop about that payment" has to stay answerable, and silently
     * dropping rows would make it not. Muting is about what reaches your inbox at work, not about
     * erasing what happened.
     *
     * Absent means "use the role-appropriate default" (see utils/notification-preferences.js), not
     * "off". A missing preference and a deliberate false are different answers, and storing
     * defaults into every user at creation would freeze today's defaults into accounts forever -
     * changing a default later would then only affect people who signed up after the change.
     */
    notificationPrefs: {
      moneyEmail: { type: Boolean },
      scheduleEmail: { type: Boolean },
      rosterEmail: { type: Boolean },
      messageEmail: { type: Boolean },
    },

    /**
     * IANA zone name, never an offset - an offset is wrong twice a year, and a digest arriving an
     * hour late every March is the kind of bug nobody reports and everybody notices.
     *
     * This is the ONLY thing read when deciding when to send. Shop.timezone exists as the source
     * of a default when somebody joins a shop, but is never consulted at send time: a person is in
     * a timezone, a shop is only where they usually are. Reading the shop when there is one and
     * the user otherwise would be one fact in two places with a precedence rule between them,
     * which is how Artist.shopId and ArtistShopConnection disagreed for months.
     */
    timezone: {type: String},

    /**
     * The local hour a daily digest arrives, 0-23. Stored as an hour plus a zone rather than as a
     * precomputed UTC send time: a stored UTC moment is a derived value that goes quietly wrong at
     * every DST boundary and every time somebody changes timezone. The hour is what the person
     * chose; the instant is computed from both at send time.
     */
    digestHour: {type: Number, min: 0, max: 23}

}, {
    timestamps: true
});
module.exports = mongoose.model('User', UserSchema);