/**
 * Direct port of apps/web's UtilsService._formatImagePathForFirebaseStorage - a Firebase Storage
 * path segment can't safely carry arbitrary whitespace (a title like "Finished Tattoo" used as a
 * path segment), so every run of whitespace becomes a single underscore after trimming the ends.
 */
export function formatImagePathForFirebaseStorage(str: string): string {
  return str.trim().replace(/\s+/g, '_');
}
