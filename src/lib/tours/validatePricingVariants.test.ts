import { validatePriceVariant, type PriceVariantInput } from '@/lib/tours/validation';

describe('Pricing Variants Validation', () => {
  describe('validatePriceVariant - variant name validation', () => {
    it('accepts variant with valid name', () => {
      const variant: PriceVariantInput = {
        variantName: 'Standard',
        minPax: 1,
        maxPax: 10,
        pricePerPax: 500,
        flatPrice: null,
        isDefault: true,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts variant name with exactly 1 character', () => {
      const variant: PriceVariantInput = {
        variantName: 'A',
        minPax: 1,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts variant name with 50 characters', () => {
      const variantName = 'A'.repeat(50);
      const variant: PriceVariantInput = {
        variantName,
        minPax: 1,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('rejects variant with empty name', () => {
      const variant: PriceVariantInput = {
        variantName: '',
        minPax: 1,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBe('Variant name is required.');
    });

    it('rejects variant with whitespace-only name', () => {
      const variant: PriceVariantInput = {
        variantName: '   ',
        minPax: 1,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBe('Variant name is required.');
    });

    it('rejects variant with null name', () => {
      const variant = {
        variantName: null,
        minPax: 1,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      } as any;
      const result = validatePriceVariant(variant);
      expect(result).toBe('Variant name is required.');
    });

    it('rejects variant with undefined name', () => {
      const variant = {
        minPax: 1,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      } as any;
      const result = validatePriceVariant(variant);
      expect(result).toBe('Variant name is required.');
    });

    it('rejects null variant', () => {
      const result = validatePriceVariant(null as any);
      expect(result).toBe('Variant name is required.');
    });

    it('rejects undefined variant', () => {
      const result = validatePriceVariant(undefined as any);
      expect(result).toBe('Variant name is required.');
    });
  });

  describe('validatePriceVariant - minPax validation', () => {
    it('accepts minPax of 1', () => {
      const variant: PriceVariantInput = {
        variantName: 'Solo',
        minPax: 1,
        maxPax: null,
        pricePerPax: 1000,
        flatPrice: null,
        isDefault: true,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts minPax of 100', () => {
      const variant: PriceVariantInput = {
        variantName: 'Large Group',
        minPax: 100,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('rejects minPax of 0', () => {
      const variant: PriceVariantInput = {
        variantName: 'Invalid',
        minPax: 0,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBe('Minimum pax must be at least 1.');
    });

    it('rejects negative minPax', () => {
      const variant: PriceVariantInput = {
        variantName: 'Invalid',
        minPax: -5,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBe('Minimum pax must be at least 1.');
    });

    it('rejects decimal minPax', () => {
      const variant: PriceVariantInput = {
        variantName: 'Invalid',
        minPax: 2.5,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBe('Minimum pax must be at least 1.');
    });

    it('rejects null minPax', () => {
      const variant = {
        variantName: 'Invalid',
        minPax: null,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      } as any;
      const result = validatePriceVariant(variant);
      expect(result).toBe('Minimum pax must be at least 1.');
    });

    it('rejects undefined minPax', () => {
      const variant = {
        variantName: 'Invalid',
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      } as any;
      const result = validatePriceVariant(variant);
      expect(result).toBe('Minimum pax must be at least 1.');
    });

    it('rejects NaN minPax', () => {
      const variant = {
        variantName: 'Invalid',
        minPax: NaN,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      } as any;
      const result = validatePriceVariant(variant);
      expect(result).toBe('Minimum pax must be at least 1.');
    });

    it('rejects Infinity minPax (fails Number.isFinite check)', () => {
      const variant = {
        variantName: 'Invalid',
        minPax: Infinity,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      } as any;
      const result = validatePriceVariant(variant);
      expect(result).toBe('Minimum pax must be at least 1.');
    });
  });

  describe('validatePriceVariant - maxPax validation', () => {
    it('accepts null maxPax (unlimited)', () => {
      const variant: PriceVariantInput = {
        variantName: 'Unlimited',
        minPax: 1,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: true,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts maxPax equal to minPax', () => {
      const variant: PriceVariantInput = {
        variantName: 'Exact',
        minPax: 5,
        maxPax: 5,
        pricePerPax: 500,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts maxPax greater than minPax', () => {
      const variant: PriceVariantInput = {
        variantName: 'Range',
        minPax: 1,
        maxPax: 50,
        pricePerPax: 200,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('rejects maxPax less than minPax', () => {
      const variant: PriceVariantInput = {
        variantName: 'Invalid',
        minPax: 10,
        maxPax: 5,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBe('Maximum pax cannot be less than minimum pax.');
    });

    it('rejects decimal maxPax', () => {
      const variant: PriceVariantInput = {
        variantName: 'Invalid',
        minPax: 1,
        maxPax: 10.5,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBe('Maximum pax must be a whole number.');
    });

    it('rejects non-finite maxPax', () => {
      const variant = {
        variantName: 'Invalid',
        minPax: 1,
        maxPax: NaN,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      } as any;
      const result = validatePriceVariant(variant);
      expect(result).toBe('Maximum pax must be a whole number.');
    });

    it('rejects negative maxPax', () => {
      const variant: PriceVariantInput = {
        variantName: 'Invalid',
        minPax: 1,
        maxPax: -10,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBe('Maximum pax cannot be less than minimum pax.');
    });
  });

  describe('validatePriceVariant - price validation', () => {
    it('accepts valid pricePerPax', () => {
      const variant: PriceVariantInput = {
        variantName: 'Standard',
        minPax: 1,
        maxPax: null,
        pricePerPax: 500,
        flatPrice: null,
        isDefault: true,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts valid flatPrice', () => {
      const variant: PriceVariantInput = {
        variantName: 'Group',
        minPax: 5,
        maxPax: null,
        pricePerPax: null,
        flatPrice: 2500,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts both pricePerPax and flatPrice set', () => {
      const variant: PriceVariantInput = {
        variantName: 'Both',
        minPax: 1,
        maxPax: null,
        pricePerPax: 500,
        flatPrice: 500,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('rejects both prices null', () => {
      const variant: PriceVariantInput = {
        variantName: 'Invalid',
        minPax: 1,
        maxPax: null,
        pricePerPax: null,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBe('Either price per pax or flat price must be set.');
    });

    it('rejects non-finite pricePerPax', () => {
      const variant = {
        variantName: 'Invalid',
        minPax: 1,
        maxPax: null,
        pricePerPax: NaN,
        flatPrice: null,
        isDefault: false,
      } as any;
      const result = validatePriceVariant(variant);
      expect(result).toBe('Prices must be finite numbers.');
    });

    it('rejects non-finite flatPrice', () => {
      const variant = {
        variantName: 'Invalid',
        minPax: 1,
        maxPax: null,
        pricePerPax: null,
        flatPrice: Infinity,
        isDefault: false,
      } as any;
      const result = validatePriceVariant(variant);
      expect(result).toBe('Prices must be finite numbers.');
    });

    it('accepts zero price', () => {
      const variant: PriceVariantInput = {
        variantName: 'Free',
        minPax: 1,
        maxPax: null,
        pricePerPax: 0,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts large price values', () => {
      const variant: PriceVariantInput = {
        variantName: 'Expensive',
        minPax: 1,
        maxPax: null,
        pricePerPax: 999999.99,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts negative price (for potential discounts)', () => {
      const variant: PriceVariantInput = {
        variantName: 'Discount',
        minPax: 1,
        maxPax: null,
        pricePerPax: -100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });
  });

  describe('validatePriceVariant - isDefault field', () => {
    it('accepts true isDefault', () => {
      const variant: PriceVariantInput = {
        variantName: 'Default',
        minPax: 1,
        maxPax: null,
        pricePerPax: 500,
        flatPrice: null,
        isDefault: true,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts false isDefault', () => {
      const variant: PriceVariantInput = {
        variantName: 'Alternative',
        minPax: 1,
        maxPax: null,
        pricePerPax: 500,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });
  });

  describe('validatePriceVariant - complex scenarios', () => {
    it('accepts complete valid variant with all fields', () => {
      const variant: PriceVariantInput = {
        id: 'variant-1',
        variantName: 'Complete Variant',
        minPax: 2,
        maxPax: 10,
        pricePerPax: 1500,
        flatPrice: 3000,
        isDefault: true,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('returns error message as string, not object', () => {
      const variant: PriceVariantInput = {
        variantName: '',
        minPax: 1,
        maxPax: null,
        pricePerPax: 100,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(typeof result).toBe('string');
    });

    it('returns null on success, not object', () => {
      const variant: PriceVariantInput = {
        variantName: 'Valid',
        minPax: 1,
        maxPax: 10,
        pricePerPax: 500,
        flatPrice: null,
        isDefault: true,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('accepts minPax of 1000000 (very large)', () => {
      const variant: PriceVariantInput = {
        variantName: 'Huge Group',
        minPax: 1000000,
        maxPax: null,
        pricePerPax: 1,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('accepts price of 0.01 (smallest currency unit)', () => {
      const variant: PriceVariantInput = {
        variantName: 'Cheap',
        minPax: 1,
        maxPax: null,
        pricePerPax: 0.01,
        flatPrice: null,
        isDefault: false,
      };
      const result = validatePriceVariant(variant);
      expect(result).toBeNull();
    });

    it('rejects when only pricePerPax is Infinity', () => {
      const variant = {
        variantName: 'Invalid',
        minPax: 1,
        maxPax: null,
        pricePerPax: Infinity,
        flatPrice: null,
        isDefault: false,
      } as any;
      const result = validatePriceVariant(variant);
      expect(result).toBe('Prices must be finite numbers.');
    });
  });
});
