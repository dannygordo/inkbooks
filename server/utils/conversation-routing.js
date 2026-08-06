const BookingRequest = require('../models/BookingRequest');
const { toObjectId } = require('./object-id');

/**
 * Which section of the app owns a conversation, defined once.
 *
 * A thread has exactly one home. A booking request that nobody has decided on yet lives in Booking
 * Requests; once it's booked as a consult or a session it graduates to Messages, because at that
 * point it has stopped being a lead to triage and become a client relationship. Conversations with
 * no booking request behind them at all - project threads, staff DMs - are always Messages.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS ONE FUNCTION AND NOT A `WHERE` CLAUSE IN TWO PLACES
 *
 * Three things ask this question: the conversation list, the unread badge on the Messages nav, and
 * the unread badge on Booking Requests. If the list and the badge answer it separately they will
 * eventually disagree, and the way that surfaces is the worst possible one: a badge reading "2
 * unread" over a list containing nothing. A counter pointing at something you cannot open is worse
 * than no counter, because it burns the credibility of every other number on the page.
 *
 * This codebase has paid for the two-copies pattern repeatedly - Artist.shopId vs.
 * ArtistShopConnection, Project.depositAmount vs. the appointment holding the money, the Square app
 * id in two halves of the repo. Same shape, so: one definition.
 * ---------------------------------------------------------------------------------------------
 *
 * WHY THE RULE IS PER-VIEWER
 *
 * Hiding a thread is only safe if the viewer has somewhere else to see it. The ARTIST has a Booking
 * Requests page, so hiding a pending request's thread from their Messages just moves it. The CLIENT
 * does not - they have Messages and a magic link and nothing else. Hiding it from them would make
 * the conversation unreachable in the app entirely.
 *
 * So this keys off the request's own artistId rather than off conversation membership: a thread is
 * withheld from Messages only for the artist whose inbox it is sitting in. Same reasoning as
 * message-notifications.js deciding which email to send by what the recipient can actually reach.
 */

/**
 * Conversation ids that belong to this viewer's BOOKING REQUESTS section rather than to Messages.
 *
 * One query, returning ids rather than a filter, because both callers need to use it differently -
 * one excludes them, the other counts only them.
 */
async function bookingInboxConversationIds(userId) {
  const rows = await BookingRequest.find({
    artistId: toObjectId(userId),
    // Everything that has NOT been booked: pending, declined, not_booked. Expressed as "not the
    // booked ones" rather than by listing three statuses, so adding a status defaults it to
    // staying in the booking inbox - the conservative direction. A new status silently appearing
    // in Messages, where there is no way to act on it, would be the worse failure.
    status: { $nin: BookingRequest.BOOKED_STATUSES },
    // Requests the artist generated for their own calendar were never in the inbox to begin with
    // (getBookingRequests filters on this), so withholding their threads from Messages would hide
    // them from BOTH places.
    source: 'public_form',
  }).select('conversationId');

  return rows.map((r) => String(r.conversationId));
}

module.exports = { bookingInboxConversationIds };
