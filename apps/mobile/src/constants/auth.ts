// Mirrors apps/web's constants/auth.js exactly - same reason that file's own header comment
// gives for ROLES existing at all: a role number written from memory in the wrong file is a
// silent authorization bug, not a compile error. Kept as a duplicate here rather than shared from
// packages/shared because that package doesn't exist yet (see DECISIONS.md's X3/X5 - both note
// their own staged-ahead-of-packages/shared duplication the same way); trimmed to what mobile's
// auth/appointments work actually needs so far rather than copying every export web has.
//
// Lower is more privileged throughout, so "at least this privileged" is `role <= X`.
export const ROLES = {
  ADMIN: 1,
  SHOP_ADMIN: 10,
  SHOP_STAFF: 15,
  ARTIST: 20,
  CLIENT: 30,
} as const;

export const AUTH_SETTINGS_CONSTANTS = {
  CURRENT_USER_CACHE: 'token',
  AUTH_REDUCER_TYPES: {
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    UPDATE_USER: 'UPDATE_USER',
  },
} as const;

export const AUTH_ERROR_MESSAGES = {
  INCORRECT_CREDENTIALS:
    'The email and/or password submitted are not correct.  Please try again.',
} as const;
