import type { CurrentUser } from '@/context/auth';

/**
 * The Firebase Storage folder one user's own avatar lives in - direct port of apps/web's
 * AccountPanel.jsx handleSubmit: `${shopPathSegment}/${user.id}/profile`. Same 'independent'
 * fallback as utils/projectImages.ts's projectImageFolder, and for the same reason: an
 * independent artist (or a Client, who has no shop at all) has no shop id to key storage under,
 * and 'independent' is a real, stable path segment rather than the literal string "undefined".
 *
 * Takes the shop id directly (from utils/user.ts's getUserShopId) rather than the whole
 * CurrentUser, since the caller already has to compute that for other reasons (see
 * app/settings/index.tsx) and this keeps the two path-building utils (this one, and
 * projectImageFolder) symmetrical.
 */
export function avatarFolder(userId: string, shopId: string | undefined): string {
  return `${shopId ?? 'independent'}/${userId}/profile`;
}

/**
 * The old avatar's own image, deleted after a successful re-upload - mirrors
 * AccountPanel.jsx's cleanup, but simpler: firebase/deleteFile.ts's deleteFile() accepts a full
 * download URL directly (Firebase Storage's ref() resolves a gs:// path, a plain storage path, or
 * an https download URL interchangeably), so unlike web's own version this never needs to parse
 * the URL apart to re-derive a storage path - the stored avatar URL IS a valid argument as-is.
 */
export function previousAvatarUrl(user: Pick<CurrentUser, 'avatar'> | null | undefined): string | null {
  return user?.avatar || null;
}

/**
 * Fallback initials for a user with no avatar image - one or two letters, uppercased, never
 * empty. Web's IBAvatar has no real equivalent (MUI's Avatar falls back to a generic person icon
 * when no `src`/`children` is given, not initials), but a filled circle showing a person's own
 * initials is the more legible mobile-idiomatic fallback, so this is new rather than ported.
 */
export function avatarInitials(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = (firstName ?? '').trim().charAt(0);
  const last = (lastName ?? '').trim().charAt(0);
  const initials = `${first}${last}`.toUpperCase();
  return initials || '?';
}
