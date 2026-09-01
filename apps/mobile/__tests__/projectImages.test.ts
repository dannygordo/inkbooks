import {
  buildProjectImagesPayload,
  projectImageFolder,
  toImageInput,
  type ProjectForImages,
  type ProjectImage,
} from '@/utils/projectImages';

const PROJECT = {
  id: 'project-1',
  title: 'Sleeve piece',
  description: 'Full sleeve',
  clientId: 'client-1',
  artistId: 'artist-1',
  status: 'active',
  artist: { id: 'artist-1', shop: { id: 'shop-1' } },
} as unknown as ProjectForImages;

const INDEPENDENT_PROJECT = {
  ...PROJECT,
  artist: { id: 'artist-1', shop: null },
} as unknown as ProjectForImages;

const IMAGE = {
  __typename: 'IBImage',
  id: 'img-1',
  url: 'https://example.com/img-1.jpg',
  title: null,
  uploadedByDisplayName: 'Danny Schreiber',
  userId: 'artist-1',
  avatar: null,
  tags: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  userInfo: { firstName: 'Danny', lastName: 'Schreiber', avatar: null },
} as unknown as ProjectImage;

describe('projectImageFolder', () => {
  it('builds the Storage folder from the shop, artist, project, and section', () => {
    expect(projectImageFolder(PROJECT, 'References')).toBe('shop-1/artist-1/project-1/References');
  });

  it('falls back to "independent" when the artist has no shop', () => {
    expect(projectImageFolder(INDEPENDENT_PROJECT, 'Design')).toBe(
      'independent/artist-1/project-1/Design',
    );
  });
});

describe('toImageInput', () => {
  it('strips __typename and userInfo, keeping only IBImageInput fields', () => {
    const input = toImageInput(IMAGE);
    expect(input).toEqual({
      id: 'img-1',
      url: 'https://example.com/img-1.jpg',
      title: undefined,
      uploadedByDisplayName: 'Danny Schreiber',
      userId: 'artist-1',
      avatar: undefined,
      tags: undefined,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(input).not.toHaveProperty('__typename');
    expect(input).not.toHaveProperty('userInfo');
  });
});

describe('buildProjectImagesPayload', () => {
  it('sends only the required scalars plus the one changed image field', () => {
    const payload = buildProjectImagesPayload(PROJECT, 'referenceImages', [toImageInput(IMAGE)]);
    expect(payload).toEqual({
      id: 'project-1',
      title: 'Sleeve piece',
      description: 'Full sleeve',
      clientId: 'client-1',
      artistId: 'artist-1',
      status: 'active',
      referenceImages: [toImageInput(IMAGE)],
    });
    expect(payload).not.toHaveProperty('designImages');
    expect(payload).not.toHaveProperty('bodyImages');
  });
});
