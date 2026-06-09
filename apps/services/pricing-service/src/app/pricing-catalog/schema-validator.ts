import { PricingSchemaField } from '../trades/entities/trade-config.entity';

export interface SchemaViolation {
  field: string;
  reason: string;
}

/**
 * Validates `attributes` against `schema`.
 * Returns an empty array when valid, or a list of violations.
 * Pure function — no framework dependencies.
 */
export function validateTradeAttributes(
  attributes: Record<string, unknown>,
  schema: PricingSchemaField[] | null,
): SchemaViolation[] {
  if (!schema) return [];
  const violations: SchemaViolation[] = [];

  for (const field of schema) {
    if (field.dependsOn) {
      const conditionMet =
        String(attributes[field.dependsOn.field] ?? '') === field.dependsOn.equals;
      if (!conditionMet) continue;
    }

    const value = attributes[field.name];
    const absent = value === undefined || value === null;

    if (field.required && absent) {
      violations.push({ field: field.name, reason: 'required field is missing' });
      continue;
    }

    if (absent) continue;

    switch (field.type) {
      case 'number':
        if (typeof value !== 'number') {
          violations.push({ field: field.name, reason: `expected number, got ${typeof value}` });
          break;
        }
        if (field.min !== undefined && value < field.min) {
          violations.push({
            field: field.name,
            reason: `value ${value} is below minimum ${field.min}`,
          });
        }
        if (field.max !== undefined && value > field.max) {
          violations.push({
            field: field.name,
            reason: `value ${value} exceeds maximum ${field.max}`,
          });
        }
        break;
      case 'string':
        if (typeof value !== 'string') {
          violations.push({ field: field.name, reason: `expected string, got ${typeof value}` });
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          violations.push({ field: field.name, reason: `expected boolean, got ${typeof value}` });
        }
        break;
      case 'enum':
        if (!field.allowedValues?.includes(String(value))) {
          violations.push({
            field: field.name,
            reason: `"${value}" is not in: ${field.allowedValues?.join(', ')}`,
          });
        }
        break;
    }
  }

  return violations;
}
