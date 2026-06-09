import { PricingSchemaField } from '../trades/entities/trade-config.entity';
import { validateTradeAttributes } from './schema-validator';

describe('validateTradeAttributes', () => {
  describe('null schema', () => {
    it('returns no violations when schema is null', () => {
      expect(validateTradeAttributes({ anything: 'value' }, null)).toEqual([]);
    });
  });

  describe('required fields', () => {
    const schema: PricingSchemaField[] = [
      { name: 'power', type: 'number', required: true },
    ];

    it('returns violation when required field is missing', () => {
      const violations = validateTradeAttributes({}, schema);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({ field: 'power', reason: 'required field is missing' });
    });

    it('returns violation when required field is null', () => {
      const violations = validateTradeAttributes({ power: null }, schema);
      expect(violations).toHaveLength(1);
    });

    it('returns no violations when required field is present', () => {
      expect(validateTradeAttributes({ power: 5 }, schema)).toEqual([]);
    });
  });

  describe('optional fields', () => {
    const schema: PricingSchemaField[] = [
      { name: 'label', type: 'string', required: false },
    ];

    it('returns no violations when optional field is absent', () => {
      expect(validateTradeAttributes({}, schema)).toEqual([]);
    });
  });

  describe('type: number', () => {
    const schema: PricingSchemaField[] = [
      { name: 'power', type: 'number', required: true, min: 1, max: 100 },
    ];

    it('returns violation when value is not a number', () => {
      const violations = validateTradeAttributes({ power: 'five' }, schema);
      expect(violations[0]).toMatchObject({ field: 'power' });
      expect(violations[0].reason).toContain('expected number');
    });

    it('returns violation when value is below min', () => {
      const violations = validateTradeAttributes({ power: 0 }, schema);
      expect(violations[0].reason).toContain('below minimum');
    });

    it('returns violation when value exceeds max', () => {
      const violations = validateTradeAttributes({ power: 101 }, schema);
      expect(violations[0].reason).toContain('exceeds maximum');
    });

    it('returns no violations for value within range', () => {
      expect(validateTradeAttributes({ power: 50 }, schema)).toEqual([]);
    });

    it('accepts boundary values', () => {
      expect(validateTradeAttributes({ power: 1 }, schema)).toEqual([]);
      expect(validateTradeAttributes({ power: 100 }, schema)).toEqual([]);
    });
  });

  describe('type: string', () => {
    const schema: PricingSchemaField[] = [
      { name: 'brand', type: 'string', required: true },
    ];

    it('returns violation when value is not a string', () => {
      const violations = validateTradeAttributes({ brand: 42 }, schema);
      expect(violations[0].reason).toContain('expected string');
    });

    it('returns no violations for a string value', () => {
      expect(validateTradeAttributes({ brand: 'Viessmann' }, schema)).toEqual([]);
    });
  });

  describe('type: boolean', () => {
    const schema: PricingSchemaField[] = [
      { name: 'hasWarranty', type: 'boolean', required: true },
    ];

    it('returns violation when value is not a boolean', () => {
      const violations = validateTradeAttributes({ hasWarranty: 'yes' }, schema);
      expect(violations[0].reason).toContain('expected boolean');
    });

    it('returns no violations for true', () => {
      expect(validateTradeAttributes({ hasWarranty: true }, schema)).toEqual([]);
    });

    it('returns no violations for false', () => {
      expect(validateTradeAttributes({ hasWarranty: false }, schema)).toEqual([]);
    });
  });

  describe('type: enum', () => {
    const schema: PricingSchemaField[] = [
      { name: 'fuel', type: 'enum', required: true, allowedValues: ['gas', 'oil', 'heat-pump'] },
    ];

    it('returns violation when value is not in allowedValues', () => {
      const violations = validateTradeAttributes({ fuel: 'wood' }, schema);
      expect(violations[0].reason).toContain('is not in');
    });

    it('returns no violations for an allowed value', () => {
      expect(validateTradeAttributes({ fuel: 'gas' }, schema)).toEqual([]);
    });
  });

  describe('dependsOn', () => {
    const schema: PricingSchemaField[] = [
      { name: 'fuelType', type: 'enum', required: true, allowedValues: ['gas', 'oil'] },
      {
        name: 'tankSizeLiters',
        type: 'number',
        required: true,
        min: 100,
        dependsOn: { field: 'fuelType', equals: 'oil' },
      },
    ];

    it('skips conditional field when condition is not met', () => {
      expect(validateTradeAttributes({ fuelType: 'gas' }, schema)).toEqual([]);
    });

    it('validates conditional field when condition is met', () => {
      const violations = validateTradeAttributes({ fuelType: 'oil' }, schema);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({ field: 'tankSizeLiters', reason: 'required field is missing' });
    });

    it('validates conditional field value when condition is met and field is present', () => {
      const violations = validateTradeAttributes({ fuelType: 'oil', tankSizeLiters: 50 }, schema);
      expect(violations[0].reason).toContain('below minimum');
    });

    it('returns no violations when condition met and value is valid', () => {
      expect(validateTradeAttributes({ fuelType: 'oil', tankSizeLiters: 500 }, schema)).toEqual([]);
    });
  });

  describe('unknown fields', () => {
    const schema: PricingSchemaField[] = [
      { name: 'power', type: 'number', required: true },
    ];

    it('ignores attributes that are not declared in the schema', () => {
      const violations = validateTradeAttributes({ power: 10, unknownField: 'ignored' }, schema);
      expect(violations).toEqual([]);
    });
  });

  describe('multiple violations', () => {
    const schema: PricingSchemaField[] = [
      { name: 'power', type: 'number', required: true },
      { name: 'brand', type: 'string', required: true },
    ];

    it('returns all violations at once', () => {
      const violations = validateTradeAttributes({}, schema);
      expect(violations).toHaveLength(2);
    });
  });
});
