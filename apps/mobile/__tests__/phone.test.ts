import { formatPhone } from '@/utils/phone';

describe('formatPhone', () => {
  it('returns an empty string for a missing number', () => {
    expect(formatPhone(null)).toBe('');
    expect(formatPhone(undefined)).toBe('');
    expect(formatPhone('')).toBe('');
  });

  it('formats a bare 10-digit number', () => {
    expect(formatPhone('5551234567')).toBe('(555) 123-4567');
  });

  it('formats a number that already has punctuation', () => {
    expect(formatPhone('555-123-4567')).toBe('(555) 123-4567');
    expect(formatPhone('(555) 123-4567')).toBe('(555) 123-4567');
  });

  it('strips a leading US country code', () => {
    expect(formatPhone('15551234567')).toBe('(555) 123-4567');
    expect(formatPhone('+15551234567')).toBe('(555) 123-4567');
  });

  it('falls back to the raw value for anything that is not a 10- or 11-digit US number', () => {
    expect(formatPhone('123')).toBe('123');
    expect(formatPhone('not a number')).toBe('not a number');
  });
});
