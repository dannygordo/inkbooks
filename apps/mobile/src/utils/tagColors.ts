// Direct port of apps/web's constants/app.js APP_SETTINGS_CONSTANTS.TAG_COLORS (the fixed 15-swatch
// palette) and UtilsService.showAvailableColorTags. Kept together in one file since neither means
// anything without the other - the palette IS the set showAvailableColorTags filters.
export const TAG_COLORS = [
  { value: '#c69818', label: 'Goldfinger' },
  { value: '#861d15', label: 'Brick Red' },
  { value: '#122152', label: 'Deep Blue' },
  { value: '#2ea2dc', label: 'Robin Blue' },
  { value: '#8E24AA', label: 'Royal Purple' },
  { value: '#e1591f', label: 'Pumpkin' },
  { value: '#e2d355', label: 'Banana' },
  { value: '#4c4b40', label: 'Olive Green' },
  { value: '#73f0b6', label: 'Seafoam' },
  { value: '#90674a', label: 'Mocha' },
  { value: '#bdc647', label: 'Tennis Ball' },
  { value: '#84b100', label: 'Bright Green' },
  { value: '#f49198', label: 'Pink' },
  { value: '#d9a6f5', label: 'Lavander' },
  { value: '#c57b00', label: 'Terracotta' },
] as const;

export type TagColorOption = (typeof TAG_COLORS)[number];

/**
 * The caller's own current color first (never hidden behind "already taken" - it's already
 * theirs), then every other color nobody else at the shop has claimed yet. Direct port of web's
 * own function of the same name - see app/settings/index.tsx's own comment on why this must only
 * be computed once the shop-mates' taken-colors query has actually resolved, not while it's still
 * loading.
 */
export function showAvailableColorTags(
  // Loosely typed to match GetUserTagColors' own response shape directly (a nullable list of
  // nullable Users, each with a nullable tagColor - the schema's User.tagColor is optional in
  // general, not just here) rather than making every call site pre-filter/pre-cast first.
  usedTags: ReadonlyArray<{ tagColor?: string | null } | null | undefined> | null | undefined,
  userColor: string | null | undefined,
): TagColorOption[] {
  const taken = new Set(
    (usedTags ?? [])
      .map((tag) => tag?.tagColor)
      .filter((tagColor): tagColor is string => Boolean(tagColor)),
  );
  const mine = TAG_COLORS.filter((tag) => tag.value === userColor);
  const available = TAG_COLORS.filter((tag) => tag.value !== userColor && !taken.has(tag.value));
  return [...mine, ...available];
}
