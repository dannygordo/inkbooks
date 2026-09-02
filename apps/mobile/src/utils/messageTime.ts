// Direct port of apps/web's utils/messageTime.js - see that file's own header comment for why
// this app specifically rejects plain relative time ("3 days ago") for message timestamps:
// artists schedule against a calendar, so "did they confirm before or after I booked the Tuesday
// consult?" needs a real time-of-day/weekday/date, not a rolling duration. utils/timeAgo.ts is a
// genuinely different case (image-upload relative time) and isn't reused here for that reason.
//
// Hand-rolled with toLocaleDateString/toLocaleTimeString, the same convention utils/appointments.ts
// already uses - no moment/dayjs dependency, matching timeAgo.ts's own "not worth the bundle
// weight for one label" reasoning.

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function timeOfDay(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** The short label under a message bubble. */
export function prettyMessageTime(value: string | Date | null | undefined): string {
  if (!value) {
    return '';
  }
  const at = toDate(value);
  if (Number.isNaN(at.getTime())) {
    return '';
  }

  const now = new Date();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);

  if (dayDiff === 0) {
    return timeOfDay(at);
  }
  if (dayDiff === 1) {
    return `Yesterday ${timeOfDay(at)}`;
  }
  // Inside the last week a weekday is more useful than a date - same threshold as web's own
  // `now.clone().subtract(6, "days")`.
  if (dayDiff > 1 && dayDiff <= 6) {
    return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${timeOfDay(at)}`;
  }
  if (at.getFullYear() === now.getFullYear()) {
    return `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${timeOfDay(at)}`;
  }
  return `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}, ${timeOfDay(at)}`;
}

/** The unabbreviated version, for a long-press/detail view - web's own fullMessageTime is a title attribute; mobile has no hover. */
export function fullMessageTime(value: string | Date | null | undefined): string {
  if (!value) {
    return '';
  }
  const at = toDate(value);
  if (Number.isNaN(at.getTime())) {
    return '';
  }
  return `${at.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${timeOfDay(at)}`;
}
