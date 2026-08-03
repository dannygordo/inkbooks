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
    depositAmount: Int
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
    total: Int
    tip: Int
    shopCutStatus: String
    shopCutAmount: Int
    appointmentType: String
    appointmentStatus: String
    createdAt: DateTime
    updatedAt: DateTime
    # Deliberately NOT timerStatus/timerStartedAt/accumulatedSeconds - see models/Appointment.js's
    # comment on why those are only ever changed via the dedicated startSessionTimer/
    # stopSessionTimer/resetSessionTimer mutations, never through this generic update input.
    sessionNotes: String
  }

  type Appointment {
    id: ID!
    appointmentDate: DateTime!
    projectId: ID
    project: Project
    # Was ID! - broke serialization for independent artists (no shop, so no shopId at all).
    # models/Appointment.js's Mongoose schema never required this; the GraphQL type just hadn't
    # been fixed to match until now.
    shopId: ID
    shop: Shop
    userId: ID
    user: User
    title: String
    description: String
    total: Int
    tip: Int
    shopCutStatus: String!
    # Shop-cut ledger fields - see PRODUCTION_ROADMAP.md's "Shop-cut ledger" section.
    shopCutAmount: Int
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

    getArtists: [Artist]
    getArtist(artistId: ID!): Artist
    getArtistsByShop(shopId: ID!): [Artist]

    ######### Shops ###########

    getShops:[Shop]
    getShop(shopId: ID!): Shop

    ######### Staff ###########
    
    getStaff: [Staff]
    getOneStaff(staffId: ID!): Staff
    
    ######### Clients ###########
    
    getClients: [Client]
    getClient(clientId: ID!): Client
    
    ######### Users ###########
    
    getUsers: [User]
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
    getConversations: [Conversation]
    getConversationsByMemberId(memberId: ID!): [Conversation]

    ######### Messages ###########

    getMessages: [Message]
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
  }
  type Mutation {
    ######### Appointments ############
    createAppointment(appointmentInput: AppointmentInput): Appointment
    updateAppointment(appointmentInput: AppointmentInput): Appointment
    deleteAppointment(appointmentId: ID): String
    # Session timer controls - see models/Appointment.js's comment on why these are separate,
    # dedicated mutations rather than fields on the generic updateAppointment/AppointmentInput.
    # All three: Admin/SHOP_ADMIN-or-better, or the appointment's own artist - same ownership
    # shape as updateAppointment/deleteAppointment above.
    startSessionTimer(appointmentId: ID!): Appointment!
    stopSessionTimer(appointmentId: ID!): Appointment!
    resetSessionTimer(appointmentId: ID!): Appointment!

    ######### Artist-Shop Connections ###########
    connectArtistToShop(artistId: ID!, shopId: ID!): ArtistShopConnection!
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
    deleteArtist(artistId: ID!): String!
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
    deleteShop(shopId: ID!): String!
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
    deleteStaff(staffId: ID!): String!
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
    deleteClient(clientId: ID!): String!
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
    deleteProject(projectId: ID!): String!
    updateProject(project: ProjectInput): Project
    updateProjectNotes(notes: [IBNoteInput], projectId: ID!): Project
    updateProjectTags(tags: [String], projectId: ID!): Project

    ######### Conversations ###########

    createConversation(
      members: [ID!]
      createdAt: DateTime
      updatedAt: DateTime
    ): Conversation!
    deleteConversation(conversationId: ID!): String!
    updateConversation(conversation: ConversationInput): Conversation

    ######### Messages ###########

    createMessage(
      conversationId: ID!
      senderId: ID!
      message: String!
      createdAt: DateTime
      updatedAt: DateTime
    ): Message!
    deleteMessage(messageId: ID!): String!
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
