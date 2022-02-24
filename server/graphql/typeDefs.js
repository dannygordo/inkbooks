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
    billingType: Int
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
    billingType: Int
    status: Int
  }
  type User {
    id: ID!
    email: String!
    username: String!
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
    url: String!
    title: String
    uploadedByDisplayName: String
    avatar: String
	  tags: [String]
    createdAt: DateTime
    updatedAt: DateTime
  }
  input IBImageInput {
    url: String!
    title: String
    uploadedByDisplayName: String
    avatar: String
	  tags: [String]
    createdAt: DateTime
    updatedAt: DateTime
  }
  type Project {
    id: ID!
    title: String!
    description: String!
    artistId: ID!
    artist: Artist
    clientId: ID!
    client: Client
    referenceImages: [IBImage]
    bodyImages: [String]
    designImages: [String]
    materialsUsed: [String]
    notes: [String]
    tags: [String]
    status: Int!
    depositAmount: Int
  }
  input ProjectInput {
    id: ID!
    title: String!
    description: String!
    artistId: ID!
    clientId: ID!
    referenceImages: [IBImageInput]
    bodyImages: [String]
    designImages: [String]
    materialsUsed: [String]
    notes: [String]
    tags: [String]
    status: Int!
    depositAmount: Int
  }
  input RegisterInput {
    username: String!
    email: String!
    password: String!
    confirmPassword: String!
    role: Int!
    userType: String!
  }
  type Query {
    getArtists: [Artist]
    getArtist(artistId: ID!): Artist
    getShops:[Shop]
    getShop(shopId: ID!): Shop
    getStaff: [Staff]
    getOneStaff(staffId: ID!): Staff
    getClients: [Client]
    getClient(clientId: ID!): Client
    getUsers: [User]
    getUser(userId: ID!): User
    getProjects: [Project]
    getProject(projectId: ID!): Project
  }
  type Mutation {
    register(registerInput: RegisterInput): User!
    login(username: String!, password: String!): User!
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
      artistId: ID!
      clientId: ID!
      referenceImages: [String]
      bodyImages: [String]
      designImages: [String]
      materialsUsed: [String]
      notes: [String]
      tags: [String]
      status: Int!
      depositAmount: Int
    ): Project!
    deleteProject(projectId: ID!): String!
    updateProject(project: ProjectInput): Project
  }
`;
