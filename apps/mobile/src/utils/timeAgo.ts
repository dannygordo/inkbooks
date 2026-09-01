// A small hand-rolled replacement for web's moment(date).fromNow() (IBImagesList.jsx) - mobile
// has no moment/dayjs dependency anywhere else, and pulling one in for a single "x time ago"
// label on an image thumbnail isn't worth the bundle weight. Covers the ranges an uploaded-just-
// now-through-months-old image actually spans; beyond a year it falls back to a plain date, same
// as moment's own calendar threshold behavior in spirit.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) {
    return '';
  }
  const then = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const diff = Date.now() - then;
  if (diff < MINUTE) {
    return 'just now';
  }
  if (diff < HOUR) {
    const minutes = Math.round(diff / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diff < WEEK) {
    const days = Math.round(diff / DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (diff < MONTH) {
    const weeks = Math.round(diff / WEEK);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  if (diff < YEAR) {
    const months = Math.round(diff / MONTH);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.round(diff / YEAR);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
