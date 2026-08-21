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
    # No longer String! - an image-only message (see createMessage) stores no text at all, and a
    # non-null field on a genuinely absent value would fail the whole response's serialization
    # rather than just this field.
    message: String
    # Already-uploaded image URLs - see models/Message.js and routes/messageUploads.js. Empty
    # array on a text-only message, never null (matches the model's own default: []).
    imageUrls: [String!]!
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
    # The shop's own public link handle - see models/Shop.js's own comment. Only ever set via
    # updateMyShopFormSlug (self-service, shop_admin-or-better of THIS shop only), never via the
    # generic updateShop.
    formSlug: String
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
    themePreference: String
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
    # light | dark | system. Null/absent reads as 'system' client-side - see ThemeModeProvider.jsx.
    themePreference: String
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
    #
    # page: PageInput on both - a client with years of history used to ship every project and
    # every appointment it ever had on every dashboard visit, so the browser could show five of
    # them. See ClientPage/AppointmentPage's own use elsewhere; utils/pagination.js.
    projects(page: PageInput): ProjectPage!
    appointments(page: PageInput): AppointmentPage!
    # SHOP-SIDE notes about the client - allergies, sitting tolerance, healing history. NOT
    # visible to the client themselves: the whole value of a note like "cancels a lot" or
    # "needed a break every 20 minutes" depends on it being a candid internal record rather than
    # a message to the person it's about. ClientDashboard renders this section only in the
    # artist/staff view, and updateClientNotes below refuses a client editing their own. Still a
    # bare array, not paged server-side - see ClientStats' own comment on why a note list didn't
    # need the same treatment as projects/appointments.
    notes: [IBNote]
    # The dashboard's stat cards, computed here rather than derived from projects/appointments
    # above - those two are now PAGED, so summing whatever page happens to be on screen would
    # make "Total spent" silently wrong the moment a client has more than one page of history.
    # This aggregates the client's FULL history in Mongo regardless of what page the lists are
    # showing, the same separation ArtistPerformancePanel already uses (figures from
    # utils/analytics.js, lists from a separately-paged query) - see resolvers/index.js.
    stats: ClientStats!
    # Live (unresolved) flags only - see models/ClientFlag.js. A resolved flag is history, not a
    # current fact about this client, and this is what a booking screen or dashboard badge asks
    # "does this apply right now" through. Newest first, matching every other history list here.
    flags: [ClientFlag!]!
  }
  # See models/ClientFlag.js for the full reasoning (resolved-not-deleted, why the counters on
  # Client are denormalised, who can see one). This is a read/raise surface over that existing
  # logic (utils/client-flags.js) - there is deliberately no resolve-by-id mutation yet; the only
  # resolve path today is the automatic one wired into an appointment's status changing.
  type ClientFlag {
    id: ID!
    clientId: ID!
    typeKey: String!
    type: ClientFlagType
    appointmentId: ID
    appointment: Appointment
    shopId: ID
    createdByUserId: ID
    createdBy: User
    systemGenerated: Boolean!
    note: String
    resolvedAt: DateTime
    resolvedByUserId: ID
    resolvedBy: User
    createdAt: DateTime!
  }
  type ClientFlagType {
    id: ID!
    key: String!
    label: String!
    description: String
    shopId: ID
    systemGenerated: Boolean!
    active: Boolean!
  }
  input RaiseClientFlagInput {
    clientId: ID!
    typeKey: String!
    note: String
  }
  type ClientStats {
    # Completed appointments only - a scheduled session has a price attached but nothing has
    # changed hands yet. Matches utils/analytics.js's own revenue definition.
    totalSpentCents: Int!
    totalTipsCents: Int!
    # Over TIPPED completed appointments only, not every completed one - dividing by all of them
    # drags the figure toward zero with untipped sessions. tippedSessionCount is what it was
    # divided by, so a caller can show "across N tipped sessions" without a second field.
    averageTipCents: Int!
    tippedSessionCount: Int!
    completedSessionCount: Int!
    # Every project regardless of status - matches the plain count the old projects.length gave.
    projectCount: Int!
    # Any status, appointmentDate in the future - matches the old client-side filter exactly
    # (upcoming ≠ "scheduled"; a rescheduled or other-status appointment still due to happen
    # counts).
    upcomingAppointmentCount: Int!
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
  # An image shared via a message in a client-artist conversation, indexed for the client
  # dashboard's triage list - see models/SharedImage.js and resolvers/sharedImages.js.
  #
  # userInfo/tags/createdAt/updatedAt deliberately mirror IBImage's own field names above rather
  # than inventing new ones - client/src/components/ibImagesList/IBImagesList.jsx (the same
  # tag/lightbox/delete-menu component the project image lists already use) reads exactly this
  # shape, so the client-dashboard panel can feed it a SharedImage array with no reshaping.
  type SharedImage {
    id: ID!
    url: String!
    conversationId: ID!
    messageId: ID!
    clientId: ID!
    artistId: ID!
    senderId: ID!
    # Whoever actually sent this image - resolved from senderId, same as IBImage.userInfo.
    userInfo: User
    tags: [String!]!
    # Null until an artist/shop admin files this image onto a project. Deliberately NOT cleared
    # from the list once set (see the model's own header comment) - the client-dashboard panel
    # shows a badge instead, so "where did this end up" stays answerable without a second lookup.
    assignedProjectId: ID
    assignedImageType: String
    assignedProject: Project
    assignedAt: DateTime
    assignedByUserId: ID
    createdAt: DateTime!
    updatedAt: DateTime!
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
    # Percentage, e.g. 40 for 40%. Meaningless (always 0) when compensationModel is BOOTH_RENT -
    # see models/ShopCutRate.js.
    percent: Int!
    # PERCENTAGE or BOOTH_RENT - which model this dated row represents. A booth-rent row's own
    # terms (amount, due day) live on BoothRentPlan, not here - see that type below.
    compensationModel: String!
    # Inclusive lower bound. The rate in force for a date is the row with the greatest
    # effectiveFrom at or before it. Stored rather than derived from createdAt because they answer
    # different questions - when it started applying, versus when somebody typed it in.
    effectiveFrom: DateTime!
    setByUserId: ID!
    note: String
    createdAt: DateTime!
  }
  # A booth-rent artist's flat monthly fee, and from when - the flat-fee counterpart to
  # ShopCutRate above, for artists whose current ShopCutRate.compensationModel is BOOTH_RENT.
  # APPEND-ONLY, same reasoning (DECISIONS.md M7 applies here too): a rent change must never
  # reprice a month whose charge already generated. See models/BoothRentPlan.js.
  type BoothRentPlan {
    id: ID!
    artistId: ID!
    shopId: ID!
    amountCents: Int!
    dueDayOfMonth: Int!
    effectiveFrom: DateTime!
    setByUserId: ID!
    active: Boolean!
    createdAt: DateTime!
  }
  # One real month of booth rent - generated automatically (see utils/booth-rent.js), never
  # created directly. status moves due -> marked_paid -> confirmed, the same dual-control shape as
  # Appointment.shopCutStatus (see mutations/shopCutPayments.js) - the artist's own claim of "I
  # paid" isn't enough, the shop confirms independently. expenseId/incomeId are set only once
  # confirmed - see models/BoothRentCharge.js.
  type BoothRentCharge {
    id: ID!
    artistId: ID!
    shopId: ID!
    amountCents: Int!
    periodMonth: DateTime!
    dueDate: DateTime!
    status: String!
    markedPaidAt: DateTime
    markedPaidByUserId: ID
    confirmedAt: DateTime
    confirmedByUserId: ID
    expenseId: ID
    incomeId: ID
    createdAt: DateTime!
  }
  type BoothRentChargePage {
    items: [BoothRentCharge!]!
    pageInfo: PageInfo!
  }
  # The audit trail - see models/EventLog.js for what this does and doesn't cover, and why. One
  # field-level change; getEventLogs below returns these as a plain list, oldest changes first
  # within EventLogEntry.changes (the order diffFields() built them in).
  type EventLogChange {
    field: String!
    # Stringified on the way out - the underlying value can be a number, a date, or an id (see
    # EventLog.js's own comment on why the stored value stays Mixed rather than a pre-formatted
    # string). GraphQL has no untyped scalar that round-trips all three cleanly, and a viewer only
    # ever needs to display these, never compute on them.
    from: String
    to: String
  }
  type EventLogEntry {
    id: ID!
    entityType: String!
    entityId: ID!
    action: String!
    actorUserId: ID!
    actorName: String!
    shopId: ID
    summary: String!
    changes: [EventLogChange!]!
    createdAt: DateTime!
  }
  type EventLogPage {
    items: [EventLogEntry!]!
    pageInfo: PageInfo!
  }
  input EventLogFilter {
    entityType: String
    shopId: ID
    actorUserId: ID
    from: DateTime
    to: DateTime
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
  # Appointment reminders (text + email to CLIENTS ahead of an appointment) - see
  # models/ReminderSettings.js and utils/reminders.js. One row per artist, the caller's own -
  # there is no "whose settings" argument on the query below because it is always the signed-in
  # artist's, the same authority shape as the Square connection.
  type ReminderRule {
    id: ID!
    offsetMinutes: Int!
    enabled: Boolean!
  }
  input ReminderRuleInput {
    offsetMinutes: Int!
    enabled: Boolean!
  }
  # Global search - see utils/search.js. Reuses the existing Client/Project/Message/SharedImage
  # types rather than inventing narrower search-result shapes, since a result IS the real record
  # (clicking one navigates straight to it) and there's nothing about being a search hit that
  # changes its shape. Grouped by type deliberately, not one interleaved/ranked list - see the chat
  # thread this shipped from: "grouped by type" was the explicit ask.
  #
  # "images" is SharedImage, not IBImage - a tag on an image already filed onto a Project matches
  # through that Project's own text index instead (see models/Project.js) and surfaces as a
  # matched Project, same as any other project-field match; there's no standalone "which image"
  # result for those, since IBImage isn't its own collection to $text-search. SharedImage IS its
  # own collection (the client-dashboard triage list, pre-project-assignment), so a tag match
  # there gets its own group - see utils/search.js on why the same projectScopeFilter that scopes
  # Projects also scopes this.
  type SearchResults {
    clients: [Client!]!
    projects: [Project!]!
    messages: [Message!]!
    images: [SharedImage!]!
  }
  type ReminderSettings {
    emailEnabled: Boolean!
    smsEnabled: Boolean!
    rules: [ReminderRule!]!
    # Null means "use the built-in default" - see utils/reminders.js's DEFAULT_EMAIL_SUBJECT_TEMPLATE
    # / DEFAULT_EMAIL_BODY_TEMPLATE / DEFAULT_SMS_TEMPLATE, which the UI shows as placeholder text
    # when these come back null rather than leaving the box looking empty.
    emailSubjectTemplate: String
    emailBodyTemplate: String
    smsTemplate: String
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
    # Task #165: an ARCHIVED artist is still returned here (never null - null now means "no such
    # artist at all", not "gone"), so BookingRequest.jsx can show 'This artist is no longer on the
    # platform.' instead of the generic 'we couldn't find this artist' it can't tell apart from a
    # mistyped link. Mirrors the distinction utils/public-form-lookup.js's own STATES.ARTIST_GONE
    # already makes for the newer slug-based form links - see that file's header comment. Only
    # ARCHIVED counts as gone; INACTIVE/BOOKS_CLOSED still resolve with archived: false, same as
    # createBookingRequest itself still accepts requests for either of those statuses unchanged.
    archived: Boolean!
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
    # for exactly this reason. (Project.bodyImages used to be [String] too and was cited here as
    # precedent - it's now [IBImage], see that field's own comment - so this field's [String]
    # shape stands on the guest/no-userId reasoning above alone.)
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
    # Finished-tattoo photos - was [String] (bare URLs) while the Mongoose model
    # (models/Project.js) already stored these as full IBImageSchema subdocuments, same shape as
    # referenceImages/designImages. That mismatch meant the "Finished Tattoo" section couldn't
    # show an uploader, a timestamp, or tags the way the other two sections do. Retyped to match
    # the model it was already reading from.
    bodyImages: [IBImage]
    designImages: [IBImage]
    materialsUsed: [String]
    notes: [IBNote]
    tags: [String]
    status: String!
    bookingRequestId: ID
    # The consult this project's booking request produced, when there is one - resolved via
    # bookingRequestId the same way deposits below is, so a client has an appointmentId to add
    # more deposit money against without a separate lookup. Null for a project with no
    # bookingRequestId (see resolvers/index.js's deposits comment on why the consult predates
    # the Project and can't be reached through projectId).
    consultAppointment: Appointment
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
    bodyImages: [IBImageInput]
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
    # A personal-calendar entry, visible only to its own userId - see models/Appointment.js.
    # createAppointment rejects this alongside a shopId or projectId, and updateAppointment rejects
    # any attempt to change it after creation - see mutations/appointments.js for both.
    isPersonal: Boolean
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
    # See AppointmentInput.isPersonal above. Never true alongside a non-null shopId or projectId.
    isPersonal: Boolean!
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
    # --- Gift cards. See models/Appointment.js and DECISIONS.md M6. ---
    # Total gift card credit applied to this session, both issuer types. Fed into
    # getChargeQuote/the real charge as computeChargeBreakdown's giftCardCents.
    giftCardCreditCents: Int
    # The subset of the above that came from ARTIST-issued cards - the portion that reduces the
    # shop-cut cuttable base (utils/shop-cut.js). Exposed mainly for audit; most callers only need
    # giftCardCreditCents.
    artistIssuedGiftCardCreditCents: Int
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
    # DECISIONS.md M4 - a documented reversal, recorded here AFTER the real money movement already
    # happened by hand in the Square app. Resolved on demand, not denormalised: this appointment's
    # own totalCents/tipCents/shopCutCents are untouched by these rows - see models/Adjustment.js.
    # Newest first, matching the model's own index and every other history list in this schema.
    adjustments: [Adjustment!]!
  }
  # See models/Adjustment.js for the full reasoning. amountCents is always a positive magnitude -
  # the amount reversed, never signed.
  type Adjustment {
    id: ID!
    appointmentId: ID!
    shopId: ID
    artistUserId: ID!
    amountCents: Int!
    reason: String!
    createdByUserId: ID!
    createdBy: User
    createdAt: DateTime!
  }
  input RecordAdjustmentInput {
    appointmentId: ID!
    amountCents: Int!
    reason: String!
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

  # --- Gift cards. See DECISIONS.md M6, models/GiftCard.js, graphql/resolvers/giftCards.js. -----
  type GiftCard {
    id: ID!
    code: String!
    issuerType: String!
    # Only set when issuerType is ARTIST.
    issuerArtistId: ID
    issuerArtist: Artist
    # Not required at the schema level - see models/GiftCard.js's own comment on why an
    # independent artist's card can have no shop at all.
    shopId: ID
    shop: Shop
    faceValueCents: Int!
    balanceCents: Int!
    feeOffsetCents: Int!
    soldAt: DateTime!
    soldByUserId: ID!
    soldBy: User
    # --- Shop-cut ledger fields - same shape/meaning as Appointment's. See models/GiftCard.js. ---
    shopCutStatus: String!
    shopCutCents: Int
    shopCutPercentApplied: Int
    shopCutPaymentMethod: String
    shopCutSquareInvoiceId: String
    shopCutMarkedPaidBy: ID
    shopCutMarkedPaidAt: DateTime
    shopCutConfirmedBy: ID
    shopCutConfirmedAt: DateTime
    createdAt: DateTime
    updatedAt: DateTime
  }

  # One partial or full redemption - see models/GiftCardRedemption.js on why this is its own
  # collection rather than an array on GiftCard.
  type GiftCardRedemption {
    id: ID!
    giftCardId: ID!
    appointmentId: ID!
    appointment: Appointment
    amountCents: Int!
    redeemedAt: DateTime!
    redeemedByUserId: ID!
    # Null for an artist-issued card's redemption - see models/GiftCardRedemption.js's own
    # comment on why that is null rather than zero. Set for a shop-issued card's redemption; sign
    # convention is DECISIONS.md M6's, verbatim: positive means the artist owes the shop, negative
    # means the shop owes the artist.
    shopPayoutCents: Int
  }

  # Returned by redeemGiftCard - all three records a redemption actually touches, in one round
  # trip, the same reasoning as ShopCutInvoiceResult bundling the appointment with the invoice url.
  type RedeemGiftCardResult {
    giftCard: GiftCard!
    appointment: Appointment!
    redemption: GiftCardRedemption!
  }

  # The liability report DECISIONS.md M6 requires: "a report must show outstanding balance, card
  # count and oldest issue date, because that portion of the bank balance is already spoken for."
  # Scoped to a shop - see resolvers/giftCards.js for what "outstanding" means for an independent
  # artist's own cards (getMyGiftCardLiabilityReport, not this one).
  type GiftCardLiabilityReport {
    outstandingBalanceCents: Int!
    cardCount: Int!
    oldestIssuedAt: DateTime
  }

  # Returned by createGiftCardShopCutInvoice - mirrors ShopCutInvoiceResult exactly, for the same
  # reason (the client shows a "pay now" link immediately).
  type GiftCardShopCutInvoiceResult {
    giftCard: GiftCard!
    invoiceUrl: String!
  }

  # Sold by the artist themselves, for themselves alone - see models/GiftCard.js. No artistId
  # argument anywhere on this input or the mutation that takes it: it can only ever act for the
  # caller, the same convention getMySquareAuthorizationUrl already uses.
  input CreateArtistGiftCardInput {
    faceValueCents: Int!
    # The processing-fee offset choice (M5), offered here on the SAME terms as anywhere else -
    # never applied silently. Never loads onto the card's balance either way - see
    # models/GiftCard.js's feeOffsetCents comment.
    applyFeeOffset: Boolean
  }

  # Sold as a shop product - see models/GiftCard.js. shopId IS required here, unlike the artist
  # version: an admin's own shop isn't derivable the way an artist's active connection is, and the
  # resolver still checks the caller actually belongs to the shop named.
  input CreateShopGiftCardInput {
    shopId: ID!
    faceValueCents: Int!
    applyFeeOffset: Boolean
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
    # Was computed here all along (utils/analytics.js's perArtist rows spread the same totalsAgg
    # the shop-wide totals use) but never exposed on this type - so a per-artist "what do they
    # actually take home" figure had no way to account for a cut the artist has already marked
    # paid but the shop hasn't confirmed yet. Added for ArtistPerformancePanel's shopWide "Artist
    # Totals" breakdown, which needs shopCutEarned + shopCutOutstanding + this one to know an
    # artist's FULL assessed cut, not just the earned-and-outstanding two thirds of it.
    shopCutAwaitingConfirmationCents: Int
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

    # --- Non-tattoo bookkeeping. See models/Expense.js, models/Income.js. ---
    # Every Expense in this scope and window - rent, supplies, anything logged against an
    # ExpenseType, including rows a RecurringExpense template auto-generated.
    expensesCents: Int
    # Every Income row in this scope and window - money in that ISN'T a tattoo session
    # (revenueCents already covers that side). Named otherIncomeCents rather than incomeCents so
    # it reads unambiguously next to revenueCents on the same card, not as a second, competing
    # definition of "income".
    otherIncomeCents: Int
    # revenueCents + otherIncomeCents - expensesCents, computed server-side rather than left for
    # a dashboard to add up - the same "the server decides every figure" principle
    # utils/charge-quote.js states for a charge applies here: three numbers that agree by
    # construction rather than by three widgets doing the same arithmetic and hoping not to drift.
    netCents: Int

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

  # --- Expenses, non-tattoo income, and recurring expenses ------------------------------------
  # See models/Expense.js, models/Income.js, models/RecurringExpense.js and
  # utils/shop-membership.js's resolveBusinessOwner/assertCanManageBusinessRecord for the full
  # design. Every type below carries EXACTLY ONE owner - shopId or artistUserId, never both, never
  # neither - and every read/write is gated on owning that scope: a shop admin for a shopId, or
  # the artist themselves for an artistUserId. Staff and other artists at a shop see none of this,
  # the same way they see none of setShopCutRate's or updateSquarePricingSettings' figures.
  type ExpenseType {
    id: ID!
    shopId: ID
    artistUserId: ID
    name: String!
    description: String
    active: Boolean!
    createdAt: DateTime!
  }
  type IncomeType {
    id: ID!
    shopId: ID
    artistUserId: ID
    name: String!
    description: String
    active: Boolean!
    createdAt: DateTime!
  }
  type Expense {
    id: ID!
    shopId: ID
    artistUserId: ID
    expenseTypeId: ID!
    expenseType: ExpenseType
    amountCents: Int!
    description: String
    date: DateTime!
    # Set only on a row the recurring-expense scheduler wrote - see models/Expense.js. Editing or
    # deleting this row never touches the template it came from.
    recurringExpenseId: ID
    createdByUserId: ID!
    createdBy: User
    createdAt: DateTime!
  }
  type Income {
    id: ID!
    shopId: ID
    artistUserId: ID
    incomeTypeId: ID!
    incomeType: IncomeType
    amountCents: Int!
    description: String
    date: DateTime!
    createdByUserId: ID!
    createdBy: User
    createdAt: DateTime!
  }
  type RecurringExpense {
    id: ID!
    shopId: ID
    artistUserId: ID
    expenseTypeId: ID!
    expenseType: ExpenseType
    amountCents: Int!
    description: String
    frequency: String!
    startDate: DateTime!
    # The next date this template is due to generate an Expense - see the model's own comment on
    # why this field IS the cursor, not just informational.
    nextRunDate: DateTime!
    endDate: DateTime
    active: Boolean!
    createdByUserId: ID!
    createdAt: DateTime!
  }
  type ExpensePage {
    items: [Expense!]!
    pageInfo: PageInfo!
  }
  type IncomePage {
    items: [Income!]!
    pageInfo: PageInfo!
  }

  input CreateExpenseTypeInput {
    # Omit for the caller's own independent-artist scope - see resolveBusinessOwner.
    shopId: ID
    name: String!
    description: String
  }
  input UpdateExpenseTypeInput {
    expenseTypeId: ID!
    name: String
    description: String
    active: Boolean
  }
  input CreateIncomeTypeInput {
    shopId: ID
    name: String!
    description: String
  }
  input UpdateIncomeTypeInput {
    incomeTypeId: ID!
    name: String
    description: String
    active: Boolean
  }
  input RecordExpenseInput {
    shopId: ID
    expenseTypeId: ID!
    amountCents: Int!
    description: String
    date: DateTime!
  }
  input UpdateExpenseInput {
    expenseId: ID!
    expenseTypeId: ID
    amountCents: Int
    description: String
    date: DateTime
  }
  input RecordIncomeInput {
    shopId: ID
    incomeTypeId: ID!
    amountCents: Int!
    description: String
    date: DateTime!
  }
  input UpdateIncomeInput {
    incomeId: ID!
    incomeTypeId: ID
    amountCents: Int
    description: String
    date: DateTime
  }
  input CreateRecurringExpenseInput {
    shopId: ID
    expenseTypeId: ID!
    amountCents: Int!
    description: String
    frequency: String!
    startDate: DateTime!
    endDate: DateTime
  }
  input UpdateRecurringExpenseInput {
    recurringExpenseId: ID!
    expenseTypeId: ID
    amountCents: Int
    description: String
    frequency: String
    endDate: DateTime
    active: Boolean
  }

  # --- Auto-Responses (see models/AutoResponse.js) ---------------------------------------------
  # Same ownership shape as Expenses/Income/Forms directly above - shopId XOR artistUserId - but
  # UNLIKE those, a shop-connected artist does not choose one scope over the other: they own a
  # personal set (artistUserId) AND see their shop's set (shopId) at the same time, continuously.
  # See utils/auto-responses.js's resolveAutoResponseForTrigger for how the two coexist: the
  # artist's own enabled response for a trigger wins, the shop's fires only when the artist has
  # none enabled for that trigger.
  type AutoResponse {
    id: ID!
    shopId: ID
    artistUserId: ID
    name: String!
    trigger: String!
    # Governs automatic firing only - a disabled response stays visible in the manual "Send a
    # message" picker as long as active is true. Always false when trigger is MANUAL - see
    # models/AutoResponse.js's header comment.
    enabled: Boolean!
    emailEnabled: Boolean!
    smsEnabled: Boolean!
    # Null means "use the built-in default" - see utils/auto-responses.js's DEFAULT_TEMPLATES,
    # which the UI shows as placeholder text when these come back null rather than leaving the
    # box looking empty. Merge fields: {{clientFirstName}}, {{artistName}}, {{appointmentDate}},
    # {{appointmentTime}}.
    emailSubjectTemplate: String
    emailBodyTemplate: String
    smsTemplate: String
    active: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  input CreateAutoResponseInput {
    # Omit for the caller's own personal scope - see resolveBusinessOwner. Shop admin only when
    # provided.
    shopId: ID
    name: String!
    trigger: String!
    enabled: Boolean
    emailEnabled: Boolean
    smsEnabled: Boolean
    emailSubjectTemplate: String
    emailBodyTemplate: String
    smsTemplate: String
  }
  input UpdateAutoResponseInput {
    autoResponseId: ID!
    name: String
    enabled: Boolean
    emailEnabled: Boolean
    smsEnabled: Boolean
    # Each nullable template field is applied only when the caller actually sends the key at all -
    # same "omitted leaves it alone, explicit null resets to the built-in default" convention as
    # updateReminderSettings.
    emailSubjectTemplate: String
    emailBodyTemplate: String
    smsTemplate: String
    active: Boolean
  }

  # --- Response-time settings (Feature 3 - unanswered-message nudges; see
  # models/ResponseTimeSettings.js and utils/response-time.js) ----------------------------------
  # A shop's row is a CEILING an artist's own row is clamped to (min), never a value the artist
  # may exceed - see resolveResponseTimeThresholds. One row per owner (shopId XOR artistUserId),
  # lazily created on first read or write, same convention as ReminderSettings.
  type ResponseTimeSettings {
    id: ID!
    shopId: ID
    artistUserId: ID
    # How long a client's message may sit unanswered before it first counts as "unanswered" -
    # both in the passive inbox condition and to start the repeat-nudge clock. Minutes, matching
    # ReminderRule's own offsetMinutes convention.
    initialThresholdMinutes: Int!
    # Once unanswered, how often the artist is re-notified until they reply.
    repeatIntervalMinutes: Int!
    # Set only when this row is an ARTIST's own (always null on a shop row): the shop's row, if
    # one exists, as the ceiling this artist's two fields above are clamped to - resolved the same
    # way the server itself resolves it, so the UI can validate against the exact number that will
    # actually apply. Null when the artist has no shop, or their shop has never set one.
    shopCeiling: ResponseTimeCeiling
    setByUserId: ID
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  type ResponseTimeCeiling {
    initialThresholdMinutes: Int!
    repeatIntervalMinutes: Int!
  }
  input UpdateResponseTimeSettingsInput {
    # Omit for the caller's own personal scope - see resolveBusinessOwner. Shop admin only when
    # provided.
    shopId: ID
    initialThresholdMinutes: Int
    repeatIntervalMinutes: Int
  }

  # --- System message templates (Feature 2 - manageable system-generated text; see
  # models/SystemMessageTemplate.js and utils/system-message-templates.js) ---------------------
  # An owner-editable override for one of the app's hardcoded outbound emails. Absence of a row
  # for a given key means "use the built-in default" - there is no null-fields-on-a-lazily-
  # created-row convention here the way ResponseTimeSettings has, since every field on this type
  # is only ever an override (see the model's own header comment).
  type SystemMessageTemplate {
    id: ID!
    shopId: ID
    artistUserId: ID
    key: String!
    emailSubjectTemplate: String
    emailBodyTemplate: String
    # Only ever populated for key: "BOOKING_CONFIRMATION" - see
    # utils/client-booking-emails.js's own comment on why that one email's body stays
    # code-generated and only its subject and this one appendable note are editable.
    extraNoteTemplate: String
    setByUserId: ID
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  input UpdateSystemMessageTemplateInput {
    # Omit for the caller's own personal scope - see resolveBusinessOwner. Shop admin only when
    # provided.
    shopId: ID
    key: String!
    emailSubjectTemplate: String
    emailBodyTemplate: String
    extraNoteTemplate: String
  }

  # --- Forms (consent/waiver/intake - see models/Form.js and models/FormResponse.js) -----------
  # Same ownership model as Expenses/Income directly above: shopId XOR artistUserId, gated through
  # the same resolveBusinessOwner/assertCanManageBusinessRecord. A separate feature from
  # BookingRequest - see models/Form.js's own header comment.
  type FormField {
    key: ID!
    type: String!
    label: String!
    helpText: String
    required: Boolean!
    # Only meaningful when type is single_choice/multi_choice - empty on every other field type.
    options: [String!]!
    # ALWAYS false for a field on a generic form - createForm/updateForm have no way to set this
    # (see FormFieldInput below, which has no hidden argument at all). Only ever true on the
    # booking_request system form's fixed slots, via updateBookingRequestFields - see
    # models/Form.js's own comment on why deletion isn't an option there.
    hidden: Boolean!
  }
  type Form {
    id: ID!
    shopId: ID
    artistUserId: ID
    title: String!
    description: String
    status: String!
    allowGuestSubmissions: Boolean!
    # Null until allowGuestSubmissions has been turned on at least once - see setFormGuestAccess.
    # Never exposed on PublicForm below - a guest holding a link has no business learning it.
    publicToken: ID
    # The public link's first path segment - see utils/form-slug.js. Null on a form that hasn't
    # had one set yet (a brand-new draft, most commonly).
    slug: String
    # Shop-owned forms only - excludes this form from every affiliated artist's own forms list and
    # gives it one shop-wide link instead of one per artist. See models/Form.js's own comment.
    shopUseOnly: Boolean!
    # Set only on the two auto-provisioned defaults (utils/seed-default-forms.js) - null on every
    # form a shop/artist built themselves. Read-only: never accepted on CreateFormInput/
    # UpdateFormInput, and deleteForm refuses any form where this is set.
    systemKey: String
    fields: [FormField!]!
    createdByUserId: ID!
    createdBy: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  # The stripped-down shape a stranger holding a public link actually gets - see getPublicForm's
  # own comment on why this isn't just Form with some fields nulled out at the resolver level. No
  # shopId/artistUserId/status/createdByUserId/publicToken - none of a shop's internal identity or
  # this form's own access token belongs in a response a browser with no login can read.
  type PublicForm {
    id: ID!
    title: String!
    description: String
    fields: [FormField!]!
  }
  # The result of resolving /<formSlug>/<ownerHandle> - see utils/public-form-lookup.js's own
  # header comment for the full design. 'state' is one of:
  #   'ok'          - form is set and ready to render/fill out.
  #   'not_found'   - no such link (bad slug, bad handle, or a real handle with no form at that
  #                   slug). Deliberately as uninformative as a 404 - nothing here should let a
  #                   guest distinguish "typo" from "handle exists but that slug doesn't."
  #   'inactive'    - the link is real but the form has been unpublished. Show
  #                   "This form has been marked as inactive."
  #   'artist_gone' - the handle belonged to an artist who has since been archived. Show
  #                   "This artist is no longer on the platform."
  type PublicFormLookup {
    state: String!
    form: PublicForm
  }
  # getMyFormLinks' own row - deliberately just enough to build a URL and a label, never the full
  # Form. See resolvers/forms.js's getMyFormLinks for why this exists: a plain shop-connected
  # artist (not shop_admin) has no authority to call getForms(shopId: ...) at all (see
  # assertCanManageBusinessRecord), so without a self-scoped read like this one, they would have no
  # way to ever see their OWN shop's book/consent links in their own Settings.
  type FormLinkSummary {
    title: String!
    slug: String!
  }
  type FormPage {
    items: [Form!]!
    pageInfo: PageInfo!
  }
  # One submitted answer - see models/FormResponse.js's own comment on why exactly one of these
  # value slots is meaningful per answer, chosen by the matching field's type.
  type FormAnswer {
    fieldKey: ID!
    textValue: String
    selectedOptions: [String!]!
    dateValue: DateTime
    fileUrls: [String!]!
    signature: FormSignature
  }
  type FormSignature {
    signedName: String
    signedAt: DateTime
  }
  type FormResponse {
    id: ID!
    formId: ID!
    shopId: ID
    artistUserId: ID
    # This response's own copy of the form's title/fields AS THEY WERE at submission time - see
    # models/FormResponse.js's header comment on why this, not a live lookup through formId, is
    # what every answer is interpreted against.
    formTitle: String!
    fieldsSnapshot: [FormField!]!
    clientId: ID!
    client: Client
    answers: [FormAnswer!]!
    submittedByUserId: ID!
    submittedBy: User
    submitterIp: String
    source: String!
    createdAt: DateTime!
  }
  type FormResponsePage {
    items: [FormResponse!]!
    pageInfo: PageInfo!
  }
  # One field's aggregated results, over whatever responses getFormAnalytics matched.
  type FormFieldAnalytics {
    fieldKey: ID!
    label: String!
    type: String!
    # How many responses answered this field at all (a required field should read the same as
    # totalResponses below; a genuinely optional one may read lower).
    answeredCount: Int!
    # Only populated for single_choice/multi_choice (see Form.CHOICE_FIELD_TYPES) - one row per
    # option, in the field's own option order, with how many responses selected it. Empty for every
    # other field type: a free-text/date/file/signature answer isn't meaningfully bucketable this
    # way, and this deliberately doesn't attempt word-frequency or similar analysis of free text.
    optionCounts: [FormOptionCount!]!
  }
  type FormOptionCount {
    option: String!
    count: Int!
  }
  # Submission volume for one day, in the caller's own local sense of "a day" (see
  # resolvers/forms.js's getFormAnalytics for how the bucketing actually works) - the same shape
  # a dashboard sparkline needs, nothing more.
  type FormResponsesByDay {
    date: DateTime!
    count: Int!
  }
  type FormAnalytics {
    formId: ID!
    totalResponses: Int!
    responsesByDay: [FormResponsesByDay!]!
    fields: [FormFieldAnalytics!]!
  }
  # updateBookingRequestFields' own input - deliberately NOT FormFieldInput. type/options are
  # absent on purpose: the booking_request system form's seven fields (utils/seed-default-forms.js)
  # keep whatever type/options they were seeded with forever, and this input has no way to say
  # otherwise. key is required (not optional the way FormFieldInput's is for a brand-new field) -
  # every field here must already exist; see resolvers/forms.js's updateBookingRequestFields for
  # the exact-same-key-set check that backs this up server-side, not just this schema.
  input BookingRequestFieldInput {
    key: ID!
    label: String!
    required: Boolean
    hidden: Boolean
  }

  input FormFieldInput {
    # Omit for a brand-new field; supply an EXISTING field's key to preserve its identity across an
    # edit - see utils/validation.js's formFieldInputSchema for the full reasoning.
    key: ID
    type: String!
    label: String!
    helpText: String
    required: Boolean
    options: [String!]
  }
  input CreateFormInput {
    # Omit for the caller's own independent-artist scope - see resolveBusinessOwner.
    shopId: ID
    title: String!
    description: String
    # Optional at creation - a form can be built and saved before its link is picked. Validated +
    # scoped-uniqueness-checked via utils/form-slug.js.
    slug: String
    # Only meaningful when shopId is set - see models/Form.js's own comment. Ignored (left false)
    # on an artist-owned form.
    shopUseOnly: Boolean
    fields: [FormFieldInput!]!
  }
  # status and allowGuestSubmissions are NOT here - see publishForm/archiveForm/setFormGuestAccess
  # in the Mutation block below for why each is its own explicit action rather than a value this
  # generic PATCH could flip unremarked-on alongside a title typo fix. systemKey is likewise not
  # here - it is never client-settable, see the Form.systemKey field comment.
  input UpdateFormInput {
    formId: ID!
    title: String
    description: String
    slug: String
    shopUseOnly: Boolean
    fields: [FormFieldInput!]
  }
  input FormAnswerInput {
    fieldKey: ID!
    textValue: String
    selectedOptions: [String!]
    dateValue: DateTime
    # Populated from POST /form-uploads (routes/formUploads.js) - see BookingRequest.referenceImages'
    # own comment for why file uploads are a plain REST route, not part of this GraphQL mutation.
    fileUrls: [String!]
    # The typed name only - signedAt is always set server-side, never accepted from the client. See
    # models/FormResponse.js's own comment on why a client-supplied timestamp is never trusted here.
    signedName: String
  }
  input SubmitFormResponseInput {
    # Exactly one of THREE things identifies the form:
    #   - formId for every authenticated path (the caller already has real access).
    #   - publicToken for the OLDER guest path - proof of holding a secret, opaque shareable link.
    #   - formSlug + ownerHandle TOGETHER for the NEWER guest path, resolved the same way
    #     getPublicFormBySlug resolves them (utils/public-form-lookup.js) - a predictable business
    #     link rather than a secret one, gated on the resolved form's own allowGuestSubmissions
    #     exactly like the publicToken path is, not on the link being guessable-or-not.
    # A guest is never allowed to resolve a form by formId alone - see resolvers/forms.js's
    # submitFormResponse.
    formId: ID
    publicToken: String
    formSlug: String
    ownerHandle: String
    # Only meaningful for an authenticated caller submitting THIS response on a specific existing
    # client's behalf (e.g. staff at the counter) - see resolvers/forms.js for the full branching.
    # Omitted for a guest, and omitted for a logged-in client filling out their own copy.
    clientId: ID
    answers: [FormAnswerInput!]!
    # Only read on the guest path (no authenticated caller, and therefore no clientId either) -
    # exactly the case createBookingRequest already handles the same way, via the same
    # findOrCreateGuestClient. Ignored (and may be omitted) for every authenticated submission.
    firstName: String
    lastName: String
    email: String
    phone: String
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
    # Filter on Appointment.isPersonal. Only meaningful (and only ever honoured) on
    # getAppointmentsByArtist when the caller IS the artist being asked about - see that resolver's
    # own comment. A caller viewing someone else's calendar can send this and it will be silently
    # overridden to exclude personal appointments regardless, never loosened by it.
    isPersonal: Boolean
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
    #
    # filter is optional and only its date bounds are honoured (see resolvers/appointments.js) -
    # the dashboard's own date range picker sits above this list along with everything else on the
    # panel, and this was the one section that silently ignored it.
    getShopCutPayoutCandidates(userId: ID!, filter: AppointmentFilter): [Appointment!]!
    # The shop-wide counterpart to getShopCutPayoutCandidates above - every artist's unpaid,
    # completed shop cut at this shop rather than one artist's own. Shop-admin-or-better only (see
    # resolvers/appointments.js), matching getPendingShopCutConfirmations' floor: this is the same
    # class of financial data (what every artist here owes), not the front-desk-visible calendar.
    getShopCutPayoutCandidatesByShop(shopId: ID!, filter: AppointmentFilter): [Appointment!]!
    getAppointment(appointmentId: ID!): Appointment
    # The charge total, computed server-side, BEFORE the card is taken. applyFeeOffset and
    # tipCents are the only two inputs because they are the only two the caller legitimately
    # knows - see utils/charge-quote.js.
    # subtotalCentsOverride is a PREVIEW-ONLY input - see utils/charge-quote.js's own comment.
    # The real charge in routes/squarePayments.js always reads the saved subtotalCents; this exists
    # so the session view can show live tax/fee/total figures before the artist saves.
    getChargeQuote(
      appointmentId: ID!
      applyFeeOffset: Boolean
      tipCents: Int
      subtotalCentsOverride: Int
    ): ChargeQuote!
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

    ######### Gift cards ###########
    # See DECISIONS.md M6, models/GiftCard.js, graphql/resolvers/giftCards.js.

    # Looked up by code, the same way a real gift card is - anyone who has the code can look up
    # its balance, which is the property a bearer instrument is supposed to have (M6: random code,
    # not a hash, precisely so knowing the code is the only way in). Redemption's own checks
    # (issuer lock, balance) are what actually protect the money, not this query.
    getGiftCardByCode(code: String!): GiftCard
    # A shop's own catalogue - unpaginated, matching getShopCutRates' reasoning: a shop's gift
    # card book isn't expected to need paging soon, and if it ever does that's a symptom worth
    # seeing, not a scrolling problem to hide (see getShopCutPayoutCandidates' comment for the
    # fuller version of this argument).
    getGiftCardsByShop(shopId: ID!): [GiftCard!]!
    # An independent artist's own issued cards - the shop-scoped query above has no shop to key
    # off for them.
    getMyGiftCards: [GiftCard!]!
    # One card's full redemption history - what a partial-redemption balance is actually made of.
    getGiftCardRedemptions(giftCardId: ID!): [GiftCardRedemption!]!
    getGiftCardLiabilityReport(shopId: ID!): GiftCardLiabilityReport!
    getMyGiftCardLiabilityReport: GiftCardLiabilityReport!

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
    # The types a manual-flag picker can offer: every platform-wide type (shopId omitted or null)
    # plus, when shopId is passed, that shop's own. Includes systemGenerated types too (NO_SHOWED)
    # so a client's flag list can label one correctly - raiseClientFlag below is what actually
    # refuses a systemGenerated key from being hand-created, not this list.
    getClientFlagTypes(shopId: ID): [ClientFlagType!]!

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

    ######### Shared images (client-dashboard message-image triage) #########
    # Every image shared in this client's message conversation(s), newest first, whether the
    # client or the artist sent it - artist/shop-admin only, see
    # utils/shop-membership.js's canManageClientSharedImages. See resolvers/sharedImages.js.
    getSharedImagesForClient(clientId: ID!): [SharedImage!]!
    # This client's projects, unpaginated title/status only - feeds the "assign to project"
    # picker on the shared-images panel. Same auth as getSharedImagesForClient above.
    getProjectsForClient(clientId: ID!): [Project!]!

    ######### Booth rent (Feature 5 - booth rent vs. percentage cut) #########
    # Booth-rent plan history for one artist at one shop, newest first - same read floor as
    # getShopCutRates above (the artist themselves, or a shop admin there). See
    # resolvers/boothRent.js.
    getBoothRentPlans(artistId: ID!, shopId: ID!): [BoothRentPlan!]!
    # A page of one owner's booth-rent charges, newest period first. Exactly one of
    # artistId/shopId is required - the artist's own history, or a shop's full roster of
    # booth-rent artists. status optionally narrows to one lifecycle stage (e.g. "due" for an
    # overdue-rent view, "marked_paid" for a shop admin's confirmation queue).
    getBoothRentCharges(artistId: ID, shopId: ID, status: String, page: PageInput): BoothRentChargePage!
    # The audit trail. Scoping is enforced in the resolver, not by the filter argument here - a
    # shop admin gets their own shop's rows regardless of what shopId they pass, a plain Admin's
    # filter is honored as given, and an independent artist (no shop) is scoped to their own
    # actions. See resolvers/eventLogs.js.
    getEventLogs(filter: EventLogFilter, page: PageInput): EventLogPage!
    # Always the caller's own row (created on first read if none exists yet) - see
    # resolvers/reminders.js.
    getReminderSettings: ReminderSettings!
    # Global search across Clients, Projects, Messages, and shared-images-by-tag - grouped by
    # type, scoped to exactly what the caller could otherwise list/read (see utils/search.js).
    # Blank/whitespace-only returns all four lists empty rather than erroring - the client fires
    # this on every keystroke, and "nothing typed yet" is a normal state, not a bad request.
    #
    # limit is PER TYPE, not total, and optional - omitted, it's the app bar dropdown's small
    # default; the dedicated /search results page passes a larger one explicitly. Clamped
    # server-side regardless of what's asked for (see utils/search.js's MAX_RESULTS_PER_TYPE).
    search(query: String!, limit: Int): SearchResults!
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

    ######### Expenses, income, recurring expenses ###########
    # Exactly one of shopId/artistUserId is required on every one of these - see the type block's
    # own comment above. includeInactive defaults to false: a deactivated type has no reason to
    # show up in a picker, only in the management panel that offers to reactivate it.
    getExpenseTypes(shopId: ID, artistUserId: ID, includeInactive: Boolean): [ExpenseType!]!
    getIncomeTypes(shopId: ID, artistUserId: ID, includeInactive: Boolean): [IncomeType!]!
    # start/end are optional - omitted, this returns the scope's full history (paged). A caller
    # wanting a window passes both, half-open [start, end) matching every other range in this
    # schema.
    getExpenses(
      shopId: ID
      artistUserId: ID
      start: DateTime
      end: DateTime
      page: PageInput
    ): ExpensePage!
    getIncomes(
      shopId: ID
      artistUserId: ID
      start: DateTime
      end: DateTime
      page: PageInput
    ): IncomePage!
    # Unpaginated, like getGiftCardsByShop/getShopCutRates - a shop's set of recurring line items
    # isn't expected to need paging, and if it ever does that's a symptom worth seeing.
    getRecurringExpenses(shopId: ID, artistUserId: ID, includeInactive: Boolean): [RecurringExpense!]!

    ######### Auto-Responses ###########
    # Exactly one of shopId/artistUserId is required, same as the Expenses/Income queries above.
    # includeInactive defaults to false - a deactivated response has no reason to appear in
    # Settings or the manual send picker, only in a "show deactivated" toggle if one is ever added.
    getAutoResponses(shopId: ID, artistUserId: ID, includeInactive: Boolean): [AutoResponse!]!

    ######### Response-time settings (Feature 3 - unanswered-message nudges) ###########
    # Exactly one of shopId/artistUserId is required, same as getAutoResponses above. Lazily
    # created on first read - see resolvers/responseTimeSettings.js's findOrCreateSettings.
    getResponseTimeSettings(shopId: ID, artistUserId: ID): ResponseTimeSettings!

    ######### System message templates (Feature 2 - manageable system-generated text) #########
    # Exactly one of shopId/artistUserId is required, same as getAutoResponses above. Returns
    # only the overrides that actually exist for that owner - an empty list means every one of
    # the 7 keys is still using its built-in default.
    getSystemMessageTemplates(shopId: ID, artistUserId: ID): [SystemMessageTemplate!]!

    ######### Forms (consent/waiver/intake) ###########
    # See the type block's own header comment (models/Form.js) for the ownership model - identical
    # to Expenses/Income above, reusing the same resolveBusinessOwner/assertCanManageBusinessRecord.
    getForm(formId: ID!): Form!
    getForms(shopId: ID, artistUserId: ID, status: String, page: PageInput): FormPage!
    # PUBLIC - no auth, no ownership check. This is the one Forms query a stranger with a link but
    # no InkBooks account can ever call, matching inspectPasswordToken/createBookingRequest's own
    # "public by design" convention above. Returns null for a token that doesn't exist, isn't
    # published, or belongs to a form with allowGuestSubmissions: false - never an error, since a
    # dead/typo'd link and a deliberately-closed form should look identical to whoever's holding it,
    # not confirm which one it is.
    getPublicForm(publicToken: String!): PublicForm
    # PUBLIC - the slug-based counterpart, /<formSlug>/<ownerHandle> (see utils/
    # public-form-lookup.js's own header comment on why this is a DELIBERATELY predictable,
    # shareable link rather than a secret token like getPublicForm's, and how the two still agree
    # on the one thing that actually matters: allowGuestSubmissions gates writing either way).
    # ALWAYS returns a result (never null) - unlike getPublicForm, this distinguishes "no such
    # link" from "this form was turned off" from "this artist is no longer on the platform",
    # because a real, predictable link deserves a real answer about why it stopped working.
    getPublicFormBySlug(formSlug: String!, ownerHandle: String!): PublicFormLookup!
    # SELF-SCOPED, not the management getForms above - every authenticated artist may call this
    # for themselves regardless of role (see resolvers/forms.js's getMyFormLinks), which is what
    # lets a plain shop-connected artist (not shop_admin) see their own shop's published form
    # links in their own Settings without needing management authority over the shop's forms.
    getMyFormLinks: [FormLinkSummary!]!
    # SELF-SCOPED the other way - not an artist looking at their own shop's links, but a CLIENT
    # looking at what they themselves can fill out. Published forms only, from shops in the
    # caller's own Client.shopIds and artists they share a Project with (see resolvers/forms.js's
    # getMyFillableForms and utils/shop-membership.js's clientBelongsToFormOwner). Empty for a
    # caller with no Client record of their own, never an error.
    getMyFillableForms: [Form!]!
    getFormResponses(formId: ID!, page: PageInput): FormResponsePage!
    getFormResponse(formResponseId: ID!): FormResponse!
    getFormAnalytics(formId: ID!): FormAnalytics!
  }
  type Mutation {
    ######### Shared images (client-dashboard message-image triage) #########
    # Files a client-shared image onto one of a project's three image lists (REFERENCE, DESIGN,
    # or BODY - matching Project's own referenceImages/designImages/bodyImages). Copies the URL
    # into that list (not a move - see models/SharedImage.js on why this stays in the
    # client-dashboard list too, badged rather than removed) and stamps the assignment onto the
    # SharedImage row. projectId must belong to the same client as the image, or this refuses.
    assignSharedImageToProject(sharedImageId: ID!, projectId: ID!, imageType: String!): SharedImage!
    # Replaces a shared image's tags wholesale, same "send the complete array" convention as
    # updateProject's own image-tag path (client/src/pages/projects/Project.jsx's
    # handleImageTagsUpdate).
    updateSharedImageTags(sharedImageId: ID!, tags: [String!]!): SharedImage!
    # Removes this row from the client-dashboard list ONLY - unlike the project image lists'
    # own "Delete" (client/src/components/ibImagesList/IBImagesListOptions.jsx), this does NOT
    # delete the underlying file or touch the original message: that image is still real chat
    # history and deleting the file would break its thumbnail there too. This just stops
    # surfacing it as something needing a decision.
    removeSharedImageFromList(sharedImageId: ID!): Boolean!

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
      # PERCENTAGE (default) or BOOTH_RENT. Switching an artist to booth rent is a rate change
      # like any other - see models/ShopCutRate.js - so it's this same append-only mutation, with
      # percent conventionally 0 on a BOOTH_RENT row. Set the artist's own terms afterward (or in
      # the same client action) via setBoothRentPlan below.
      compensationModel: String
      effectiveFrom: DateTime
      note: String
    ): ShopCutRate!
    # Records new booth-rent terms for an artist at a shop, from a date forward. APPEND-ONLY, same
    # reasoning as setShopCutRate above. SHOP ADMIN ONLY - the artist reads it (getBoothRentPlans),
    # never sets it, for the same reason they never set their own shop-cut percentage.
    setBoothRentPlan(
      artistId: ID!
      shopId: ID!
      amountCents: Int!
      dueDayOfMonth: Int!
      effectiveFrom: DateTime
    ): BoothRentPlan!
    # The artist's own claim that this month's rent is paid - does NOT settle it. See
    # confirmBoothRentPaid below, the shop's independent half of this dual-control flow (mirrors
    # markShopCutPaidManually/confirmShopCutPaid exactly).
    markBoothRentPaidManually(boothRentChargeId: ID!): BoothRentCharge!
    # The shop's independent confirmation. Creates the real Expense (the artist's own books) and
    # Income (the shop's own books) rows and stamps their ids onto the charge - see
    # utils/booth-rent.js and mutations/boothRentPayments.js.
    confirmBoothRentPaid(boothRentChargeId: ID!): BoothRentCharge!
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
    # Self-service, shop_admin-or-better OF THIS SHOP only - see mutations/shops.js. Separate from
    # updateShop for the same reason updateMyBookingSlug is separate from updateArtist: this is the
    # one field a shop admin sets about the shop's own public link, not a generic profile edit.
    # Pass an empty string to remove it. Mirrors Artist.bookingSlug/updateMyBookingSlug.
    updateMyShopFormSlug(shopId: ID!, slug: String!): Shop!
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

    ######### Adjustments ###########
    # DECISIONS.md M4 - a documented reversal, recorded AFTER the real reversal already happened
    # by hand in the Square app. See models/Adjustment.js and resolvers/adjustments.js. Same
    # authority shape as everywhere else this file writes money-adjacent history: the appointment's
    # own artist, or a shop admin who shares a shop with them (utils/shop-membership.js's
    # canManageArtist) - which is exactly "shop-admin only where there is a shop."
    recordAdjustment(input: RecordAdjustmentInput!): Adjustment!

    ######### Gift cards ###########
    # See DECISIONS.md M6, models/GiftCard.js, graphql/resolvers/giftCards.js.

    createArtistGiftCard(input: CreateArtistGiftCardInput!): GiftCard!
    createShopGiftCard(input: CreateShopGiftCardInput!): GiftCard!
    # appointmentId + code + amountCents - applies against computeChargeBreakdown's giftCardCents
    # slot (utils/charge-quote.js) for that appointment's eventual charge. Enforces the
    # artist-issued lock and the shop-issued "at this shop" scope - see resolvers/giftCards.js.
    redeemGiftCard(appointmentId: ID!, code: String!, amountCents: Int!): RedeemGiftCardResult!
    # Mirrors createShopCutInvoice/markShopCutPaidManually/confirmShopCutPaid exactly, for a
    # GiftCard's shop-cut settlement instead of an Appointment's - see models/GiftCard.js's own
    # comment on why the same field shape and the same dual-control machinery apply to both.
    createGiftCardShopCutInvoice(giftCardId: ID!, paymentMethod: String): GiftCardShopCutInvoiceResult!
    markGiftCardShopCutPaidManually(giftCardId: ID!): GiftCard!
    confirmGiftCardShopCutPaid(giftCardId: ID!): GiftCard!

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
      bodyImages: [IBImageInput]
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
    # Hand-raises a flag - see models/ClientFlag.js and utils/client-flags.js's raiseClientFlag.
    # Always systemGenerated: false; the automatic path (NO_SHOWED) is only ever reached from an
    # appointment's own status changing, never from here. Refuses a systemGenerated typeKey itself
    # (raiseClientFlag does), same as it refuses an unknown one.
    raiseClientFlag(input: RaiseClientFlagInput!): ClientFlag!
    # Resolves ONE flag by its own id - not restricted to manually-raised ones, see
    # utils/client-flags.js's resolveClientFlag for why. A no-op (returns the flag unchanged) if it
    # was already resolved, rather than an error.
    resolveClientFlag(flagId: ID!): ClientFlag!

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
    # Every argument optional and applied only when sent - a save that only touches one field must
    # not reset the others. Template fields are nullable so a caller can explicitly reset one back
    # to the built-in default (null) as a distinct instruction from leaving it alone (omitted) -
    # see models/ReminderSettings.js.
    updateReminderSettings(
      emailEnabled: Boolean
      smsEnabled: Boolean
      rules: [ReminderRuleInput!]
      emailSubjectTemplate: String
      emailBodyTemplate: String
      smsTemplate: String
    ): ReminderSettings!
    markNotificationsRead(notificationIds: [ID!]): Int!
    # Handled, not merely seen. See models/Notification.js on why these are different.
    markNotificationsDone(notificationIds: [ID!]!): Int!
    markConversationRead(conversationId: ID!): Conversation!
    # The reverse of markConversationRead - see conversation-reads.js's markConversationUnreadForUser
    # for why this needs no new storage. Idempotent on an already-unread conversation.
    markConversationUnread(conversationId: ID!): Conversation!
    # No createdAt/updatedAt. The server stamps them - a message's timestamp decides where it sits
    # in the thread and whether it counts as unread, and neither may be caller-controlled. See
    # mutations/messages.js.
    #
    # message is no longer required - an image-only message (imageUrls set, no text) is a real
    # case now. At least one of the two must be non-empty; enforced in
    # utils/validation.js's createMessageInputSchema, which can see both fields at once.
    # imageUrls are already-uploaded URLs from POST /message-uploads (routes/messageUploads.js) -
    # never raw file data through GraphQL, matching how Form file_upload fields work.
    createMessage(
      conversationId: ID!
      senderId: ID!
      message: String
      imageUrls: [String!]
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

    ######### Expenses, income, recurring expenses ###########
    # See the Query section's own header for the ownership/authorization model shared by all of
    # these - resolvers/expenses.js and resolvers/income.js.
    createExpenseType(input: CreateExpenseTypeInput!): ExpenseType!
    updateExpenseType(input: UpdateExpenseTypeInput!): ExpenseType!
    createIncomeType(input: CreateIncomeTypeInput!): IncomeType!
    updateIncomeType(input: UpdateIncomeTypeInput!): IncomeType!
    recordExpense(input: RecordExpenseInput!): Expense!
    updateExpense(input: UpdateExpenseInput!): Expense!
    deleteExpense(expenseId: ID!): Boolean!
    recordIncome(input: RecordIncomeInput!): Income!
    updateIncome(input: UpdateIncomeInput!): Income!
    deleteIncome(incomeId: ID!): Boolean!
    # See models/RecurringExpense.js - creating one does NOT immediately write an Expense; the
    # first occurrence is generated by the scheduler once nextRunDate (== startDate at creation)
    # is actually due, the same as every later occurrence.
    createRecurringExpense(input: CreateRecurringExpenseInput!): RecurringExpense!
    # Editing amountCents/description/frequency here changes the TEMPLATE going forward only -
    # occurrences already generated as real Expense rows are untouched (edit those directly). See
    # resolvers/expenses.js for what happens to nextRunDate when frequency changes mid-cycle.
    updateRecurringExpense(input: UpdateRecurringExpenseInput!): RecurringExpense!
    # Deletes the template. Already-generated Expense rows are real, independent records (see
    # models/Expense.js) and are NOT deleted with it - this only stops future generation, which is
    # also exactly what setting active: false via updateRecurringExpense does. Provided anyway
    # because "this was a mistake, it should never have existed" is a different intent from
    # "pause it", and forcing a pause to stand in for a delete would leave a dead template on
    # every list forever.
    deleteRecurringExpense(recurringExpenseId: ID!): Boolean!

    ######### Auto-Responses ###########
    # See the Query section's own header for the shared ownership/authorization model -
    # resolvers/autoResponses.js. archiveAutoResponse is deactivate-not-delete, same convention as
    # ExpenseType/Form (see models/AutoResponse.js) - AutoResponseLog rows keep referencing it by
    # id. sendAutoResponseNow is the manual "Send a message" action - appointmentId is optional,
    # since a manual send is not always tied to one (see models/AutoResponseLog.js).
    createAutoResponse(input: CreateAutoResponseInput!): AutoResponse!
    updateAutoResponse(input: UpdateAutoResponseInput!): AutoResponse!
    archiveAutoResponse(autoResponseId: ID!): AutoResponse!
    sendAutoResponseNow(autoResponseId: ID!, clientId: ID!, appointmentId: ID): Boolean!

    ######### Response-time settings (Feature 3 - unanswered-message nudges) ###########
    # See resolvers/responseTimeSettings.js. shopId inside the input is nullish, same
    # resolveBusinessOwner convention as CreateAutoResponseInput - omit for the caller's own
    # personal scope. Upserts, same as updateReminderSettings - there is no separate create step.
    updateResponseTimeSettings(input: UpdateResponseTimeSettingsInput!): ResponseTimeSettings!

    ######### System message templates (Feature 2 - manageable system-generated text) #########
    # See resolvers/systemMessageTemplates.js. shopId nullish in both, same resolveBusinessOwner
    # convention as CreateAutoResponseInput - omit for the caller's own personal scope.
    # updateSystemMessageTemplate upserts by (owner, key) - there is no separate create step.
    # resetSystemMessageTemplate deletes the override row outright, returning to the built-in
    # default - see models/SystemMessageTemplate.js's own comment on why absence, not a null
    # field, IS the reset state here.
    updateSystemMessageTemplate(input: UpdateSystemMessageTemplateInput!): SystemMessageTemplate!
    resetSystemMessageTemplate(shopId: ID, key: String!): Boolean!

    ######### Forms (consent/waiver/intake) ###########
    # See getForm's own header comment above for the ownership model. createForm/updateForm never
    # touch status or allowGuestSubmissions - see UpdateFormInput's own comment for why those are
    # separate, explicit actions below rather than two more fields on a generic PATCH.
    createForm(input: CreateFormInput!): Form!
    updateForm(input: UpdateFormInput!): Form!
    publishForm(formId: ID!): Form!
    # Reversible - an archived form can be published again, unlike deleteForm below. Hides it from
    # the default getForms list and (if it had one) from its public link, without losing anything -
    # a form that already has real signed responses on file should never actually disappear.
    archiveForm(formId: ID!): Form!
    # Mints a publicToken the first time this turns true (see models/Form.js's own comment on why
    # it's minted once, not regenerated on every toggle) and leaves it alone on every later flip.
    setFormGuestAccess(formId: ID!, allow: Boolean!): Form!
    # Refused once ANY FormResponse references this form - a signed waiver is exactly the kind of
    # record this app must never let disappear by accident (see models/FormResponse.js's own header
    # comment on why responses keep their own title/field snapshot independent of the Form). Use
    # archiveForm instead; deleteForm only ever removes a form nobody has actually filled out yet.
    deleteForm(formId: ID!): Boolean!
    # The booking_request system form's own RESTRICTED editor - see BookingRequestFieldInput's own
    # comment and resolvers/forms.js's updateBookingRequestFields for the exact-key-set guarantee.
    # Refuses any formId that isn't systemKey 'booking_request' - this is not a second way to edit
    # a generic form, use updateForm for those.
    updateBookingRequestFields(formId: ID!, fields: [BookingRequestFieldInput!]!): Form!
    # Works both authenticated (an existing Client, or staff filling one out on their behalf) and,
    # when the form's allowGuestSubmissions is true, unauthenticated via a public link - see
    # resolvers/forms.js for the shared find-or-create-guest-client path this takes from
    # createBookingRequest. Every REQUIRED field (per the form's live definition at submission time)
    # must have a real answer or this is refused - see FormField.required.
    submitFormResponse(input: SubmitFormResponseInput!): FormResponse!
  }
`;
