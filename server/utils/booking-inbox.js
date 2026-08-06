const BookingRequest = require('../models/BookingRequest');

/**
 * What is sitting in an artist's Booking Requests inbox, defined once.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT A FILTER WRITTEN TWICE
 *
 * Two things ask this question: the list on the Booking Requests page, and the badge on the nav
 * item that leads to it. A badge is a promise that a list will have something in it. If the two are
 * written separately they will eventually disagree, and the failure is the worst kind - a red "3"
 * over a page that opens empty, or an empty nav item over three people waiting on an answer. The
 * first burns the credibility of every other number in the app; the second loses work.
 *
 * utils/conversation-routing.js makes the same argument for the same reason, one layer over. Same
 * rule here.
 * ---------------------------------------------------------------------------------------------
 *
 * WHY `source: 'public_form'`
 *
 * Requests an artist generated for their own calendar through the appointment wizard carry
 * source: 'artist_created'. They are a bookkeeping record of something that already happened, not a
 * lead waiting to be triaged, and they have never been in this inbox. Counting them would badge an
 * artist for work they just booked themselves.
 */

/**
 * The inbox filter for one artist.
 *
 * @param {string} artistId
 * @param {string[]} [statuses] - defaults to BookingRequest.INBOX_STATUSES, currently ['pending'].
 *
 * The default is the point: an inbox with no explicit filter means "the things I still owe someone
 * an answer on". Everything else - booked, declined, not booked - is reachable through the page's
 * filter control but is not what the nav item counts.
 */
function bookingInboxFilter(artistId, statuses) {
  const requested = Array.isArray(statuses) && statuses.length > 0 ? statuses : null;
  return {
    artistId,
    source: 'public_form',
    status: { $in: requested || BookingRequest.INBOX_STATUSES },
  };
}

/**
 * How many requests this artist still owes an answer on.
 *
 * DELIBERATELY NOT AN UNREAD-MESSAGE COUNT, which is what this badge used to be. Those are
 * different questions and only one of them belongs on this nav item:
 *
 *   - "have I read it" is answered by opening the thread. The badge cleared while the request was
 *     still pending and still undecided, so the one number telling an artist that somebody was
 *     waiting disappeared the moment they glanced at it.
 *   - "do I owe somebody a decision" only changes when the request's status changes, which is the
 *     thing the page is actually for.
 *
 * It was also structurally zero for the case that matters most. createBookingRequest writes a
 * Conversation and a BookingRequest but NO Message - the intake text lives on
 * BookingRequest.description - so a brand new request had nothing to be unread, and the badge
 * stayed blank until the client happened to send a follow-up. A count with the right definition
 * cannot have that failure mode, because it counts the request itself.
 *
 * Nothing is lost by dropping the unread signal: a request that gets booked graduates out of this
 * inbox into Messages (see utils/conversation-routing.js), and the Messages badge does count
 * unread replies on it.
 */
async function pendingBookingRequestCount(artistId) {
  return BookingRequest.countDocuments(bookingInboxFilter(artistId));
}

module.exports = { bookingInboxFilter, pendingBookingRequestCount };
