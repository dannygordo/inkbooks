const gql = require('graphql-tag');

module.exports = gql`
  scalar Date
  scalar DateTime
  interface UserInfo {
    id: ID!
    firstName: String
    lastName: String
    email: String
    phone: String
    address: String
    city: String
    state: String
    zip: String
    instagram: String
    facebook: String
    avatar: String
  }
  type Conversation {
    id: ID!
    members: [ID!]!
    membersInfo: [User]
    messages: [Message]
    # Unread FOR THE CALLER - messages newer than their own lastReadAt that they didn't send.
    # Always the viewer's count, never a property of the conversation itself, which is why it
    # takes no argument: asking for someone else's unread count is not a thing this should
    # answer. See utils/conversation-reads.js.
    unreadCount: Int!
    createdAt: DateTime
    updatedAt: DateTime
  }
  input ConversationInput {
    id: ID!
    members: [ID!]!
    createdAt: DateTime
    updatedAt: DateTime
  }
  type Message {
    id: ID!
    conversationId: ID!
    senderId: ID!
    user: User
    message: String!
    createdAt: DateTime
    updatedAt: DateTime

  }
  input MessageInput {
    id: ID!
    conversationId: ID!
    senderId: ID!
    message: String!
    createdAt: DateTime
    updatedAt: DateTime
  }
  type Artist implements UserInfo {
    id: ID!
    firstName: String!
    lastName: String!
    email: String!
    title: String
    phone: String
    address: String
    city: String
    state: String
    zip: String
    instagram: String
    facebook: String
    avatar: String
    startDate: Date!
    endDate: Date
    hourlyRate: Int
    flatRate: Int
    billingType: String
    # The artist's public booking handle - the /book/<slug> link they hand out. Nullable: an
    # artist without one is a legal state, and /book/<objectId> still resolves. See
    # utils/booking-slug.js.
    bookingSlug: String
    # Was ID! - broke the moment any independent artist (no shop connection at all, the
    # headline scenario of the artist-centric tenancy redesign - see PRODUCTION_ROADMAP.md) got
    # serialized in a list query: Artist.js's Mongoose schema already allows shopId to be unset,
    # and ArtistInput.shopId below is already nullable, but this output type never got updated to
    # match. The mismatch meant "Cannot return null for non-nullable field Artist.shopId" the
    # instant one existed, which nulls the entire response under Apollo Client's default error
    # policy - not just that one artist. Same fix already applied to Appointment.shopId during
    # the shop-cut ledger work; this field was simply missed at the time.
    shopId: ID
    shop: Shop
    userId: ID!
    user: User
    status: Int
  }
  input ArtistInput {
    id: ID!
    firstName: String
    lastName: String
    email: String
    title: String
    phone: String
    address: String
    city: String
    state: String
    zip: String
    instagram: String
    facebook: String
    avatar: String
    startDate: Date
    endDate: Date
    hourlyRate: Int
    flatRate: Int
    billingType: String
    bookingSlug: String
    shopId: ID
    userId: ID
    status: Int
  }
  input ShopInput {
    id: ID!
    name: String
    email: String
    phone: String
    address: String
    city: String
    state: String
    zip: String
    instagram: String
    facebook: String
    website: String
    shopMinimum: Int
    hourlyRate: Int
    flatRate: Int
    # See models/Shop.js - percentage (40 = 40%), applied to session subtotals only.
    shopCutPercent: Int
    logo: String
    billingType: String
    status: Int
  }
  type Shop {
    id: ID!
    name: String!
    email: String!
    phone: String
    address: String
    city: String
    state: String
    zip: String
    instagram: String
    facebook: String
    website: String
    shopMinimum: Int
    hourlyRate: Int
    flatRate: Int
    # The shop's percentage cut of an artist's session work (40 = 40%), applied to
    # Appointment.subtotalCents only - never tips. See models/Shop.js and utils/shop-cut.js.
    shopCutPercent: Int
    logo: String
    billingType: String
    status: Int
    # Square connection status - deliberately exposes only non-secret fields. The encrypted
    # access/refresh tokens never leave the server.
    #
    # DERIVED, not stored on Shop. The connection lives on SquareAccount keyed by owner (see
    # DECISIONS.md M9 and the Shop field resolvers in resolvers/index.js). These three names are
    # kept as-is on purpose: the client already queries them, and where the server keeps the row is
    # not something the schema should make the client care about.
    squareConnected: Boolean
    squareLocationId: String
    squareConnectedAt: DateTime
  }
  # What charging a session would come to. Every figure server-computed from stored rates - see
  # utils/charge-quote.js. The UI displays this and then charges it; it never adds the numbers up
  # itself, because a total agreed on screen and a different total leaving the card is a bug
  # nothing in the system can adjudicate afterwards.
  type ChargeQuote {
    subtotalCents: Int!
    # Already collected AND already taxed at the consult that took it (M3, M11), so it comes off
    # the subtotal before anything else - the sitting taxes only the work not yet paid for.
    depositCreditCents: Int!
    # Subtotal minus the deposit. What this charge is actually for.
    netSubtotalCents: Int!
    # The Square_Fee_Offset for the NET subtotal (M5). Zero unless applyFeeOffset was asked for -
    # it is a choice presented before the card is charged, never applied silently.
    feeOffsetCents: Int!
    # Net subtotal + offset. The offset IS taxed, because it is part of the service price (M8).
    taxableCents: Int!
    taxCents: Int!
    tipCents: Int!
    totalCents: Int!
    # Sold untaxed (M6), so unlike a deposit it comes off the TOTAL, after tax.
    giftCardCents: Int!
    # What the card is actually charged. Clamped at zero - a deposit larger than the final sitting
    # bills nothing rather than a negative that would read as owing the client money.
    amountDueCents: Int!
    # 'shop' or 'artist' - whose tax rate and offset these are, and whose Square account this would
    # settle to. The same owner for both, by construction (M8, M9).
    source: String!
    # False when that owner has no usable Square connection. The UI needs to say so before the
    # artist reaches for a card, not after the charge fails.
    canCharge: Boolean!
  }
  # The tax rate and fee offset every charge is computed from, and whose they are.
  #
  # In STORED units - basis points and cents - not percentages and dollars. The UI converts for
  # display; a rate travelling as a float is where 9.4 stops being representable (M8).
  type SquarePricingSettings {
    # 'shop' or 'artist', resolved by the same owner rule as the tax rate itself (M8).
    source: String!
    # The shop's name when source is 'shop', so the panel can say whose these are. Null otherwise.
    ownerName: String
    taxRateBasisPoints: Int!
    squareFeeOffsetCents: Int!
    # False for a shop artist who is not an admin. They see the figures - these apply to every
    # charge they take - but the rate belongs to the shop's location, and two artists in the same
    # room must not bill different ones.
    canEdit: Boolean!
  }
  # The caller's own view of a Square connection. Deliberately exposes only non-secret fields -
  # the encrypted access/refresh tokens never leave the server, exactly as on Shop.
  type SquareConnection {
    # 'shop' or 'artist' - who OWNS the account these sessions charge into. An artist connected to
    # a shop gets 'shop' here even if they personally have never touched Square, because that is
    # where their money goes (DECISIONS.md M8, M9).
    source: String!
    connected: Boolean!
    locationId: String
    connectedAt: DateTime
    # The shop's name when source is 'shop', so the panel can name it instead of saying "your
    # shop". Null for an independent artist.
    ownerName: String
  }
  input UserUpdateInput {
    id: ID!
    email: String!
    firstName: String
    lastName: String
    password: String
    confirmPassword: String
    userType: String
    avatar: String
    role: Int!
    tagColor: String
  }
  type User {
    id: ID!
    # Email is the identity. There was a separate required username field here, auto-derived and never
    # shown to anyone, which was the only key login accepted - so every invited artist could set a
    # password and then had no way in. See models/User.js.
    email: String!
    firstName: String
    lastName: String
    avatar: String
    role: Int!
    accessToken: String!
    userType: String!
    userInfo: UserInfo
    tagColor: String
    # Per-user Firebase custom token, used by the client to sign into Firebase Auth as this
    # specific user (replaces the old shared firebase@inkbooks.net account). Null if the server's
    # Firebase Admin SDK isn't configured yet - see server/utils/firebase-admin.js.
    firebaseToken: String
  }
  type Client implements UserInfo {
    id: ID!
    firstName: String!
    lastName: String!
    email: String!
    phone: String!
    address: String
    city: String
    state: String
    zip: String
    instagram: String
    facebook: String
    avatar: String
    userId: ID!
    user: User
    # Which shops have worked with this person. Plural, and append-only: Client.email is unique
    # platform-wide, so there is one row per person shared across shops, and a single shopId could
    # never describe someone tattooed at two of them. This is one of the two things that make a
    # client "ours" - see models/Client.js and canAccessClient in utils/shop-membership.js.
    shopIds: [ID]
    # Constants.CLIENT_STATUS. Absent means active - the field was added with archiving, so every
    # client predating it is unset. See utils/archiving.js.
    status: Int
    # Everything below powers the client dashboard (client/src/components/clientDashboard).
    # Resolved on demand rather than stored, so nothing has to be kept in sync - see
    # resolvers/index.js's Client field resolvers.
    projects: [Project]
    appointments: [Appointment]
    # SHOP-SIDE notes about the client - allergies, sitting tolerance, healing history. NOT
    # visible to the client themselves: the whole value of a note like "cancels a lot" or
    # "needed a break every 20 minutes" depends on it being a candid internal record rather than
    # a message to the person it's about. ClientDashboard renders this section only in the
    # artist/staff view, and updateClientNotes below refuses a client editing their own.
    notes: [IBNote]
  }
  input ClientInput {
    id: ID!
    firstName: String
    lastName: String
    email: String
    phone: String
    address: String
    city: String
    state: String
    zip: String
    instagram: String
    facebook: String
    avatar: String
    userId: ID
    status: Int
  }
  type Staff implements UserInfo {
    id: ID!
    firstName: String!
    lastName: String!
    email: String!
    phone: String!
    address: String
    city: String
    state: String
    zip: String
    instagram: String
    facebook: String
    avatar: String
    userId: ID!
    user: User
    status: Int!
    title: String
    shopId: ID!
    shop: Shop
  }
  input StaffInput {
    id: ID!
    firstName: String
    lastName: String
    email: String
    phone: String
    address: String
    city: String
    state: String
    zip: String
    instagram: String
    facebook: String
    avatar: String
    userId: ID!
    status: Int!
    title: String
    shopId: ID!
  }
  type IBImage {
    id: ID!
    url: String!
    title: String
    uploadedByDisplayName: String
    userId: ID!
    userInfo: User
    avatar: String
	  tags: [String]
    createdAt: DateTime
    updatedAt: DateTime
  }
  input IBImageInput {
    id: ID!
    url: String!
    title: String
    uploadedByDisplayName: String
    userId: ID!
    avatar: String
	  tags: [String]
    createdAt: DateTime
    updatedAt: DateTime
  }
  type IBNote {
    id: ID!
    author: String!
    note: String!
    createdAt: DateTime
    updatedAt: DateTime
  }
  input IBNoteInput {
    id: ID!
    author: String!
    note: String!
    createdAt: DateTime
    updatedAt: DateTime
  }
  # Minimal slice of the tenancy model - see models/ArtistShopConnection.js and
  # PRODUCTION_ROADMAP.md's "Artist-centric tenancy model" section. No invite-link tokens, shop
  # directory, or billing-tier fields yet - this exists to authorize Appointment.shopId.
  type ArtistShopConnection {
    id: ID!
    artistId: ID!
    shopId: ID!
    status: String!
    # The INTERVAL. A membership is a period, not a flag - endedAt null means still here. Both
    # rules that care about when somebody worked where (shop cut by session date, and what a shop
    # can still see after a disconnect) are answered from these, not from status.
    startedAt: DateTime!
    endedAt: DateTime
    # Retained alias of endedAt for callers that predate the interval.
    disconnectedAt: DateTime
    # Which side's rate (shop's or the artist's own) this artist's sessions bill against at this
    # shop - see models/ArtistShopConnection.js's comment for the full reasoning.
    rateSource: String!
    # DEPRECATED as the authority - a rate can change without a reconnect, so a single number here
    # cannot say what applied last March. ShopCutRate holds the effective-dated history. Kept as
    # the fallback for connections that predate it. Null means "use the shop's rate", which is a
    # different thing from 0 ("this artist owes nothing") - see utils/shop-cut.js.
    shopCutPercent: Int
    createdAt: DateTime
    updatedAt: DateTime
  }
  # What an artist owed a shop, and from when. APPEND-ONLY: changing a rate writes a new row and
  # never edits an old one, which is what makes "a rate change applies forward only" a property of
  # the data rather than a rule somebody has to remember. See DECISIONS.md M7.
  type ShopCutRate {
    id: ID!
    artistId: ID!
    shopId: ID!
    # Percentage, e.g. 40 for 40%.
    percent: Int!
    # Inclusive lower bound. The rate in force for a date is the row with the greatest
    # effectiveFrom at or before it. Stored rather than derived from createdAt because they answer
    # different questions - when it started applying, versus when somebody typed it in.
    effectiveFrom: DateTime!
    setByUserId: ID!
    note: String
    createdAt: DateTime!
  }
  # Deliberately narrow - see getPublicArtistProfile in resolvers/bookingRequests.js for why this
  # isn't just the full Artist/User type.
  # Both fields matter to the form: available drives the tick or cross, and reason is what gets
  # shown when it is false. A bare boolean would leave the UI guessing between "taken", "too
  # short" and "that word is reserved" - three different things for the person typing to do next.
  # Six toggles: three categories x the one channel that can be switched off. In-app is never
  # optional - the inbox is also the record, and a preference that silently dropped rows would make
  # "did we tell the shop about that payment" unanswerable.
  #
  # Null means "use the default for my role", NOT off. A missing preference and a deliberate false
  # are different answers, and storing defaults into every account would freeze today's defaults
  # into it forever.
  type NotificationPrefs {
    moneyEmail: Boolean
    scheduleEmail: Boolean
    rosterEmail: Boolean
    messageEmail: Boolean
  }
  input NotificationPrefsInput {
    moneyEmail: Boolean
    scheduleEmail: Boolean
    rosterEmail: Boolean
    messageEmail: Boolean
  }
  # What the settings screen needs: the raw preferences, plus the resolved defaults so the UI can
  # show what an untouched toggle is actually doing rather than an ambiguous blank.
  type NotificationSettings {
    prefs: NotificationPrefs!
    # 'immediate' | 'digest' | 'off' per category, after defaults are applied.
    moneyMode: String!
    scheduleMode: String!
    rosterMode: String!
    messageMode: String!
    timezone: String!
    digestHour: Int!
  }
  type BookingSlugAvailability {
    slug: String!
    available: Boolean!
    reason: String
  }
  # One shape for both halves of the notification system.
  #
  # A stored event and a derived condition render identically here on purpose - the person reading
  # an inbox does not care which is which, and the difference is an implementation detail of how the
  # row was produced (see NOTIFICATIONS_DESIGN.md section 2). isCondition is exposed only so the UI
  # can hide read/done controls on rows that have no such state.
  type InboxItem {
    # Stable across refetches. A stored event's own id; for a condition, a key derived from its
    # subject - conditions have no identity, because they are the answer to a question asked just
    # now rather than a thing that exists.
    key: ID!
    type: String!
    category: String!
    subjectType: String
    subjectId: ID
    title: String!
    body: String
    amountCents: Int
    createdAt: DateTime!
    # Null on a condition. A condition disappears when it stops being true, which is a better
    # mechanism than read state and needs no bookkeeping.
    readAt: DateTime
    doneAt: DateTime
    isCondition: Boolean!
  }
  type InboxSummary {
    items: [InboxItem!]!
    # Unread stored events plus every live condition. Conditions always count: a condition that
    # could be dismissed without being fixed would be a worse version of a stored notification.
    unreadCount: Int!
  }
  type PublicArtistProfile {
    id: ID!
    firstName: String!
    lastName: String!
    avatar: String
    bookingSlug: String
  }
  # See PRODUCTION_ROADMAP.md's "Booking request & guest correspondence" section for the full
  # design. This is the structured intake content only - back-and-forth correspondence after
  # submission lives in the linked Conversation's Messages, not duplicated here.
  type BookingRequest {
    id: ID!
    artistId: ID!
    clientId: ID!
    conversationId: ID!
    client: Client
    conversation: Conversation
    status: String!
    description: String!
    # Plain URL strings, not [IBImage] like Project.referenceImages - IBImage requires a real
    # userId, but a guest submitting this form has no User/Client record yet (that's only
    # created inside the createBookingRequest resolver itself). Uploaded ahead of time via the
    # separate POST /booking-uploads route (routes/bookingUploads.js), which returns plain URLs
    # for exactly this reason. Project.bodyImages already establishes [String] as a valid
    # pattern in this schema, so this isn't a new shape.
    referenceImages: [String]
    placement: String
    size: String
    budget: String
    availability: String
    isCoverUp: Boolean
    howHeard: String
    resultingAppointmentId: ID
    # Null until converted - see resolvers/index.js's BookingRequest.resultingAppointment.
    resultingAppointment: Appointment
    # 'public_form' (a real guest submission) vs 'artist_created' (the artist scheduled this
    # directly from their own calendar - see BookingRequest.js's own comment). getBookingRequests
    # only ever returns 'public_form' ones - this field exists mainly for completeness/debugging,
    # not because the client needs to branch on it anywhere today.
    source: String
    createdAt: DateTime
    updatedAt: DateTime
  }
  input BookingRequestInput {
    artistId: ID!
    firstName: String!
    lastName: String!
    email: String!
    phone: String
    description: String!
    referenceImages: [String]
    placement: String
    size: String
    budget: String
    availability: String
    isCoverUp: Boolean
    howHeard: String
    # Defaults to 'public_form' server-side if omitted - see BookingRequest.js's own comment.
    # AppointmentWizard.jsx is the one caller that sends 'artist_created'.
    source: String
  }
  type Project {
    id: ID!
    title: String!
    description: String!
    placement: String
    size: String
    palette: String
    artistId: ID!
    artist: Artist
    clientId: ID!
    client: Client
    conversation: Conversation
    referenceImages: [IBImage]
    bodyImages: [String]
    designImages: [IBImage]
    materialsUsed: [String]
    notes: [IBNote]
    tags: [String]
    status: String!
    bookingRequestId: ID
    # Deposits taken at this project's consult. Resolved rather than stored, so they can't drift
    # from the appointment records that actually hold them - see resolvers/index.js.
    deposits: [Appointment]
    depositCollectedCents: Int
    # Still spendable against a session. Distinct from the total collected: a deposit already
    # credited is gone, and showing only the total would imply money still available that isn't.
    depositAvailableCents: Int
    # The model has always had Mongoose timestamps enabled (see models/Project.js) - these were
    # simply never exposed. The client dashboard shows when a project was started.
    createdAt: DateTime
    updatedAt: DateTime
  }
  input ProjectInput {
    id: ID!
    title: String!
    description: String!
    placement: String
    size: String
    palette: String
    artistId: ID!
    clientId: ID!
    referenceImages: [IBImageInput]
    bodyImages: [String]
    designImages: [IBImageInput]
    materialsUsed: [String]
    notes: [IBNoteInput]
    tags: [String]
    status: String!
  }
  # Public signup. RegisterInput is gone with it - it carried role and userType as REQUIRED
  # fields, which the resolver had to pointedly ignore. A public input type that asks for a
  # permission level is a trap even when the server refuses to read it, because the next person to
  # touch the resolver sees a field sitting there looking usable.
  input RegisterAccountInput {
    # 'shop' or 'artist'. The only thing a caller says about who they are; role and userType are
    # derived from it server-side. Validated against the enum in utils/validation.js.
    accountType: String!
    email: String!
    firstName: String!
    lastName: String!
    password: String!
    confirmPassword: String!
    # Required when accountType is 'shop', meaningless otherwise.
    shopName: String
    # The public booking handle - /book/<slug>. Offered on BOTH paths: a shop owner is an artist
    # too (see registerAccount), so they need one as much as an independent artist does.
    #
    # Optional. An account created without one still has a working /book/<id> page and can choose
    # a link later from Settings - nobody should be blocked at signup on inventing a handle.
    bookingSlug: String
  }
  input AppointmentInput {
    id: ID
    appointmentDate: DateTime!
    # How long this runs, in minutes. Omit it and the server picks by type - 45 for a consult, 180
    # for a session (see models/Appointment.js). Minutes rather than an end time, because a
    # duration survives the start being moved and an end time silently doesn't.
    durationMinutes: Int
    projectId: ID
    userId: ID
    shopId: ID
    title: String
    description: String
    # All money is integer CENTS - see server/utils/money.js. These were previously total/tip,
    # in whole dollars, which could not represent $89.50 at all - let alone tax or fees.
    # subtotalCents is the tattoo work itself and the only figure the shop cut applies to.
    subtotalCents: Int
    taxCents: Int
    feeCents: Int
    tipCents: Int
    totalCents: Int
    shopCutStatus: String
    # Deliberately NOT accepted as input - the shop cut is computed server-side from
    # subtotalCents and the configured percentage (see utils/shop-cut.js), never supplied by a
    # client. The old shopCutAmount was in this input type and, in practice, nothing ever sent it.
    appointmentType: String
    appointmentStatus: String
    createdAt: DateTime
    updatedAt: DateTime
    # Deliberately NOT timerStatus/timerStartedAt/accumulatedSeconds - see models/Appointment.js's
    # comment on why those are only ever changed via the dedicated startSessionTimer/
    # stopSessionTimer/resetSessionTimer mutations, never through this generic update input.
    #
    # Deposit fields are excluded for the same reason, and more firmly: a deposit's single-use
    # guarantee depends on it only ever changing through recordDeposit/applyDeposit, where the
    # status transition is atomic. Exposing depositStatus on a general-purpose update input would
    # let a client flip an applied deposit back to available and spend it twice.
    sessionNotes: String
  }

  type Appointment {
    id: ID!
    appointmentDate: DateTime!
    durationMinutes: Int!
    # Start plus duration, computed on read and never stored. A stored end date would be a second
    # copy of the same fact, free to disagree the moment the start is moved - see the virtual in
    # models/Appointment.js.
    appointmentEnd: DateTime!
    projectId: ID
    project: Project
    # Set only when this Appointment came from convertBookingRequest (consult or session) - see
    # models/Appointment.js's own comment. Lets a consult (no Project of its own) surface its
    # original intake details and be promoted to a session from the client.
    bookingRequestId: ID
    bookingRequest: BookingRequest
    # Was ID! - broke serialization for independent artists (no shop, so no shopId at all).
    # models/Appointment.js's Mongoose schema never required this; the GraphQL type just hadn't
    # been fixed to match until now.
    shopId: ID
    shop: Shop
    userId: ID
    user: User
    title: String
    description: String
    # Integer CENTS - see server/utils/money.js.
    subtotalCents: Int
    taxCents: Int
    feeCents: Int
    tipCents: Int
    totalCents: Int
    # --- Deposits. See models/Appointment.js. ---
    # Recorded on the appointment that COLLECTED the deposit (normally the consult).
    depositCents: Int
    depositStatus: String
    depositPaymentMethod: String
    depositSquarePaymentId: String
    depositCollectedAt: DateTime
    depositAppliedToAppointmentId: ID
    depositAppliedAt: DateTime
    # The other side: a credit applied TO this appointment, reducing what the client owes on it.
    # The shop cut is computed on the subtotal AFTER this is deducted - see utils/shop-cut.js.
    depositCreditCents: Int
    depositCreditFromAppointmentId: ID
    shopCutStatus: String!
    # Shop-cut ledger fields - see PRODUCTION_ROADMAP.md's "Shop-cut ledger" section.
    # shopCutCents is computed from subtotalCents only: never tips, tax or processing fees.
    shopCutCents: Int
    shopCutPercentApplied: Int
    shopCutPaymentMethod: String
    shopCutSquareInvoiceId: String
    shopCutMarkedPaidBy: ID
    shopCutMarkedPaidAt: DateTime
    shopCutConfirmedBy: ID
    shopCutConfirmedAt: DateTime
    appointmentType: String!
    appointmentStatus: String!
    createdAt: DateTime
    updatedAt: DateTime
    # Session timer + notes - see models/Appointment.js's comment. timerStartedAt is only
    # meaningful while timerStatus is 'running'; the live elapsed total while running is
    # accumulatedSeconds + (now - timerStartedAt), computed client-side on read, not stored.
    timerStatus: String
    timerStartedAt: DateTime
    accumulatedSeconds: Int
    sessionNotes: String
  }
  # Returned by createShopCutInvoice - the invoiceUrl is surfaced directly so the client can show
  # a "pay now" link immediately without waiting on Square's own email/SMS delivery (see
  # utils/square.js's createAndPublishShopCutInvoice).
  type ShopCutInvoiceResult {
    appointment: Appointment!
    invoiceUrl: String!
  }
  # Batch version of ShopCutInvoiceResult above - one invoice covering several completed
  # sessions' combined shop cut (see mutations/shopCutPayments.js's createBatchShopCutInvoice
  # and the artist-dashboard payout list that calls it).
  type BatchShopCutInvoiceResult {
    appointments: [Appointment!]!
    invoiceUrl: String!
  }
  # --- Dashboard analytics -------------------------------------------------------------------
  # Computed server-side (see utils/analytics.js) rather than by summing rows in the browser.
  # ArtistPerformancePanel used to do the latter, with a standing note that it should move here as
  # data grew; a shop-wide version is that volume times every artist at the shop, so client-side
  # would have meant shipping every artist's full financial history to whoever opened the page.
  #
  # MONEY FIELDS ARE NULLABLE ON PURPOSE. They resolve to null for a caller below SHOP_ADMIN -
  # Staff get the activity figures and nothing else. That distinction is enforced in the resolver,
  # not in the UI, so hiding a card client-side is presentation rather than the boundary. A
  # non-null type here would have forced the opposite design: either Staff get the money or they
  # get an error, with no room for "some of this, not that".
  type ArtistAnalyticsRow {
    userId: ID!
    # The Artist DOCUMENT's id, not the User's - /artist/:artistId routes on the former. Resolved
    # server-side so the client can't link with the wrong one. Null for an artist with no Artist
    # record, which shouldn't happen but shouldn't produce a broken link if it does.
    artistId: ID
    user: User
    revenueCents: Int
    tipsCents: Int
    shopCutEarnedCents: Int
    shopCutOutstandingCents: Int
    completedSessionCount: Int!
    consultCount: Int!
    appointmentCount: Int!
  }
  type Analytics {
    # Echoed back so a client can tell which window a given payload describes - with a range
    # picker, a slow response for one range can land after the user has already picked another.
    start: DateTime!
    end: DateTime!

    # Money - null for anyone below SHOP_ADMIN on the shop-wide query.
    # revenueCents is totalCents on COMPLETED appointments only: a scheduled session has a price
    # but nothing has changed hands yet.
    revenueCents: Int
    subtotalCents: Int
    taxCents: Int
    feeCents: Int
    tipsCents: Int
    # Averaged over appointments that actually received a tip, not all of them - see
    # utils/analytics.js.
    averageTipCents: Int
    tippedCount: Int
    # Three buckets rather than one total, because they need three different responses: money the
    # shop has, money it is owed, and money an artist claims to have paid that nobody has
    # confirmed. See models/Appointment.js's shopCutStatus lifecycle.
    shopCutEarnedCents: Int
    shopCutOutstandingCents: Int
    shopCutAwaitingConfirmationCents: Int
    # Deposits. Collected counts toward revenue on the day taken and is already INSIDE
    # revenueCents - this is a breakdown of that figure, not an addition to it. Outstanding is a
    # liability: money held against work not yet done.
    depositsCollectedCents: Int
    depositsAppliedCents: Int
    depositsOutstandingCents: Int

    # Activity - always returned, whatever the caller's role.
    completedSessionCount: Int!
    consultCount: Int!
    appointmentCount: Int!
    # upcomingCount and activeProjectCount are NOT range-scoped: both mean "as of right now".
    # Range-scoping them would make either read as zero for a historical window, which looks like
    # missing data rather than a definition.
    upcomingCount: Int!
    activeProjectCount: Int!
    newProjectCount: Int!
    totalClientCount: Int!
    newClientCount: Int!
    artistCount: Int!

    # Empty on the single-artist query, where it would only restate the totals as a one-row table.
    artists: [ArtistAnalyticsRow!]!
  }
  # What the set-password page can learn about a link before anyone types into the form.
  # Deliberately carries no email and no user id - a guessed token must not become a way to read
  # an account. See resolvers/passwords.js.
  type PasswordTokenStatus {
    valid: Boolean!
    purpose: String
    firstName: String
  }

  # --- Account creation (the three wizards) ---------------------------------------------------
  # Each creates a User alongside the profile record. Nothing did that before: createArtist and
  # createStaff took a userId and expected one to exist, and no UI ever created one.
  input CreateArtistAccountInput {
    firstName: String!
    lastName: String!
    email: String!
    # Optional. An artist created without one still has a working /book/<id> page and can choose
    # a link later from Settings - a shop admin shouldn't be blocked on inventing a handle for
    # somebody else. See utils/booking-slug.js.
    bookingSlug: String
    title: String
    phone: String
    instagram: String
    facebook: String
    hourlyRate: Int
    shopId: ID
  }
  input CreateStaffAccountInput {
    firstName: String!
    lastName: String!
    email: String!
    title: String
    phone: String
    instagram: String
    facebook: String
    # OPTIONAL at the schema level, and still required in effect - the server falls back to the
    # creating admin's own shop and refuses if there isn't one (see resolveShopIdForNewAccount in
    # mutations/accounts.js).
    #
    # It was ID!, which meant a client with an empty cached shop id failed GraphQL VALIDATION -
    # "Variable $input got invalid value; shopId of required type ID! was not provided" - before the
    # resolver ever ran. That's an unactionable error for a shop admin adding a receptionist, and it
    # made the answer the server already knows unreachable.
    shopId: ID
  }
  input CreateClientAccountInput {
    firstName: String!
    lastName: String!
    email: String!
    phone: String
    address: String
    city: String
    state: String
    zip: String
    instagram: String
    facebook: String
  }
  # inviteLink is returned so the wizard can display it. utils/email.js no-ops when the provider
  # isn't configured, so an invite can "succeed" with nothing actually sent - handing the link
  # back is the difference between an admin who can paste it into a text message and one left
  # wondering why the new hire never heard anything.
  type ArtistAccountResult {
    artist: Artist!
    inviteLink: String!
  }
  type StaffAccountResult {
    staff: Staff!
    inviteLink: String!
  }
  # No invite for clients - see mutations/accounts.js. isNewAccount is false when the email
  # already had an account (they booked online before), so the wizard can say the record was
  # updated rather than implying it created one.
  # What a redaction actually touched. Returned so the shop can record that the request was
  # carried out, which is itself usually a compliance requirement.
  type RedactionResult {
    clientId: ID!
    userRedacted: Boolean!
    projectsAffected: Int!
    appointmentsRetitled: Int!
  }

  type ClientAccountResult {
    client: Client!
    isNewAccount: Boolean!
  }

  # ---- Pagination -------------------------------------------------------------------------
  #
  # Offset, not cursors. These are directories: people want a total, want to jump to a page, and
  # the sort is stable enough that offset drift doesn't matter. Cursors suit feeds - forward-only,
  # shifting under you, nobody asking "how many". See utils/pagination.js.
  #
  # Omitting the page argument gives a bounded default rather than everything. Before this, no list query had
  # any bound at all: getAppointmentsByShop returned a shop's entire appointment history so the
  # browser could filter it down to the thirty days on screen.
  input PageInput {
    limit: Int
    offset: Int
  }

  type PageInfo {
    totalCount: Int!
    hasMore: Boolean!
    # Echoed back because they may not be what was asked for - an over-large limit is clamped to
    # utils/pagination.js's MAX_LIMIT, and a caller that doesn't know that would page wrongly.
    limit: Int!
    offset: Int!
  }

  type ClientPage {
    items: [Client!]!
    pageInfo: PageInfo!
  }
  type ArtistPage {
    items: [Artist!]!
    pageInfo: PageInfo!
  }
  type StaffPage {
    items: [Staff!]!
    pageInfo: PageInfo!
  }
  type ProjectPage {
    items: [Project!]!
    pageInfo: PageInfo!
  }
  type AppointmentPage {
    items: [Appointment!]!
    pageInfo: PageInfo!
  }
  type BookingRequestPage {
    items: [BookingRequest!]!
    pageInfo: PageInfo!
  }

  # What an appointment list is actually being asked for. One filter rather than a query per
  # screen: the calendar wants a month, the dashboard wants "upcoming" and "recently completed",
  # the payout list wants "completed and unpaid". All of those were the SAME fetch-everything call
  # with four different client-side filters over it - which is why an artist's dashboard used to
  # download their entire career to render two lists of five.
  input AppointmentFilter {
    # Half-open [from, to) on appointmentDate, matching utils/analytics.js's convention.
    from: DateTime
    to: DateTime
    appointmentStatus: String
    shopCutStatus: String
    # true = appointmentDate >= now. Separate from the from/to bounds because "upcoming" has to mean "ahead of
    # right now" at the moment the query runs, not at the moment the client rendered.
    upcomingOnly: Boolean
  }

  type Query {
    ######### Appointments ############

    # The shop calendar. Was unbounded: it returned every appointment the shop had ever had so the
    # browser could filter down to the thirty days on screen (see ibCalendar/Day.jsx). A shop doing
    # 300 sessions a year was shipping thousands of rows, each carrying totals, tips and shop-cut
    # amounts, to draw one month.
    getAppointmentsByShop(shopId: ID!, filter: AppointmentFilter, page: PageInput): AppointmentPage!
    # An artist's own appointments. Same problem as the shop calendar and then some: the dashboard
    # fetched an artist's entire career and ran four separate client-side passes over it - upcoming,
    # recently completed, payout candidates, plus the calendar's own filter. Those are four
    # questions, so the filter takes their shapes rather than the caller slicing an array.
    getAppointmentsByArtist(userId: ID!, filter: AppointmentFilter, page: PageInput): AppointmentPage!
    # Every shop cut this artist still owes. DELIBERATELY UNPAGINATED, unlike everything else here.
    #
    # The task is "settle what I owe", not "browse my history": the shop admin selects rows or
    # invoices the lot, and a batch action over a paged list is ambiguous in a way that costs money
    # - does "invoice all" mean this page or everything? The set is also self-limiting, since
    # settling a row removes it. If it ever grows unreasonable that's a symptom worth seeing, not a
    # scrolling problem to hide.
    getShopCutPayoutCandidates(userId: ID!): [Appointment!]!
    getAppointment(appointmentId: ID!): Appointment
    # The charge total, computed server-side, BEFORE the card is taken. applyFeeOffset and
    # tipCents are the only two inputs because they are the only two the caller legitimately
    # knows - see utils/charge-quote.js.
    getChargeQuote(appointmentId: ID!, applyFeeOffset: Boolean, tipCents: Int): ChargeQuote!
    getAppointmentsByProject(projectId: ID!): [Appointment]

    ######### Shop-cut ledger ###########
    # See PRODUCTION_ROADMAP.md's "Shop-cut ledger" section.

    getSquareAuthorizationUrl(shopId: ID!): String!
    # The same handshake for an independent artist, who has no shop to connect one against.
    # Takes no argument on purpose: it can only ever act for the caller. See DECISIONS.md M9.
    getMySquareAuthorizationUrl: String!
    # WHERE THE CALLER'S SESSIONS ACTUALLY CHARGE - resolved through the same owner rule as their
    # tax rate (M8/M9), not just "does this artist have a row". An artist at a shop charges into
    # the SHOP's account, so the source field is what the settings panel needs in order to say
    # something true rather than showing a connect button that would build a dead connection.
    getMySquareConnection: SquareConnection!
    # The tax rate and offset in force for the caller, and whether they may change them. Read by
    # the settings panel; the same values routes/squarePayments.js computes every charge from.
    getMySquarePricingSettings: SquarePricingSettings!
    getPendingShopCutConfirmations(shopId: ID!): [Appointment]

    ######### Artists ###########

    # includeArchived: archived people have to stay reachable or unarchiving them is impossible -
    # there'd be no way to find who you wanted back. Hidden by default, askable for. See
    # utils/archiving.js.
    getArtists(includeArchived: Boolean, page: PageInput): ArtistPage!
    getArtist(artistId: ID!): Artist
    getArtistsByShop(shopId: ID!): [Artist]

    ######### Shops ###########

    getShops:[Shop]
    getShop(shopId: ID!): Shop

    ######### Staff ###########
    
    getStaff(includeArchived: Boolean, page: PageInput): StaffPage!
    getOneStaff(staffId: ID!): Staff
    
    ######### Clients ###########
    
    getClients(includeArchived: Boolean, page: PageInput): ClientPage!
    getClient(clientId: ID!): Client
    # "Do we already have this person?" - by email, for the booking wizard.
    #
    # Exists because the wizard used to answer this by scanning the client list it had already
    # fetched. That worked while the list was everything; once getClients paged, it could only
    # match the first page - and a MISS is not harmless there. The wizard would ask for a name,
    # createClientAccount would find the existing record by email anyway, and the typed name would
    # overwrite the real one.
    #
    # Scoped like getClient: null for an email belonging to another shop's client, rather than
    # leaking their name and phone to whoever can guess an address. Creating them is still correct
    # in that case - createClientAccount links the existing person to this shop.
    findClientByEmail(email: String!): Client
    
    ######### Users ###########
    
    getUser(userId: ID!): User
    getUserTagColors(shopId: ID!): [User]
    
    ######### Projects ###########
    
    getProjects(page: PageInput): ProjectPage!
    getProjectsByArtist(artistId: ID!): [Project]
    getProject(projectId: ID!): Project

    ######### Conversations ###########

    # Total unread across every conversation the caller is in - what the sidebar badge shows.
    # Separate from Conversation.unreadCount so the badge, which is mounted on every page, is one
    # cheap aggregation rather than a fetch of every thread the person has.
    # Everything wanting the caller's attention - stored events and live conditions, merged.
    getInbox(includeRead: Boolean): InboxSummary!
    getNotificationSettings: NotificationSettings!
    getUnreadMessageCount: Int!
    # getUnreadBookingRequestCount is gone. It counted unread MESSAGES in booking-request threads,
    # which is the wrong question for that nav item and produced a badge that cleared as soon as you
    # looked at a request you still hadn't decided on - and that read zero for a brand new request,
    # since createBookingRequest writes no Message at all. Replaced by
    # getPendingBookingRequestCount (see the Booking Requests section below). A reply on a request
    # that HAS been booked still counts, through getUnreadMessageCount, because booking moves the
    # thread into Messages.
    getConversation(conversationId: ID!): Conversation
    getConversationsByShopId(shopId: ID!): [Conversation!]
    getProjectConversation(artistId: ID!, clientId: ID!): Conversation
    getConversationsByMemberId(memberId: ID!): [Conversation]

    ######### Messages ###########

    getMessage(messageId: ID!): Message
    getMessagesByConversationId(conversationId: ID!): [Message!]

    ######### Booking Requests ###########

    # Public, unauthenticated - see resolvers/bookingRequests.js for why this returns a narrow
    # PublicArtistProfile rather than the full Artist/User type.
    # Takes EITHER a bookingSlug or a raw artist ObjectId, so /book/maya-chen and the older
    # /book/<objectId> links both resolve. See resolvers/bookingRequests.js.
    getPublicArtistProfile(artistId: ID!): PublicArtistProfile
    # Live "is this link free" check for the slug field, so an artist finds out while typing
    # rather than on submit. Public on purpose - it is the same information /book/<slug> already
    # gives away by returning a profile or not, so gating it would protect nothing while making
    # the signup form worse. Rate-limited (see resolvers/artists.js) so it cannot be walked to
    # enumerate every artist on the platform at speed.
    checkBookingSlugAvailable(slug: String!): BookingSlugAvailability!
    # Artist-only (withAuth) - the artist's own dashboard list, not the guest-facing side.
    # statuses omitted means the OPEN ones - pending, consult_booked, session_booked. Requests that
    # ended (declined, not_booked) are not loaded unless asked for by name, because they accumulate
    # forever and an inbox that grows without bound stops being an inbox.
    #
    # A list rather than a boolean: "open", "closed" and "everything" are all just different lists,
    # and a flag would need a second flag the first time somebody wants one specific status.
    # Paged. The pending queue is short by nature, but the closed filter is an archive that only
    # ever grows - every request an artist has ever turned away or lost, forever - and an unbounded
    # query over it would download a career to render a screenful.
    # Rate history for one artist at one shop, newest first. Readable by the artist themselves and
    # by a shop admin there - an artist must be able to see what they are being charged.
    getShopCutRates(artistId: ID!, shopId: ID!): [ShopCutRate!]!
    getBookingRequests(artistId: ID!, statuses: [String!], page: PageInput): BookingRequestPage!
    # The nav badge: how many requests the CALLER still owes an answer on. Same filter as
    # getBookingRequests with no statuses passed - literally the same function, see
    # utils/booking-inbox.js - so the number on the nav item and the rows on the page it leads to
    # cannot disagree. Only changes when a request's STATUS changes, never on read.
    getPendingBookingRequestCount: Int!
    getBookingRequest(bookingRequestId: ID!): BookingRequest
    # Public, token-gated (not withAuth) - resolves a guest's magic link to their own request.
    # See utils/guest-auth.js.
    getBookingRequestByToken(token: String!): BookingRequest

    ######### Artist-Shop Connections ###########
    # withAuth, ownership-checked - see resolvers/artistShopConnections.js. This is the minimal
    # slice of the tenancy model needed to authorize Appointment.shopId - not the full
    # invite-link/shop-directory lifecycle from PRODUCTION_ROADMAP.md.
    getArtistShopConnections(artistId: ID!): [ArtistShopConnection]
    getShopArtistConnections(shopId: ID!): [ArtistShopConnection]

    # Dashboard analytics. start is inclusive and end is exclusive, so consecutive ranges neither
    # overlap nor drop an appointment sitting exactly on a boundary.
    # Unspent deposits belonging to the same CLIENT as this appointment - see
    # resolvers/deposits.js on why it's scoped by client rather than by project.
    getAvailableDeposits(appointmentId: ID!): [Appointment]

    # Public - the caller is someone who can't log in. See resolvers/passwords.js.
    inspectPasswordToken(token: String!): PasswordTokenStatus!

    getShopAnalytics(shopId: ID!, start: DateTime!, end: DateTime!): Analytics
    getArtistAnalytics(userId: ID!, start: DateTime!, end: DateTime!): Analytics
  }
  type Mutation {
    # Records a new shop cut rate for an artist, from a date forward. APPEND-ONLY - this never
    # edits an existing rate, so past work keeps the rate that applied when it was performed.
    #
    # SHOP ADMIN ONLY, and deliberately not the artist: this is what the artist OWES the shop, and
    # a party setting the number they owe is not a rate, it is a suggestion. The artist can read
    # the history (getShopCutRates) - being charged a percentage you cannot see is worse.
    #
    # effectiveFrom defaults to now. Back-dating is allowed because renegotiating to the start of
    # the month is ordinary; it is a different fact from when the row was typed in (createdAt).
    setShopCutRate(
      artistId: ID!
      shopId: ID!
      percent: Int!
      effectiveFrom: DateTime
      note: String
    ): ShopCutRate!
    # Archiving is what "remove this person" means. It sets a status and touches nothing else:
    # their projects, appointments and the money on those appointments are untouched, still count
    # toward revenue, and still render on the calendar. What changes is that they stop appearing
    # in the directories and pickers. See utils/archiving.js.
    archiveArtist(artistId: ID!): Artist
    unarchiveArtist(artistId: ID!): Artist
    archiveStaff(staffId: ID!): Staff
    unarchiveStaff(staffId: ID!): Staff
    archiveClient(clientId: ID!): Client
    # Erasure request (GDPR/CCPA): overwrites who this person was, keeps everything transacted.
    # IRREVERSIBLE, and deliberately has no button in the UI - see mutations/clients.js and
    # utils/redaction.js, including what it does NOT erase and why that scope is a legal call.
    redactClient(clientId: ID!): RedactionResult
    unarchiveClient(clientId: ID!): Client

    # deleteAppointment is the only surviving delete* mutation, and it now refuses anything
    # carrying money or a completed record - see mutations/appointments.js. It stays because two
    # real buttons call it (UpdateEventDialog.jsx, SessionDetail.jsx); removing an empty
    # scheduled slot is a legitimate thing to want.
    deleteAppointment(appointmentId: ID): String
    #
    # The other seven were removed, not re-gated. Nothing in the client called any of them
    # (grepped), and each one silently corrupted the records around it: Project.client is
    # nullable, so a deleted Client left every project pointing at nothing without erroring;
    # deleting an Artist/Staff/Client row left the User row behind, producing a login with a role
    # and no profile - the exact bug that made the old platformadmin account unable to log in;
    # and appointments carry money, shop-cut ledger state and Square invoice ids that stop
    # reconciling once the person behind them is gone. Records need to survive for audit anyway.
    #
    # Removing someone is archiving - see archiveArtist/archiveStaff/archiveClient below.
    # Erasure requests (GDPR/CCPA) are a separate future action that redacts PII in place and
    # keeps the financial row, since tax retention obligations run the other way.
    ######### Appointments ############
    createAppointment(appointmentInput: AppointmentInput): Appointment
    updateAppointment(appointmentInput: AppointmentInput): Appointment
    # Session timer controls - see models/Appointment.js's comment on why these are separate,
    # dedicated mutations rather than fields on the generic updateAppointment/AppointmentInput.
    # All three: Admin/SHOP_ADMIN-or-better, or the appointment's own artist - same ownership
    # shape as updateAppointment/deleteAppointment above.
    startSessionTimer(appointmentId: ID!): Appointment!
    stopSessionTimer(appointmentId: ID!): Appointment!
    resetSessionTimer(appointmentId: ID!): Appointment!

    ######### Artist-Shop Connections ###########
    # An artist works at one shop at a time, so connecting to a new one ends the connection to
    # the old one. When there is an old one, this refuses unless confirmTransfer is true, and the
    # refusal carries the name of the shop being left in extensions.transfer so the client can
    # say which one before asking. Safe by default: a caller that knows nothing about the flag can
    # never silently move an artist off their shop.
    connectArtistToShop(artistId: ID!, shopId: ID!, confirmTransfer: Boolean): ArtistShopConnection!
    disconnectArtistFromShop(artistId: ID!, shopId: ID!): ArtistShopConnection!
    setArtistShopRateSource(artistId: ID!, shopId: ID!, rateSource: String!): ArtistShopConnection!

    ######### Users ###########

    # Public. Creates a shop (Shop + admin + artist profile + connection) or an independent
    # artist. Clients are NOT self-registerable: they already get accounts from the booking flow,
    # and a client signing up cold lands on a dashboard with nothing on it.
    registerAccount(input: RegisterAccountInput!): User!
    login(email: String!, password: String!): User!
    updateUser(user: UserUpdateInput): User!
    # Renamed from forgotPassword: this now requires an authenticated session and the caller's
    # current password. A true logged-out "forgot password" flow needs an email-based reset
    # token and isn't implemented yet (see PRODUCTION_ROADMAP.md Phase 1, item 1).
    changePassword(currentPassword: String!, newPassword: String!): User!
    # Both public, both for someone who cannot log in - that's the point of them.
    #
    # requestPasswordReset ALWAYS returns true, whether or not the address belongs to an account.
    # Anything else makes it an oracle for "does this person have an account here", which for a
    # shop's client list is a real question about real people. See mutations/passwords.js.
    requestPasswordReset(email: String!): Boolean!
    # Redeems an invite or reset token. Returns a boolean rather than a session: setting a
    # password isn't proof of intent to log in, and auto-authenticating whoever redeems a link
    # would make an intercepted email grant a session outright rather than a password the real
    # owner can immediately reset.
    setPasswordWithToken(token: String!, newPassword: String!): Boolean!

    ######### Account creation ############
    createArtistAccount(input: CreateArtistAccountInput!): ArtistAccountResult!
    createStaffAccount(input: CreateStaffAccountInput!): StaffAccountResult!
    createClientAccount(input: CreateClientAccountInput!): ClientAccountResult!

    ######### Artists ###########

    createArtist(
      firstName: String!
      lastName: String!
      email: String!
      title: String!
      phone: String!
      address: String!
      city: String!
      state: String!
      zip: String!
      instagram: String!
      facebook: String!
      avatar: String!
      startDate: String!
      endDate: String
      hourlyRate: Int
      shopId: ID!
      userId: ID!
      status: Int
    ): Artist!
    updateArtist(artist: ArtistInput): Artist
    # Self-service - see mutations/artists.js's comment on why this is separate from updateArtist
    # (which is SHOP_ADMIN-or-better only, so a plain artist could never call it on themselves).
    # Self-service: an artist setting their own public booking link. Pass an empty string to
    # remove it (their /book/<id> page still works). Separate from updateArtist, which is
    # SHOP_ADMIN-gated - see mutations/artists.js.
    updateMyBookingSlug(slug: String!): Artist!
    updateArtistRateSettings(hourlyRate: Int, flatRate: Int, billingType: String!): Artist!

    ######### Shops ###########

    createShop(
      name: String!
      email: String!
      phone: String
      address: String
      city: String
      state: String
      zip: String
      instagram: String
      facebook: String
      logo: String
      website: String
      shopMinimum: Int
      hourlyRate: Int
      billingType: Int
      status: Int
    ): Shop!
    updateShop(shop: ShopInput): Shop
    disconnectShopSquare(shopId: ID!): Shop!
    # The artist's own account, for an artist who owns one. Refuses when a shop holds the
    # connection - it is not theirs to disconnect. See DECISIONS.md M9.
    disconnectMySquare: SquareConnection!
    # Writes to whichever owner M8 resolves - the shop when connected, the artist when not. The
    # owner is not an argument: it already has one answer, and a supplied one could disagree with
    # it. Values are in STORED units, basis points and cents.
    updateSquarePricingSettings(
      taxRateBasisPoints: Int!
      squareFeeOffsetCents: Int!
    ): SquarePricingSettings!

    ######### Shop-cut ledger ###########
    # See PRODUCTION_ROADMAP.md's "Shop-cut ledger" section for the full design: Square Invoices
    # for the automated path (InkBooks never touches the money), a manual mark-paid/confirm
    # dual-control path for cash or other off-platform payment.
    createShopCutInvoice(appointmentId: ID!, paymentMethod: String): ShopCutInvoiceResult!
    createBatchShopCutInvoice(appointmentIds: [ID!]!, paymentMethod: String): BatchShopCutInvoiceResult!
    markShopCutPaidManually(appointmentId: ID!): Appointment!
    confirmShopCutPaid(appointmentId: ID!): Appointment!

    ######### Staff ###########

    createStaff(
      firstName: String!
      lastName: String!
      email: String!
      phone: String!
      address: String!
      city: String!
      state: String!
      zip: String!
      instagram: String!
      facebook: String!
      avatar: String!
      userId: ID!
      status: Int!
      # Was missing entirely - resolvers/staff.js's createStaff already destructures both title
      # and shopId (and models/Staff.js's shopId is required: true), but neither was ever
      # exposed as a mutation argument here. That meant this mutation could never actually
      # succeed when called for real: shopId always arrived as undefined and Mongoose's
      # required-field validation rejected every attempt. Found while writing integration tests
      # for the Staff CRUD surface - see test/integration/crud.test.js.
      title: String
      shopId: ID!
    ): Staff!
    updateStaff(staff: StaffInput): Staff

    ######### Clients ###########

    createClient(
      firstName: String!
      lastName: String!
      email: String!
      phone: String!
      address: String!
      city: String!
      state: String!
      zip: String!
      instagram: String!
      facebook: String!
      avatar: String!
      userId: ID!
    ): Client!
    updateClient(client: ClientInput): Client

    ######### Projects ###########

    createProject(
      title: String!
      description: String!
      placement: String
      size: String
      palette: String
      artistId: ID!
      clientId: ID!
      referenceImages: [IBImageInput]
      bodyImages: [String]
      designImages: [IBImageInput]
      materialsUsed: [String]
      notes: [IBNoteInput]
      tags: [String]
      status: String!
    ): Project!
    updateProject(project: ProjectInput): Project
    updateProjectNotes(notes: [IBNoteInput], projectId: ID!): Project
    # Shop-side client notes - see the comment on Client.notes. Deliberately NOT available to the
    # client whose record it is, even though getClient lets them read their own row.
    updateClientNotes(notes: [IBNoteInput], clientId: ID!): Client

    ######### Deposits ############
    # Records a deposit taken on an appointment (normally a consult). Also sets that appointment's
    # subtotal/total to the deposit, so it counts as revenue on the day it was taken and the shop
    # cut is charged on it there - see mutations/deposits.js.
    # paymentMethod is required: a deposit that doesn't say how it was taken can't be reconciled
    # against the cash drawer or against Square. squarePaymentId is required when the method is
    # 'square' - see mutations/deposits.js, which refuses the combination that would claim a card
    # payment with no transaction behind it.
    #
    # The pending flag records an amount AGREED with no money taken yet, so the charge route has a stored
    # figure to charge rather than one the browser sends alongside the card. It is the only case
    # where a 'square' deposit may omit squarePaymentId - the charge fills it in. A pending deposit
    # is not spendable: applyDeposit and getAvailableDeposits both require 'available'.
    recordDeposit(
      appointmentId: ID!
      depositCents: Int!
      paymentMethod: String!
      squarePaymentId: String
      pending: Boolean
    ): Appointment
    # Spends an available deposit against a session, exactly once. Reduces that session's total
    # and recomputes its shop cut on the reduced figure.
    applyDeposit(depositAppointmentId: ID!, targetAppointmentId: ID!): Appointment
    updateProjectTags(tags: [String], projectId: ID!): Project

    ######### Conversations ###########

    # Server-stamped timestamps, same as createMessage.
    createConversation(members: [ID!]): Conversation!
    updateConversation(conversation: ConversationInput): Conversation

    ######### Messages ###########

    # Marks everything in a conversation read for the caller, as of now. Idempotent - opening a
    # thread twice, or a component re-rendering, costs one write and changes nothing the second
    # time.
    # Marks stored notifications read. Omit ids to mark everything. Also cancels any email still
    # inside its grace window - reading it is the whole reason the grace exists.
    # Timezone and digestHour are separate from prefs because they are not on/off switches; a
    # null on either means "leave it alone", so a client sending only one doesn't wipe the other.
    updateNotificationSettings(
      prefs: NotificationPrefsInput
      timezone: String
      digestHour: Int
    ): NotificationSettings!
    markNotificationsRead(notificationIds: [ID!]): Int!
    # Handled, not merely seen. See models/Notification.js on why these are different.
    markNotificationsDone(notificationIds: [ID!]!): Int!
    markConversationRead(conversationId: ID!): Conversation!
    # No createdAt/updatedAt. The server stamps them - a message's timestamp decides where it sits
    # in the thread and whether it counts as unread, and neither may be caller-controlled. See
    # mutations/messages.js.
    createMessage(
      conversationId: ID!
      senderId: ID!
      message: String!
    ): Message!
    updateMessage(message: MessageInput): Message

    ######### Booking Requests ###########

    # Public, unauthenticated by design - this is the intake form, submitted before any account
    # exists. Rate-limiting lives at the resolver level, not the schema - see
    # PRODUCTION_ROADMAP.md's "Still open" note on abuse prevention.
    createBookingRequest(bookingRequestInput: BookingRequestInput!): BookingRequest!
    # Public, token-gated (not withAuth) - a guest replying on their own booking request's page.
    sendGuestMessage(token: String!, message: String!): Message!
    # Artist-only (withAuth) - converts a pending request into a real Appointment (consult or
    # session) or marks it declined. outcome must be one of: consult_booked, session_booked,
    # declined.
    # projectTitle is only used (and required in practice) when outcome is session_booked - see
    # mutations/bookingRequests.js's comment on why converting to a session now auto-creates a
    # real Project from this request's intake fields, and why a title has to come from the
    # caller rather than being derived, since BookingRequest never collects one.
    convertBookingRequest(
      bookingRequestId: ID!
      outcome: String!
      appointmentInput: AppointmentInput
      projectTitle: String
    ): BookingRequest!
    # Artist-only (withAuth) - forwards a still-pending request to another artist at a shop both
    # the current and new artist are actively connected to. See mutations/bookingRequests.js for
    # the same-shop check this enforces - this is not a general "reassign to anyone" escape hatch.
    reassignBookingRequest(bookingRequestId: ID!, newArtistId: ID!): BookingRequest!
  }
`;
