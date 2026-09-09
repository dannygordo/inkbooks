import type { GetSharedImagesForClientQuery } from '@inkbooks/api';

export type SharedImageItem = GetSharedImagesForClientQuery['getSharedImagesForClient'][number];

// Same three section titles project images use (see utils/projectImages.ts's PROJECT_IMAGE_SECTIONS)
// - assignedImageType stores one of these three field names, matching apps/web's
// SharedImagesPanel.jsx's own "assign to project" picker.
const IMAGE_TYPE_LABELS: Record<string, string> = {
  referenceImages: 'References',
  designImages: 'Design',
  bodyImages: 'Finished Tattoo',
};

/**
 * The badge SharedImagesPanel.jsx shows once an image has been filed onto a project -
 * "assignedProjectId is deliberately NOT cleared from the list once set... the client-dashboard
 * panel shows a badge instead" (server/graphql/typeDefs.js's own SharedImage comment). Returns
 * null for an unassigned image, which callers render as no badge at all rather than an empty one.
 */
export function assignedLabel(image: Pick<SharedImageItem, 'assignedProjectId' | 'assignedImageType' | 'assignedProject'>): string | null {
  if (!image.assignedProjectId || !image.assignedProject) {
    return null;
  }
  const typeLabel = image.assignedImageType ? IMAGE_TYPE_LABELS[image.assignedImageType] : undefined;
  return typeLabel
    ? `Filed to ${image.assignedProject.title} (${typeLabel})`
    : `Filed to ${image.assignedProject.title}`;
}
