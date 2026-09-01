// A client-generated Mongo-style id - 24 hex characters (12 bytes), matching what web's
// `new ObjectID()` (the bson package) produces for a new IBNote's id before it's ever sent to the
// server (see Project.jsx's handleNotesUpdate). The server remaps this straight onto the note
// subdocument's real _id (mongoose.Schema.Types.ObjectId - see
// server/graphql/mutations/projects.js's remapIdToMongoId comment), which only requires 12 bytes
// of valid hex, not bson's specific timestamp/counter encoding - a random 24-hex string satisfies
// Mongoose's cast exactly as well as a real ObjectId does, without adding bson (a Node
// Buffer-oriented package with no React Native build) as a mobile dependency for one field.
export function generateObjectId(): string {
  let hex = '';
  for (let i = 0; i < 12; i++) {
    hex += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return hex;
}
