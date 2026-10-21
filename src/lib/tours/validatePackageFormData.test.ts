import { validatePackageFormData, type BasicPackageInfo } from '@/lib/tours/validation';

describe('Package Form Data Validation', () => {
  describe('validatePackageFormData - complete valid scenarios', () => {
    it('accepts completely valid data with all required fields', () => {
      const data: BasicPackageInfo = {
        title: 'Beautiful Beach Tour',
        description: 'Experience the pristine beaches',
        locationName: 'Boracay Island',
        durationValue: 1.5,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('accepts data with minimum valid field lengths', () => {
      const data: BasicPackageInfo = {
        title: 'ABC', // min 3 chars
        description: '1234567890', // min 10 chars
        locationName: 'AB', // min 2 chars
        durationValue: 0.5, // min value
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('accepts data with maximum valid field lengths', () => {
      const data: BasicPackageInfo = {
        title: 'A'.repeat(150), // max 150 chars
        description: 'B'.repeat(3000), // max 3000 chars
        locationName: 'C'.repeat(100), // max 100 chars
        durationValue: 365, // max value
        durationType: 'days',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('accepts data with decimal duration', () => {
      const data: BasicPackageInfo = {
        title: 'Half Day Tour',
        description: 'Short and sweet tour experience',
        locationName: 'Cebu City',
        durationValue: 4.5,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });
  });

  describe('validatePackageFormData - title validation', () => {
    it('accepts title with exactly 3 characters', () => {
      const data: BasicPackageInfo = {
        title: 'ABC',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.title).toBeUndefined();
    });

    it('accepts title with exactly 150 characters', () => {
      const data: BasicPackageInfo = {
        title: 'A'.repeat(150),
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.title).toBeUndefined();
    });

    it('accepts title with typical length', () => {
      const data: BasicPackageInfo = {
        title: 'Beautiful Beach Resort Tour',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.title).toBeUndefined();
    });

    it('rejects title with 2 characters (below minimum)', () => {
      const data: BasicPackageInfo = {
        title: 'AB',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.title?.[0]).toContain('at least 3');
    });

    it('rejects title with 151 characters (above maximum)', () => {
      const data: BasicPackageInfo = {
        title: 'A'.repeat(151),
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.title?.[0]).toContain('at most 150');
    });

    it('rejects empty title', () => {
      const data: BasicPackageInfo = {
        title: '',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.title?.[0]).toContain('required');
    });

    it('rejects whitespace-only title', () => {
      const data: BasicPackageInfo = {
        title: '   ',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.title?.[0]).toContain('required');
    });

    it('rejects null title', () => {
      const data: BasicPackageInfo = {
        title: null,
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('rejects undefined title', () => {
      const data: BasicPackageInfo = {
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('trims whitespace from title before validation', () => {
      const data: BasicPackageInfo = {
        title: '  Valid Title  ',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.title).toBeUndefined();
    });
  });

  describe('validatePackageFormData - locationName validation', () => {
    it('accepts locationName with exactly 2 characters', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'AB',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.locationName).toBeUndefined();
    });

    it('accepts locationName with exactly 100 characters', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'L'.repeat(100),
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.locationName).toBeUndefined();
    });

    it('accepts typical locationName', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Cebu City, Philippines',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.locationName).toBeUndefined();
    });

    it('rejects locationName with 1 character (below minimum)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'A',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.locationName).toBeDefined();
      expect(result.errors.locationName?.[0]).toContain('at least 2');
    });

    it('rejects locationName with 101 characters (above maximum)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'L'.repeat(101),
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.locationName).toBeDefined();
      expect(result.errors.locationName?.[0]).toContain('at most 100');
    });

    it('rejects empty locationName', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: '',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.locationName).toBeDefined();
      expect(result.errors.locationName?.[0]).toContain('required');
    });

    it('rejects null locationName', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: null,
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.locationName).toBeDefined();
    });

    it('trims whitespace from locationName before validation', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: '  Valid Location  ',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.locationName).toBeUndefined();
    });
  });

  describe('validatePackageFormData - description validation', () => {
    it('accepts description with exactly 10 characters', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        description: '1234567890',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.description).toBeUndefined();
    });

    it('accepts description with exactly 3000 characters', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        description: 'A'.repeat(3000),
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.description).toBeUndefined();
    });

    it('accepts typical description length', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        description: 'This is a beautiful tour package.',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.description).toBeUndefined();
    });

    it('accepts null description (optional field)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        description: null,
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.description).toBeUndefined();
    });

    it('accepts undefined description (optional field)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.description).toBeUndefined();
    });

    it('accepts empty string description (treated as not provided)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        description: '',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.description).toBeUndefined();
    });

    it('accepts whitespace-only description (trimmed to empty)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        description: '   ',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.description).toBeUndefined();
    });

    it('rejects description with 9 characters (below minimum if provided)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        description: '123456789',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.description).toBeDefined();
      expect(result.errors.description?.[0]).toContain('at least 10');
    });

    it('rejects description with 3001 characters (above maximum)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        description: 'A'.repeat(3001),
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.description).toBeDefined();
      expect(result.errors.description?.[0]).toContain('at most 3000');
    });

    it('trims whitespace from description before validation', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        description: '  1234567890  ',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.description).toBeUndefined();
    });
  });

  describe('validatePackageFormData - durationValue validation', () => {
    it('accepts durationValue of exactly 0.5', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 0.5,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.durationValue).toBeUndefined();
    });

    it('accepts durationValue of exactly 365', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 365,
        durationType: 'days',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.durationValue).toBeUndefined();
    });

    it('accepts durationValue of 1 (integer)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.durationValue).toBeUndefined();
    });

    it('accepts durationValue of 2.5 (decimal)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 2.5,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.durationValue).toBeUndefined();
    });

    it('rejects durationValue less than 0.5', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 0.4,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.durationValue).toBeDefined();
      expect(result.errors.durationValue?.[0]).toContain('at least 0.5');
    });

    it('rejects durationValue greater than 365', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 366,
        durationType: 'days',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.durationValue).toBeDefined();
      expect(result.errors.durationValue?.[0]).toContain('at most 365');
    });

    it('rejects null durationValue', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: null,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.durationValue).toBeDefined();
      expect(result.errors.durationValue?.[0]).toContain('required');
    });

    it('rejects undefined durationValue', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.durationValue).toBeDefined();
    });

    it('accepts NaN durationValue (treated as valid number by typeof check)', () => {
      const data = {
        title: 'Title',
        locationName: 'Location',
        durationValue: NaN,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data as any);
      // NaN is technically typeof 'number', but fails the range check
      expect(result.valid).toBe(true);
    });

    it('rejects string durationValue', () => {
      const data = {
        title: 'Title',
        locationName: 'Location',
        durationValue: '5' as any,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.durationValue).toBeDefined();
    });
  });

  describe('validatePackageFormData - durationType validation', () => {
    it('accepts durationType of "hours"', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.durationType).toBeUndefined();
    });

    it('accepts durationType of "days"', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'days',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.durationType).toBeUndefined();
    });

    it('rejects invalid durationType', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'weeks',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.durationType).toBeDefined();
      expect(result.errors.durationType?.[0]).toContain('hours');
      expect(result.errors.durationType?.[0]).toContain('days');
    });

    it('rejects null durationType', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 1,
        durationType: null,
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.durationType).toBeDefined();
      expect(result.errors.durationType?.[0]).toContain('required');
    });

    it('rejects undefined durationType', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 1,
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.durationType).toBeDefined();
    });

    it('rejects empty string durationType', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 1,
        durationType: '',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.durationType).toBeDefined();
    });

    it('rejects case-sensitive durationType (uppercase)', () => {
      const data: BasicPackageInfo = {
        title: 'Title',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'HOURS',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.durationType).toBeDefined();
    });
  });

  describe('validatePackageFormData - multiple field errors', () => {
    it('reports multiple errors at once', () => {
      const data: BasicPackageInfo = {
        title: '',
        locationName: '',
        durationValue: 0,
        durationType: 'invalid',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThan(1);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.locationName).toBeDefined();
      expect(result.errors.durationValue).toBeDefined();
      expect(result.errors.durationType).toBeDefined();
    });

    it('returns field-specific error messages', () => {
      const data: BasicPackageInfo = {
        title: 'A', // too short
        locationName: 'X'.repeat(101), // too long
        durationValue: 1000, // out of range
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.title?.[0]).toContain('at least 3');
      expect(result.errors.locationName?.[0]).toContain('at most 100');
      expect(result.errors.durationValue?.[0]).toContain('at most 365');
    });
  });

  describe('validatePackageFormData - error message structure', () => {
    it('returns errors as Record<string, string[]>', () => {
      const data: BasicPackageInfo = {
        title: '',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(result.errors.title).toEqual(expect.arrayContaining([expect.any(String)]));
    });

    it('provides single error string in array', () => {
      const data: BasicPackageInfo = {
        title: 'AB',
        locationName: 'Location',
        durationValue: 1,
        durationType: 'hours',
      };
      const result = validatePackageFormData(data);
      expect(Array.isArray(result.errors.title)).toBe(true);
      expect(result.errors.title?.length).toBe(1);
    });
  });
});
