export interface SurchargeData {
  key: string;
  label: string;
  type: 'flat' | 'percent';
  value: number;
}

export interface PositionData {
  key: string;
  netPriceCents: number;
  vatRate: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  surcharges: SurchargeData[];
}

export interface DiscountData {
  key: string;
  label: string;
  type: 'flat' | 'percent';
  value: number;
  capCents: number | null;
  appliesTo: 'subtotal' | { positionKeys: string[] };
}

export interface LineInput {
  positionKey: string;
  quantity: number;
  appliedSurchargeKeys?: string[];
}

export interface QuoteCalculatorInput {
  readonly versionId: string;
  readonly positions: readonly PositionData[];
  readonly discounts: readonly DiscountData[];
  readonly lines: readonly LineInput[];
}

//  Output types

export interface AppliedSurchargeResult {
  key: string;
  label: string;
  amountCents: number;
}

export interface AppliedDiscountResult {
  key: string;
  label: string;
  amountCents: number;
}

export interface QuoteLineResult {
  positionKey: string;
  quantity: number;
  vatRate: number;
  lineNetCents: number;
  lineGrossCents: number;
  appliedSurcharges: AppliedSurchargeResult[];
  appliedDiscounts: AppliedDiscountResult[];
}

export interface VatGroupResult {
  vatRate: number;
  netCents: number;
  vatCents: number;
  grossCents: number;
}

export interface QuoteTotalsResult {
  netCents: number;
  totalDiscountCents: number;
  vatCents: number;
  grossCents: number;
}

export interface QuoteCalculatorResult {
  versionId: string;
  lines: QuoteLineResult[];
  vatGroups: VatGroupResult[];
  totals: QuoteTotalsResult;
}

// Validation
function validateLine(line: LineInput, position: PositionData): void {
  if (line.quantity <= 0) {
    throw new Error(
      `Quantity ${line.quantity} must be positive for position "${line.positionKey}"`,
    );
  }
  if (position.minQuantity !== null && line.quantity < position.minQuantity) {
    throw new Error(
      `Quantity ${line.quantity} is below minimum ${position.minQuantity} for position "${line.positionKey}"`,
    );
  }
  if (position.maxQuantity !== null && line.quantity > position.maxQuantity) {
    throw new Error(
      `Quantity ${line.quantity} exceeds maximum ${position.maxQuantity} for position "${line.positionKey}"`,
    );
  }
  const declaredKeys = new Set(position.surcharges.map((s) => s.key));
  for (const key of line.appliedSurchargeKeys ?? []) {
    if (!declaredKeys.has(key)) {
      throw new Error(`Surcharge key "${key}" is not declared on position "${line.positionKey}"`);
    }
  }
}

// Phase 1: per-line net after surcharges

interface LineAfterSurcharges {
  positionKey: string;
  quantity: number;
  vatRate: number;
  netCents: number;
  appliedSurcharges: AppliedSurchargeResult[];
}

function applyLineSurcharges(line: LineInput, position: PositionData): LineAfterSurcharges {
  const baseNetCents = line.quantity * position.netPriceCents;
  const activeKeys = line.appliedSurchargeKeys ?? [];
  const active = position.surcharges.filter((s) => activeKeys.includes(s.key));
  const flats = active.filter((s) => s.type === 'flat');
  const percents = active.filter((s) => s.type === 'percent');

  const flatTotal = flats.reduce((sum, s) => sum + Math.round(s.value), 0);
  const baseAfterFlats = baseNetCents + flatTotal;

  // Percent surcharges chain multiplicatively: base × (1+p1) × (1+p2) × …
  const percentMultiplier = percents.reduce(
    (accumulatedMultiplier, surcharge) => accumulatedMultiplier * (1 + surcharge.value),
    1,
  );

  const netCents = Math.round(baseAfterFlats * percentMultiplier);

  const flatResults: AppliedSurchargeResult[] = flats.map((s) => ({
    key: s.key,
    label: s.label,
    amountCents: Math.round(s.value),
  }));

  const percentResults: AppliedSurchargeResult[] = percents.map((s) => ({
    key: s.key,
    label: s.label,
    amountCents: Math.round(baseAfterFlats * s.value),
  }));

  const appliedSurcharges: AppliedSurchargeResult[] = [...flatResults, ...percentResults];

  return {
    positionKey: line.positionKey,
    quantity: line.quantity,
    vatRate: position.vatRate,
    netCents,
    appliedSurcharges,
  };
}

// Phase 2: catalog discounts

function resolveDiscountAmount(discount: DiscountData, subtotalCents: number): number {
  let discountCents =
    discount.type === 'flat'
      ? Math.round(discount.value)
      : Math.round(subtotalCents * discount.value);

  // Cap is applied before stacking with the next discount.
  if (discount.capCents !== null) {
    discountCents = Math.min(discountCents, discount.capCents);
  }
  return Math.min(discountCents, subtotalCents);
}

function getApplicableLineIndices(
  discount: DiscountData,
  surchargedLines: LineAfterSurcharges[],
): number[] {
  // Discount applies to entire subtotal
  if (discount.appliesTo === 'subtotal') {
    return surchargedLines.map((_, i) => i);
  }

  // Discount applies only to specific positions
  const { positionKeys } = discount.appliesTo as { positionKeys: string[] };

  return surchargedLines.reduce<number[]>((indices, line, i) => {
    if (positionKeys.includes(line.positionKey)) {
      indices.push(i);
    }
    return indices;
  }, []);
}

function applyDiscount(
  discount: DiscountData,
  mutableLineNetCents: number[],
  discountsPerLine: AppliedDiscountResult[][],
  surchargedLines: LineAfterSurcharges[],
): void {
  const applicableLineIndices = getApplicableLineIndices(discount, surchargedLines);
  const subtotalCents = applicableLineIndices.reduce((sum, i) => sum + mutableLineNetCents[i], 0);
  if (subtotalCents <= 0 || applicableLineIndices.length === 0) return;

  const totalDiscountCents = resolveDiscountAmount(discount, subtotalCents);

  // Distribute proportionally. Remainder goes to last line to prevent cent drift.
  let distributedCents = 0;
  applicableLineIndices.forEach((lineIndex, i) => {
    const isLast = i === applicableLineIndices.length - 1;
    const lineShareCents = isLast
      ? totalDiscountCents - distributedCents
      : Math.round((mutableLineNetCents[lineIndex] / subtotalCents) * totalDiscountCents);

    distributedCents += lineShareCents;
    mutableLineNetCents[lineIndex] -= lineShareCents;

    if (lineShareCents > 0) {
      discountsPerLine[lineIndex].push({
        key: discount.key,
        label: discount.label,
        amountCents: lineShareCents,
      });
    }
  });
}

// Phase 3: VAT grouping and totals

function buildVatGroups(
  surchargedLines: LineAfterSurcharges[],
  postDiscountLineNetCents: number[],
): {
  vatGroupMap: Map<number, VatGroupResult>;
  resultLines: Omit<QuoteLineResult, 'appliedDiscounts'>[];
} {
  const vatGroupMap = new Map<number, VatGroupResult>();
  const resultLines = surchargedLines.map((line, i) => {
    const netCents = postDiscountLineNetCents[i];
    const vatCents = Math.round(netCents * line.vatRate);
    const grossCents = netCents + vatCents;

    const existing = vatGroupMap.get(line.vatRate);
    if (existing) {
      existing.netCents += netCents;
      existing.vatCents += vatCents;
      existing.grossCents += grossCents;
    } else {
      vatGroupMap.set(line.vatRate, { vatRate: line.vatRate, netCents, vatCents, grossCents });
    }

    return {
      positionKey: line.positionKey,
      quantity: line.quantity,
      vatRate: line.vatRate,
      lineNetCents: netCents,
      lineGrossCents: grossCents,
      appliedSurcharges: line.appliedSurcharges,
    };
  });

  return { vatGroupMap, resultLines };
}

//  Main function

export function calculateQuote(input: QuoteCalculatorInput): QuoteCalculatorResult {
  const positionMap = new Map(input.positions.map((p) => [p.key, p]));

  // Phase 1 — validate and apply per-line surcharges
  const surchargedLines: LineAfterSurcharges[] = input.lines.map((line) => {
    const position = positionMap.get(line.positionKey);
    if (!position) throw new Error(`Unknown position key: "${line.positionKey}"`);
    validateLine(line, position);
    return applyLineSurcharges(line, position);
  });

  // Phase 2 — apply catalog discounts in declaration order
  const mutableLineNetCents = surchargedLines.map((l) => l.netCents);
  const discountsPerLine: AppliedDiscountResult[][] = surchargedLines.map(() => []);
  for (const discount of input.discounts) {
    applyDiscount(discount, mutableLineNetCents, discountsPerLine, surchargedLines);
  }

  // Phase 3 — group by VAT rate and compute totals
  const { vatGroupMap, resultLines } = buildVatGroups(surchargedLines, mutableLineNetCents);

  // Attach per-line discounts to each result line
  const lines: QuoteLineResult[] = resultLines.map((line, i) => ({
    ...line,
    appliedDiscounts: discountsPerLine[i],
  }));

  // Vat groups in declaration order (not sorted)
  const vatGroups = Array.from(vatGroupMap.values());

  // Total discount = difference between net after surcharges and net after discounts
  const totalDiscountCents = surchargedLines.reduce(
    (sum, line, i) => sum + (line.netCents - mutableLineNetCents[i]),
    0,
  );

  // Net total after all discounts
  const totalNetCents = mutableLineNetCents.reduce((sum, netCents) => sum + netCents, 0);

  // VAT total from all groups
  const totalVatCents = vatGroups.reduce((sum, group) => sum + group.vatCents, 0);

  return {
    versionId: input.versionId,
    lines,
    vatGroups,
    totals: {
      netCents: totalNetCents,
      totalDiscountCents,
      vatCents: totalVatCents,
      grossCents: totalNetCents + totalVatCents,
    },
  };
}
