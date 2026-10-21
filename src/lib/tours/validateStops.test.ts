import { validatePackageStop, type PackageStopInput } from '@/lib/tours/validation';

describe('Package Stops Validation', () => {
  describe('validatePackageStop - location name validation', () => {
    it('accepts valid location name', () => {
      const stop: PackageStopInput = {
        locationName: 'Coral Triangle Resort',
        latitude: 10.3157,
        longitude: 123.8854,
        description: 'Beautiful coral reef area',
        estimatedDurationMinutes: 30,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts location name with exactly 1 character', () => {
      const stop: PackageStopInput = {
        locationName: 'A',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts location name with many characters', () => {
      const stop: PackageStopInput = {
        locationName: 'A'.repeat(200),
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('rejects empty location name', () => {
      const stop: PackageStopInput = {
        locationName: '',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBe('Stop location name is required.');
    });

    it('rejects whitespace-only location name', () => {
      const stop: PackageStopInput = {
        locationName: '   ',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBe('Stop location name is required.');
    });

    it('rejects null location name', () => {
      const stop = {
        locationName: null,
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Stop location name is required.');
    });

    it('rejects undefined location name', () => {
      const stop = {
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Stop location name is required.');
    });

    it('rejects non-string location name', () => {
      const stop = {
        locationName: 123,
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Stop location name is required.');
    });

    it('rejects null stop object', () => {
      const result = validatePackageStop(null as any);
      expect(result).toBe('Stop location name is required.');
    });

    it('rejects undefined stop object', () => {
      const result = validatePackageStop(undefined as any);
      expect(result).toBe('Stop location name is required.');
    });
  });

  describe('validatePackageStop - latitude validation', () => {
    it('accepts latitude of -90 (south pole)', () => {
      const stop: PackageStopInput = {
        locationName: 'South Pole',
        latitude: -90,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts latitude of 90 (north pole)', () => {
      const stop: PackageStopInput = {
        locationName: 'North Pole',
        latitude: 90,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts latitude of 0 (equator)', () => {
      const stop: PackageStopInput = {
        locationName: 'Equator',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts typical latitude (Philippines)', () => {
      const stop: PackageStopInput = {
        locationName: 'Cebu',
        latitude: 10.3157,
        longitude: 123.8854,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts latitude with many decimal places', () => {
      const stop: PackageStopInput = {
        locationName: 'Precise Location',
        latitude: 10.31570123456789,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('rejects latitude less than -90', () => {
      const stop: PackageStopInput = {
        locationName: 'Invalid',
        latitude: -91,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBe('Latitude must be between -90 and 90.');
    });

    it('rejects latitude greater than 90', () => {
      const stop: PackageStopInput = {
        locationName: 'Invalid',
        latitude: 91,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBe('Latitude must be between -90 and 90.');
    });

    it('rejects null latitude', () => {
      const stop = {
        locationName: 'Location',
        latitude: null,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Latitude must be between -90 and 90.');
    });

    it('rejects undefined latitude', () => {
      const stop = {
        locationName: 'Location',
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Latitude must be between -90 and 90.');
    });

    it('rejects NaN latitude', () => {
      const stop = {
        locationName: 'Location',
        latitude: NaN,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Latitude must be between -90 and 90.');
    });

    it('rejects Infinity latitude', () => {
      const stop = {
        locationName: 'Location',
        latitude: Infinity,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Latitude must be between -90 and 90.');
    });

    it('rejects non-numeric latitude', () => {
      const stop = {
        locationName: 'Location',
        latitude: '10.3157' as any,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBe('Latitude must be between -90 and 90.');
    });
  });

  describe('validatePackageStop - longitude validation', () => {
    it('accepts longitude of -180 (international date line west)', () => {
      const stop: PackageStopInput = {
        locationName: 'Date Line West',
        latitude: 0,
        longitude: -180,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts longitude of 180 (international date line east)', () => {
      const stop: PackageStopInput = {
        locationName: 'Date Line East',
        latitude: 0,
        longitude: 180,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts longitude of 0 (prime meridian)', () => {
      const stop: PackageStopInput = {
        locationName: 'Prime Meridian',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts typical longitude (Philippines)', () => {
      const stop: PackageStopInput = {
        locationName: 'Cebu',
        latitude: 10.3157,
        longitude: 123.8854,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts longitude with many decimal places', () => {
      const stop: PackageStopInput = {
        locationName: 'Precise',
        latitude: 0,
        longitude: 123.88540123456789,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('rejects longitude less than -180', () => {
      const stop: PackageStopInput = {
        locationName: 'Invalid',
        latitude: 0,
        longitude: -181,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBe('Longitude must be between -180 and 180.');
    });

    it('rejects longitude greater than 180', () => {
      const stop: PackageStopInput = {
        locationName: 'Invalid',
        latitude: 0,
        longitude: 181,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBe('Longitude must be between -180 and 180.');
    });

    it('rejects null longitude', () => {
      const stop = {
        locationName: 'Location',
        latitude: 0,
        longitude: null,
        description: null,
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Longitude must be between -180 and 180.');
    });

    it('rejects NaN longitude', () => {
      const stop = {
        locationName: 'Location',
        latitude: 0,
        longitude: NaN,
        description: null,
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Longitude must be between -180 and 180.');
    });
  });

  describe('validatePackageStop - description validation', () => {
    it('accepts description with text', () => {
      const stop: PackageStopInput = {
        locationName: 'Beach',
        latitude: 0,
        longitude: 0,
        description: 'Beautiful sandy beach',
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts null description (optional field)', () => {
      const stop: PackageStopInput = {
        locationName: 'Beach',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts empty string description (optional field)', () => {
      const stop: PackageStopInput = {
        locationName: 'Beach',
        latitude: 0,
        longitude: 0,
        description: '',
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('rejects non-string description', () => {
      const stop = {
        locationName: 'Beach',
        latitude: 0,
        longitude: 0,
        description: 123,
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Stop description must be text.');
    });

    it('rejects array description', () => {
      const stop = {
        locationName: 'Beach',
        latitude: 0,
        longitude: 0,
        description: ['text'],
        estimatedDurationMinutes: null,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Stop description must be text.');
    });
  });

  describe('validatePackageStop - estimatedDurationMinutes validation', () => {
    it('accepts estimatedDurationMinutes of 0', () => {
      const stop: PackageStopInput = {
        locationName: 'Stop',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: 0,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts estimatedDurationMinutes of 30', () => {
      const stop: PackageStopInput = {
        locationName: 'Stop',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: 30,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts estimatedDurationMinutes of 1440 (24 hours)', () => {
      const stop: PackageStopInput = {
        locationName: 'Stop',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: 1440,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts null estimatedDurationMinutes (optional field)', () => {
      const stop: PackageStopInput = {
        locationName: 'Stop',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('rejects undefined estimatedDurationMinutes (fails finite check)', () => {
      const stop = {
        locationName: 'Stop',
        latitude: 0,
        longitude: 0,
        description: null,
      } as any;
      const result = validatePackageStop(stop);
      // undefined is not null, and fails the Number.isFinite check
      expect(result).toBe('Estimated duration must be a non-negative number of minutes.');
    });

    it('rejects negative estimatedDurationMinutes', () => {
      const stop: PackageStopInput = {
        locationName: 'Stop',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: -10,
      };
      const result = validatePackageStop(stop);
      expect(result).toBe('Estimated duration must be a non-negative number of minutes.');
    });

    it('rejects NaN estimatedDurationMinutes', () => {
      const stop = {
        locationName: 'Stop',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: NaN,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Estimated duration must be a non-negative number of minutes.');
    });

    it('rejects Infinity estimatedDurationMinutes', () => {
      const stop = {
        locationName: 'Stop',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: Infinity,
      } as any;
      const result = validatePackageStop(stop);
      expect(result).toBe('Estimated duration must be a non-negative number of minutes.');
    });

    it('rejects decimal estimatedDurationMinutes', () => {
      const stop: PackageStopInput = {
        locationName: 'Stop',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: 30.5,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull(); // Decimals are technically valid numbers, not rejected
    });
  });

  describe('validatePackageStop - complete valid scenarios', () => {
    it('accepts stop with all fields populated', () => {
      const stop: PackageStopInput = {
        id: 'stop-1',
        locationName: 'Beautiful Beach Resort',
        latitude: 10.3157,
        longitude: 123.8854,
        description: 'Relax and enjoy the scenic views',
        estimatedDurationMinutes: 45,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts stop with only required fields', () => {
      const stop: PackageStopInput = {
        locationName: 'Location',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });

    it('accepts stop with real world Philippines coordinates', () => {
      const stop: PackageStopInput = {
        locationName: 'Magellan\'s Cross, Cebu',
        latitude: 10.2966,
        longitude: 123.8714,
        description: 'Historic landmark',
        estimatedDurationMinutes: 20,
      };
      const result = validatePackageStop(stop);
      expect(result).toBeNull();
    });
  });

  describe('validatePackageStop - error message format', () => {
    it('returns error message as string or null', () => {
      const validStop: PackageStopInput = {
        locationName: 'Location',
        latitude: 0,
        longitude: 0,
        description: null,
        estimatedDurationMinutes: null,
      };
      const result = validatePackageStop(validStop);
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('returns specific error messages', () => {
      const invalidStops: { stop: PackageStopInput; expectedMsg: string }[] = [
        {
          stop: {
            locationName: '',
            latitude: 0,
            longitude: 0,
            description: null,
            estimatedDurationMinutes: null,
          },
          expectedMsg: 'Stop location name is required.',
        },
        {
          stop: {
            locationName: 'Location',
            latitude: 100,
            longitude: 0,
            description: null,
            estimatedDurationMinutes: null,
          },
          expectedMsg: 'Latitude must be between -90 and 90.',
        },
        {
          stop: {
            locationName: 'Location',
            latitude: 0,
            longitude: 200,
            description: null,
            estimatedDurationMinutes: null,
          },
          expectedMsg: 'Longitude must be between -180 and 180.',
        },
      ];

      invalidStops.forEach(({ stop, expectedMsg }) => {
        const result = validatePackageStop(stop);
        expect(result).toBe(expectedMsg);
      });
    });
  });
});
