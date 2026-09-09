import { projectStatusLabel } from '@/utils/projectStatus';

describe('projectStatusLabel', () => {
	it('maps every known PROJECT_STATUS value to its label', () => {
		expect(projectStatusLabel('open')).toBe('Open');
		expect(projectStatusLabel('in_progress')).toBe('In Progress');
		expect(projectStatusLabel('waitlist')).toBe('Waitlist');
		expect(projectStatusLabel('cancelled')).toBe('Cancelled');
		expect(projectStatusLabel('completed')).toBe('Completed');
	});

	it('falls back to the raw value for an unrecognized status rather than hiding it', () => {
		expect(projectStatusLabel('some_new_status')).toBe('some_new_status');
	});

	it('returns an empty string for a missing status, matching web\'s own blank cell', () => {
		expect(projectStatusLabel(null)).toBe('');
		expect(projectStatusLabel(undefined)).toBe('');
		expect(projectStatusLabel('')).toBe('');
	});
});
