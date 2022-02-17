const { gql } = require('apollo-server');

module.exports = gql`
  scalar Date
  type Artist {
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
  type Shop{
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
  }
  type Client {
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
  type Staff {
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
  type Project {
    id: ID!
    title: String!
    description: String!
    artistId: ID!
    artist: Artist
    clientId: ID!
    client: Client
    referenceImages: [String]
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
  }
`;
