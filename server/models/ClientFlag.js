const mongoose = require('mongoose');

/**
 * A recorded fact about a client's conduct.
 *
 * ---------------------------------------------------------------------------------------------
 * SHAPED FOR SEARCH, because that is what it is for. The question is never "show me this flag" -
 * it is "has this person no-showed before", asked while somebody is deciding whether to book them.
 * So the index is on (client, type) and the counters live on Client, denormalised, precisely so an
 * appointment list can render a badge per row without a join per row.
 *
 * RESOLVED, NEVER DELETED. Un-marking a session as a no-show sets resolvedAt; it does not remove
 * the row. The history is the point - "we marked this and then took it back" is a different fact
 * from "this never happened", and only one of them is true. It also means a client who disputes a
 * flag leaves a trail rather than a gap.
 *
 * WHO CAN SEE IT is not decided here. Flags follow the same rule as every other piece of client
 * information: a shop sees a client's record while the artist is connected, and an artist keeps
 * what was collected during that period (DECISIONS.md S1). Reads go through canAccessClient, the
 * same helper the rest of the client boundary uses - a second rule written here would eventually
 * disagree with it.
 *
 * NEVER CLIENT-VISIBLE. Same reasoning as session notes (C1): the value of "cancels a lot" depends
 * entirely on it being a candid internal record rather than a message to the person it is about.
 * ---------------------------------------------------------------------------------------------
 */
const clientFlagSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, required: true },

  // The type's KEY, not its _id. A flag is read far more often than a type is edited, and every
  // read wants the key to render a badge - storing the id would mean a lookup per flag to discover
  // a string that never changes. The key is the stable identifier for exactly this reason (see
  // models/ClientFlagType.js).
  typeKey: { type: String, required: true, uppercase: true, trim: true },

  // What the flag is ABOUT. Nullable: a manual "always late" is about a person, not an event.
  // Present for anything auto-generated, because a system-raised flag with no evidence behind it
  // is an assertion nobody can check.
  appointmentId: { type: mongoose.Schema.Types.ObjectId, default: null },

  // Which shop's record this is, for scoping and for provenance after a disconnect. Null for a
  // flag raised by an independent artist.
  shopId: { type: mongoose.Schema.Types.ObjectId, default: null },

  // Null for a system-raised flag. Deliberately NOT defaulted to the artist: attributing an
  // automatic record to a person who didn't type it is the same lie setShopCutRate refuses to
  // tell about a rate change.
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  systemGenerated: { type: Boolean, default: false },

  note: { type: String, default: '' },

  // Set when the flag stops applying - a no-show that was un-marked, or a manual flag somebody
  // decided no longer reflects the client. Null means it still counts.
  resolvedAt: { type: Date, default: null },
  resolvedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },

  createdAt: { type: Date, required: true, default: Date.now },
});

// THE search index: this client's flags of this type. Covers both "does this client have any
// flags" and "has this client no-showed".
clientFlagSchema.index({ clientId: 1, typeKey: 1, resolvedAt: 1 });
// Shop-wide reporting - "every no-show at this shop this quarter".
clientFlagSchema.index({ shopId: 1, typeKey: 1, createdAt: -1 });

// ONE UNRESOLVED SYSTEM FLAG PER APPOINTMENT PER TYPE.
//
// Marking a session no-show, un-marking it, and marking it again must not leave two live
// no-showed flags against the same sitting. Partial on unresolved rows only, so the resolved
// history can accumulate freely - which is the entire point of resolving rather than deleting.
clientFlagSchema.index(
  { appointmentId: 1, typeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      appointmentId: { $type: 'objectId' },
      resolvedAt: null,
    },
  },
);

module.exports = mongoose.model('ClientFlag', clientFlagSchema);
