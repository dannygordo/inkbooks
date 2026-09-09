// Hand-rolled US phone formatting - apps/web's UtilsService.formatPhone uses libphonenumber-js,
// a dependency mobile has nowhere else in this codebase. This app's own data is US-only anyway
// (web's own implementation hardcodes a "+1" prefix before parsing), so a real parsing library
// buys nothing a plain 10-digit format doesn't already cover - same "not worth the bundle weight"
// call utils/timeAgo.ts and utils/messageTime.ts already made against moment/dayjs.
//
// Falls back to the raw stored value for anything that isn't a recognizable 10- or 11-digit US
// number, rather than throwing - same "don't crash on a phone number that doesn't fit, don't lie
// about what's on file either" contract web's own version documents for missing/malformed numbers.
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) {
    return '';
  }
  const digits = phone.replace(/\D/g, '');
  const tenDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (tenDigits.length !== 10) {
    return phone;
  }
  return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
}
