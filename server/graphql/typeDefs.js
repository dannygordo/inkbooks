const { gql } = require('apollo-server');

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
    shopId: ID!
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
    logo: String
    billingType: String
    status: Int
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
    status: Int!
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
    status: Int!
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
  }
  type Appointment {
    id: ID!
    projectId: ID
    project: Project
    userId: ID
    userInfo: User
    title: String
    description: String
    total: Int
    tip: Int
    shopCutStatus: String!
    appointmentType: String!
    appointmentStatus: String!
  }
  type Query {
    getArtists: [Artist]
    getArtist(artistId: ID!): Artist
    getArtistsByShop(shopId: ID!): [Artist]
    getShops:[Shop]
    getShop(shopId: ID!): Shop
    getStaff: [Staff]
    getOneStaff(staffId: ID!): Staff
    getClients: [Client]
    getClient(clientId: ID!): Client
    getUsers: [User]
    getUser(userId: ID!): User
    getAppointmentsByShop(userIds: [ID!]): [Appointment]
    getAppointmentsByUser(userId: ID!): [Appointment]
    getProjects: [Project]
    getProjectsByArtist(artistId: ID!): [Project]
    getProject(projectId: ID!): Project
    getConversation(conversationId: ID!): Conversation
    getConversationsByShopId(shopId: ID!): [Conversation!]
    getProjectConversation(artistId: ID!, clientId: ID!): Conversation
    getConversations: [Conversation]
    getConversationsByMemberId(memberId: ID!): [Conversation]
    getMessages: [Message]
    getMessage(messageId: ID!): Message
    getMessagesByConversationId(conversationId: ID!): [Message!]
  }
  type Mutation {
    register(registerInput: RegisterInput): User!
    login(username: String!, password: String!): User!
    updateUser(user: UserUpdateInput): User!
    forgotPassword(username: String!, password: String!): User!
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
    ): Staff!
    deleteStaff(staffId: ID!): String!
    updateStaff(staff: StaffInput): Staff
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
      status: Int!
      depositAmount: Int
    ): Project!
    deleteProject(projectId: ID!): String!
    updateProject(project: ProjectInput): Project
    updateProjectNotes(notes: [IBNoteInput], projectId: ID!): Project
    updateProjectTags(tags: [String], projectId: ID!): Project

    createConversation(
      members: [ID!]
      createdAt: DateTime
      updatedAt: DateTime
    ): Conversation!
    deleteConversation(conversationId: ID!): String!
    updateConversation(conversation: ConversationInput): Conversation

    createMessage(
      conversationId: ID!
      senderId: ID!
      message: String!
      createdAt: DateTime
      updatedAt: DateTime
    ): Message!
    deleteMessage(messageId: ID!): String!
    updateMessage(message: MessageInput): Message
  }
`;
