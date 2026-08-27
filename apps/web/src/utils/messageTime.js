import moment from "moment";

/**
 * How a message's time is written, in one place.
 *
 * Two surfaces render message threads - the messenger and the booking-request detail pane - and
 * they had two different answers: IBMessage used moment().fromNow() and the booking-request thread
 * had no timestamp at all. Anything defined twice eventually disagrees, and a thread where the
 * same message reads "2 days ago" in one view and nothing in the other is the kind of small
 * inconsistency that makes people distrust the bigger numbers on the page.
 *
 * Relative time alone ("3 days ago") is wrong for this app specifically. Artists schedule against
 * a calendar, and "did they confirm before or after I booked the Tuesday consult?" is a question
 * relative time cannot answer. So: recent messages get the time of day, this week gets a weekday,
 * anything older gets a date. The full timestamp is always available on hover via
 * fullMessageTime().
 */

/** The short label under a message bubble. */
export function prettyMessageTime(value) {
  // moment(undefined) silently means "now", so an absent createdAt would render as the current
  // time rather than as an obvious gap. Worth catching: the optimistic message built in
  // IBChatBox used to omit createdAt entirely, which looked correct only because a just-sent
  // message really is "now".
  if (!value) {
    return "";
  }
  const at = moment(value);
  if (!at.isValid()) {
    return "";
  }

  const now = moment();
  if (at.isSame(now, "day")) {
    return at.format("h:mm A");
  }
  if (at.isSame(now.clone().subtract(1, "day"), "day")) {
    return `Yesterday ${at.format("h:mm A")}`;
  }
  // Inside the last week a weekday is more useful than a date - "Tue 2:14 PM" places a message in
  // the working week, which is how appointments get discussed.
  if (at.isAfter(now.clone().subtract(6, "days"))) {
    return at.format("ddd h:mm A");
  }
  if (at.isSame(now, "year")) {
    return at.format("MMM D, h:mm A");
  }
  return at.format("MMM D YYYY, h:mm A");
}

/** The unabbreviated version, for a title attribute. */
export function fullMessageTime(value) {
  if (!value) {
    return "";
  }
  const at = moment(value);
  return at.isValid() ? at.format("dddd, MMMM D YYYY [at] h:mm A") : "";
}
