import { generateObjectId } from '@/utils/objectId';

describe('generateObjectId', () => {
  it('generates a 24-character lowercase hex string', () => {
    const id = generateObjectId();
    expect(id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('generates a different id on each call', () => {
    expect(generateObjectId()).not.toBe(generateObjectId());
  });
});
