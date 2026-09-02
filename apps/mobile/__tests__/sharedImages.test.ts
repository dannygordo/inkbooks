import { assignedLabel } from '@/utils/sharedImages';

describe('assignedLabel', () => {
  it('returns null for an unassigned image', () => {
    expect(assignedLabel({ assignedProjectId: null, assignedImageType: null, assignedProject: null })).toBeNull();
  });

  it('names the project and the section once assigned', () => {
    expect(
      assignedLabel({
        assignedProjectId: 'p1',
        assignedImageType: 'referenceImages',
        assignedProject: { id: 'p1', title: "Sarah's sleeve" },
      }),
    ).toBe("Filed to Sarah's sleeve (References)");
  });

  it('falls back to just the project title for an unrecognized image type', () => {
    expect(
      assignedLabel({
        assignedProjectId: 'p1',
        assignedImageType: 'somethingNew',
        assignedProject: { id: 'p1', title: "Sarah's sleeve" },
      }),
    ).toBe("Filed to Sarah's sleeve");
  });

  it('returns null if assignedProjectId is set but the project failed to resolve', () => {
    expect(
      assignedLabel({ assignedProjectId: 'p1', assignedImageType: 'designImages', assignedProject: null }),
    ).toBeNull();
  });
});
