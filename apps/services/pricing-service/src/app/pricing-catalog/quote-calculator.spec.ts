import {
  calculateQuote,
  DiscountData,
  LineInput,
  PositionData,
  QuoteCalculatorInput,
} from './quote-calculator';

// Fixtures

function makePosition(overrides: Partial<PositionData> = {}): PositionData {
  return {
    key: 'p1',
    netPriceCents: 1000,
    vatRate: 0.19,
    minQuantity: null,
    maxQuantity: null,
    surcharges: [],
    ...overrides,
  };
}

function makeInput(
  positions: PositionData[],
  lines: LineInput[],
  discounts: DiscountData[] = [],
): QuoteCalculatorInput {
  return { versionId: 'v-1', positions, discounts, lines };
}

// Happy path

describe('calculateQuote – happy path', () => {
  it('returns correct net, VAT and gross for a single line without surcharges', () => {
    const result = calculateQuote(
      makeInput([makePosition()], [{ positionKey: 'p1', quantity: 2 }]),
    );

    expect(result.versionId).toBe('v-1');
    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    // net: 2 * 1000 = 2000, vat: round(2000 * 0.19) = 380, gross: 2380
    expect(line.lineNetCents).toBe(2000);
    expect(line.lineGrossCents).toBe(2380);
    expect(line.appliedSurcharges).toHaveLength(0);
    expect(line.appliedDiscounts).toHaveLength(0);

    expect(result.totals.netCents).toBe(2000);
    expect(result.totals.vatCents).toBe(380);
    expect(result.totals.grossCents).toBe(2380);
    expect(result.totals.totalDiscountCents).toBe(0);
  });

  it('handles an empty line list and returns zero totals', () => {
    const result = calculateQuote(makeInput([makePosition()], []));

    expect(result.lines).toHaveLength(0);
    expect(result.vatGroups).toHaveLength(0);
    expect(result.totals.netCents).toBe(0);
    expect(result.totals.vatCents).toBe(0);
    expect(result.totals.grossCents).toBe(0);
    expect(result.totals.totalDiscountCents).toBe(0);
  });
});

// Quote error cases

describe('calculateQuote – validation errors', () => {
  it('throws for an unknown position key', () => {
    expect(() =>
      calculateQuote(makeInput([makePosition()], [{ positionKey: 'unknown', quantity: 1 }])),
    ).toThrow(/Unknown position key/);
  });

  it('throws when quantity is below position minimum', () => {
    const pos = makePosition({ key: 'p1', minQuantity: 5, maxQuantity: null });
    expect(() => calculateQuote(makeInput([pos], [{ positionKey: 'p1', quantity: 2 }]))).toThrow(
      /below minimum/,
    );
  });

  it('throws when quantity exceeds position maximum', () => {
    const pos = makePosition({ key: 'p1', minQuantity: null, maxQuantity: 10 });
    expect(() => calculateQuote(makeInput([pos], [{ positionKey: 'p1', quantity: 11 }]))).toThrow(
      /exceeds maximum/,
    );
  });

  it('throws when quantity is zero', () => {
    expect(() =>
      calculateQuote(makeInput([makePosition()], [{ positionKey: 'p1', quantity: 0 }])),
    ).toThrow(/must be positive/);
  });

  it('throws for an undeclared surcharge key on a line', () => {
    const pos = makePosition({ surcharges: [] });
    expect(() =>
      calculateQuote(
        makeInput([pos], [{ positionKey: 'p1', quantity: 1, appliedSurchargeKeys: ['weekend'] }]),
      ),
    ).toThrow(/not declared/);
  });
});

// Mixed VAT rates

describe('calculateQuote – mixed VAT rates', () => {
  it('groups lines by VAT rate and computes per-rate subtotals correctly', () => {
    const p1 = makePosition({ key: 'p1', netPriceCents: 1000, vatRate: 0.19 });
    const p2 = makePosition({ key: 'p2', netPriceCents: 2000, vatRate: 0.07 });
    const result = calculateQuote(
      makeInput(
        [p1, p2],
        [
          { positionKey: 'p1', quantity: 1 },
          { positionKey: 'p2', quantity: 1 },
        ],
      ),
    );

    expect(result.vatGroups).toHaveLength(2);

    const g19 = result.vatGroups.find((g) => g.vatRate === 0.19)!;
    expect(g19.netCents).toBe(1000);
    expect(g19.vatCents).toBe(190); // round(1000 * 0.19)
    expect(g19.grossCents).toBe(1190);

    const g07 = result.vatGroups.find((g) => g.vatRate === 0.07)!;
    expect(g07.netCents).toBe(2000);
    expect(g07.vatCents).toBe(140); // round(2000 * 0.07)
    expect(g07.grossCents).toBe(2140);

    expect(result.totals.netCents).toBe(3000);
    expect(result.totals.vatCents).toBe(330);
    expect(result.totals.grossCents).toBe(3330);
  });
});

// Percent discount with cap

describe('calculateQuote – percent discount with cap', () => {
  it('applies a percent discount capped at capCents', () => {
    // 10% of 10000 = 1000, but cap is 500 → discount = 500
    const discount: DiscountData = {
      key: 'd1',
      label: '10% Rabatt',
      type: 'percent',
      value: 0.1,
      capCents: 500,
      appliesTo: 'subtotal',
    };
    const result = calculateQuote(
      makeInput(
        [makePosition({ netPriceCents: 10000 })],
        [{ positionKey: 'p1', quantity: 1 }],
        [discount],
      ),
    );

    expect(result.totals.totalDiscountCents).toBe(500);
    expect(result.totals.netCents).toBe(9500);
    expect(result.lines[0].appliedDiscounts[0].amountCents).toBe(500);
  });

  it('applies a percent discount fully when below cap', () => {
    const discount: DiscountData = {
      key: 'd1',
      label: '5%',
      type: 'percent',
      value: 0.05,
      capCents: 10000,
      appliesTo: 'subtotal',
    };
    const result = calculateQuote(
      makeInput(
        [makePosition({ netPriceCents: 1000 })],
        [{ positionKey: 'p1', quantity: 1 }],
        [discount],
      ),
    );

    expect(result.totals.totalDiscountCents).toBe(50); // 5% of 1000
  });
});

// Multiple stacked discounts

describe('calculateQuote – multiple stacked discounts', () => {
  it('applies discounts sequentially and accumulates total discount', () => {
    // net = 10000
    // discount 1: percent 10% → -1000 → running net 9000
    // discount 2: flat 500 → -500 → running net 8500
    const discounts: DiscountData[] = [
      {
        key: 'd1',
        label: '10%',
        type: 'percent',
        value: 0.1,
        capCents: null,
        appliesTo: 'subtotal',
      },
      { key: 'd2', label: '5€', type: 'flat', value: 500, capCents: null, appliesTo: 'subtotal' },
    ];
    const result = calculateQuote(
      makeInput(
        [makePosition({ netPriceCents: 10000 })],
        [{ positionKey: 'p1', quantity: 1 }],
        discounts,
      ),
    );

    expect(result.totals.totalDiscountCents).toBe(1500);
    expect(result.totals.netCents).toBe(8500);
    expect(result.lines[0].appliedDiscounts).toHaveLength(2);
  });

  it('applies a position-scoped discount only to matching lines', () => {
    const p1 = makePosition({ key: 'p1', netPriceCents: 1000 });
    const p2 = makePosition({ key: 'p2', netPriceCents: 2000 });
    const discount: DiscountData = {
      key: 'd1',
      label: 'Only p1',
      type: 'flat',
      value: 200,
      capCents: null,
      appliesTo: { positionKeys: ['p1'] },
    };
    const result = calculateQuote(
      makeInput(
        [p1, p2],
        [
          { positionKey: 'p1', quantity: 1 },
          { positionKey: 'p2', quantity: 1 },
        ],
        [discount],
      ),
    );

    const lineP1 = result.lines.find((l) => l.positionKey === 'p1')!;
    const lineP2 = result.lines.find((l) => l.positionKey === 'p2')!;
    expect(lineP1.appliedDiscounts).toHaveLength(1);
    expect(lineP2.appliedDiscounts).toHaveLength(0);
    expect(result.totals.totalDiscountCents).toBe(200);
    expect(result.totals.netCents).toBe(2800); // 1000 - 200 + 2000
  });
});

// Surcharge application

describe('calculateQuote – surcharges', () => {
  it('applies a flat surcharge to the base net', () => {
    const pos = makePosition({
      netPriceCents: 1000,
      surcharges: [{ key: 'travel', label: 'Anfahrt', type: 'flat', value: 500 }],
    });
    const result = calculateQuote(
      makeInput([pos], [{ positionKey: 'p1', quantity: 2, appliedSurchargeKeys: ['travel'] }]),
    );
    // base=2*1000=2000, flat+500, net=2500
    expect(result.lines[0].lineNetCents).toBe(2500);
    expect(result.lines[0].appliedSurcharges[0].amountCents).toBe(500);
  });

  it('applies a percent surcharge multiplicatively', () => {
    const pos = makePosition({
      netPriceCents: 1000,
      surcharges: [{ key: 'wknd', label: 'Wochenende', type: 'percent', value: 0.25 }],
    });
    const result = calculateQuote(
      makeInput([pos], [{ positionKey: 'p1', quantity: 1, appliedSurchargeKeys: ['wknd'] }]),
    );
    // base=1000, percent → 1000 * 1.25 = 1250
    expect(result.lines[0].lineNetCents).toBe(1250);
  });
});

// Property / invariant tests

describe('calculateQuote – invariants', () => {
  it('gross >= net for all non-negative inputs across varied prices and rates', () => {
    const cases: Array<{ price: number; vatRate: number; qty: number }> = [
      { price: 0, vatRate: 0, qty: 1 },
      { price: 100, vatRate: 0, qty: 1 },
      { price: 100, vatRate: 0.07, qty: 3 },
      { price: 5000, vatRate: 0.19, qty: 1 },
      { price: 9999, vatRate: 0.19, qty: 7 },
      { price: 1, vatRate: 0.19, qty: 100 },
    ];

    for (const { price, vatRate, qty } of cases) {
      const pos = makePosition({ netPriceCents: price, vatRate });
      const result = calculateQuote(makeInput([pos], [{ positionKey: 'p1', quantity: qty }]));
      const line = result.lines[0];
      expect(line.lineGrossCents).toBeGreaterThanOrEqual(line.lineNetCents);
      expect(result.totals.grossCents).toBeGreaterThanOrEqual(result.totals.netCents);
    }
  });
});
