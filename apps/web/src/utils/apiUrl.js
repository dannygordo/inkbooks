import { APP_SETTINGS_CONSTANTS } from "../constants";

/**
 * The API base URL for the current Vite mode, resolved safely.
 *
 * APP_SETTINGS_CONSTANTS has exactly two keys: PRODUCTION and DEVELOPMENT. The direct lookup
 * `APP_SETTINGS_CONSTANTS[import.meta.env.MODE.toUpperCase()].GRAPHQL_SERVER_URL` therefore
 * explodes under any other mode - and Vitest runs in mode "test", so `APP_SETTINGS_CONSTANTS.TEST`
 * is undefined and reading a property off it is a TypeError.
 *
 * That matters more than it sounds, because those lookups were written at MODULE level. A module-
 * level throw happens at IMPORT time, so the failure isn't "the Square form is broken" - it's
 * "every test that transitively imports the Square form fails to load at all", with a stack
 * pointing at a config file rather than at anything the test was about. UpdateEventDialog.test
 * failed this way: dialog -> BookSessionDatesForm -> IBSquarePaymentForm -> squareConfig.
 *
 * Two fixes in one:
 *   - falls back to DEVELOPMENT for any unrecognised mode, so a new mode degrades instead of
 *     crashing
 *   - is a FUNCTION, so callers can resolve it lazily and a missing value can never take down an
 *     import graph
 *
 * Trailing slash is normalised, because half the call sites concatenated "square/config" and half
 * concatenated "/booking-uploads", and that inconsistency is one edit away from localhost:3000api.
 */
export function apiBaseUrl() {
  const mode = (import.meta.env.MODE || "development").toUpperCase();
  const settings =
    APP_SETTINGS_CONSTANTS[mode] || APP_SETTINGS_CONSTANTS.DEVELOPMENT;
  return String(settings.GRAPHQL_SERVER_URL || "").replace(/\/+$/, "");
}

/** A path joined onto the API base, with exactly one slash between them. */
export function apiUrl(path) {
  return `${apiBaseUrl()}/${String(path).replace(/^\/+/, "")}`;
}

/** The socket server URL, same fallback rule. */
export function socketUrl() {
  const mode = (import.meta.env.MODE || "development").toUpperCase();
  const settings =
    APP_SETTINGS_CONSTANTS[mode] || APP_SETTINGS_CONSTANTS.DEVELOPMENT;
  return settings.SOCKET_IO_SERVER_URL;
}
