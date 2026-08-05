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
    # access/refresh tokens (see models/Shop.js) never leave the server.
    squareConnected: Boolean
    squareLocationId: String
    squareConnectedAt: DateTime
  }
  input UserUpdateInput {
    id: ID!
    email: String!
    username: String!
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
    email: String!
    username: String!
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
    disconnectedAt: DateTime
    # Which side's rate (shop's or the artist's own) this artist's sessions bill against at this
    # shop - see models/ArtistShopConnection.js's comment for the full reasoning.
    rateSource: String!
    # Per-artist override of Shop.shopCutPercent. Null means "use the shop's rate", which is a
    # different thing from 0 ("this artist owes nothing") - see utils/shop-cut.js.
    shopCutPercent: Int
    createdAt: DateTime
    updatedAt: DateTime
  }
  # Deliberately narrow - see getPublicArtistProfile in resolvers/bookingRequests.js for why this
  # isn't just the full Artist/User type.
  type PublicArtistProfile {
    id: ID!
    firstName: String!
    lastName: String!
    avatar: String
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
    # DEPRECATED - whole dollars, from before the move to integer cents, no longer written by
    # anything. Use depositCollectedCents/depositAvailableCents below, which read the real
    # deposit off the appointment that collected it. See models/Project.js.
    depositAmount: Int
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
    depositAmount: Int
  }
  input RegisterInput {
    username: String!
    email: String!
    firstName: String!
    lastName: String!
    avatar: String
    password: String!
    confirmPassword: String!
    role: Int!
    userType: String!
    tagColor: String
  }
  input AppointmentInput {
    id: ID
    appointmentDate: DateTime!
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
    # Required - a staff member with no shop has nothing to administer.
    shopId: ID!
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
  type ClientAccountResult {
    client: Client!
    isNewAccount: Boolean!
  }

  type Query {
    ######### Appointments ############

    getAppointmentsByShop(shopId: ID!): [Appointment]
    getAppointmentsByArtist(userId: ID!): [Appointment]
    getAppointment(appointmentId: ID!): Appointment
    getAppointmentsByProject(projectId: ID!): [Appointment]

    ######### Shop-cut ledger ###########
    # See PRODUCTION_ROADMAP.md's "Shop-cut ledger" section.

    getSquareAuthorizationUrl(shopId: ID!): String!
    getPendingShopCutConfirmations(shopId: ID!): [Appointment]

    ######### Artists ###########

    # includeArchived: archived people have to stay reachable or unarchiving them is impossible -
    # there'd be no way to find who you wanted back. Hidden by default, askable for. See
    # utils/archiving.js.
    getArtists(includeArchived: Boolean): [Artist]
    getArtist(artistId: ID!): Artist
    getArtistsByShop(shopId: ID!): [Artist]

    ######### Shops ###########

    getShops:[Shop]
    getShop(shopId: ID!): Shop

    ######### Staff ###########
    
    getStaff(includeArchived: Boolean): [Staff]
    getOneStaff(staffId: ID!): Staff
    
    ######### Clients ###########
    
    getClients(includeArchived: Boolean): [Client]
    getClient(clientId: ID!): Client
    
    ######### Users ###########
    
    getUser(userId: ID!): User
    getUserTagColors(shopId: ID!): [User]
    
    ######### Projects ###########
    
    getProjects: [Project]
    getProjectsByArtist(artistId: ID!): [Project]
    getProject(projectId: ID!): Project

    ######### Conversations ###########

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
    getPublicArtistProfile(artistId: ID!): PublicArtistProfile
    # Artist-only (withAuth) - the artist's own dashboard list, not the guest-facing side.
    getBookingRequests(artistId: ID!): [BookingRequest]
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
    # Archiving is what "remove this person" means. It sets a status and touches nothing else:
    # their projects, appointments and the money on those appointments are untouched, still count
    # toward revenue, and still render on the calendar. What changes is that they stop appearing
    # in the directories and pickers. See utils/archiving.js.
    archiveArtist(artistId: ID!): Artist
    unarchiveArtist(artistId: ID!): Artist
    archiveStaff(staffId: ID!): Staff
    unarchiveStaff(staffId: ID!): Staff
    archiveClient(clientId: ID!): Client
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

    register(registerInput: RegisterInput): User!
    login(username: String!, password: String!): User!
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
      depositAmount: Int
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
    recordDeposit(appointmentId: ID!, depositCents: Int!): Appointment
    # Spends an available deposit against a session, exactly once. Reduces that session's total
    # and recomputes its shop cut on the reduced figure.
    applyDeposit(depositAppointmentId: ID!, targetAppointmentId: ID!): Appointment
    updateProjectTags(tags: [String], projectId: ID!): Project

    ######### Conversations ###########

    createConversation(
      members: [ID!]
      createdAt: DateTime
      updatedAt: DateTime
    ): Conversation!
    updateConversation(conversation: ConversationInput): Conversation

    ######### Messages ###########

    createMessage(
      conversationId: ID!
      senderId: ID!
      message: String!
      createdAt: DateTime
      updatedAt: DateTime
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
