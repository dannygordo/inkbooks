import type { GetProjectDetailQuery, IbImageInput } from '@inkbooks/api';

// The three Project image arrays, and the exact section title web's Project.jsx uses for each
// (IBProgressItemProject.jsx builds the Firebase Storage path from this same title string, so it
// has to match byte-for-byte - not just a label).
export type ProjectImageField = 'referenceImages' | 'designImages' | 'bodyImages';

export const PROJECT_IMAGE_SECTIONS: { field: ProjectImageField; title: string }[] = [
  { field: 'referenceImages', title: 'References' },
  { field: 'designImages', title: 'Design' },
  { field: 'bodyImages', title: 'Finished Tattoo' },
];

export type ProjectForImages = NonNullable<GetProjectDetailQuery['getProject']>;
export type ProjectImage = NonNullable<
  NonNullable<ProjectForImages['referenceImages']>[number]
>;

/**
 * Strips a fetched IBImage (which carries __typename and a resolved `userInfo` sub-object) down
 * to exactly IBImageInput's fields - direct equivalent of web's repeated
 * `({ __typename, userInfo, ...keepAttrs }) => keepAttrs` map used throughout
 * IBProgressListProject.jsx/Project.jsx before resending an image array to updateProject.
 */
export function toImageInput(image: ProjectImage): IbImageInput {
  return {
    id: image.id,
    url: image.url,
    title: image.title ?? undefined,
    uploadedByDisplayName: image.uploadedByDisplayName ?? undefined,
    userId: image.userId,
    avatar: image.avatar ?? undefined,
    tags: image.tags ?? undefined,
    createdAt: image.createdAt ?? undefined,
    updatedAt: image.updatedAt ?? undefined,
  };
}

/**
 * The Firebase Storage folder every image in one project's one section shares - direct port of
 * IBProgressItemProject.jsx's imgPath. project.artist.shop is legitimately null for an
 * independent artist (no shop connection at all, a first-class case - see
 * PRODUCTION_ROADMAP.md's artist-centric tenancy section), not a data-quality gap, so this falls
 * back to a stable 'independent' path segment rather than crashing on `.shop.id`.
 */
export function projectImageFolder(project: ProjectForImages, sectionTitle: string): string {
  const shopSegment = project.artist?.shop?.id ?? 'independent';
  return `${shopSegment}/${project.artistId}/${project.id}/${sectionTitle}`;
}

/**
 * Builds the minimal ProjectInput payload every image-array mutation sends: the required
 * scalars ProjectInput demands (id/title/description/clientId/artistId/status) plus the ONE
 * image field actually being changed. Mirrors apps/web's handleProjectReferencesUpdate/
 * handleProjectDesignsUpdate/handleProjectBodyImagesUpdate (Project.jsx) - see
 * packages/api/src/operations/projectDetail.graphql's own comment on why mobile standardizes on
 * this leaner shape everywhere rather than also copying IBProgressListProject.jsx's redundant
 * full-echo-of-all-three-arrays variant.
 */
export function buildProjectImagesPayload(
  project: ProjectForImages,
  field: ProjectImageField,
  images: IbImageInput[],
) {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    clientId: project.clientId,
    artistId: project.artistId,
    status: project.status,
    [field]: images,
  };
}
