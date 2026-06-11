import { apiClient } from './api.service';

//  Enums

export type CatalogVersionStatus = 'draft' | 'published';
export type PositionUnit = 'piece' | 'm2' | 'meter' | 'hour' | 'flat';
export type DiscountType = 'flat' | 'percent';
export type SchemaFieldType = 'string' | 'number' | 'boolean' | 'enum';

//  Schema

export interface PricingSchemaField {
  name: string;
  type: SchemaFieldType;
  required: boolean;
  min?: number;
  max?: number;
  allowedValues?: string[];
  dependsOn?: { field: string; equals: string };
}

//  Response shapes

export interface SurchargeResponse {
  key: string;
  label: string;
  type: 'flat' | 'percent';
  value: number;
}

export interface CatalogPositionResponse {
  id: string;
  versionId: string;
  key: string;
  label: string;
  unit: PositionUnit;
  netPriceCents: number;
  netPriceFormatted: string;
  vatRate: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  tradeAttributes: Record<string, unknown>;
  surcharges: SurchargeResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogDiscountResponse {
  id: string;
  versionId: string;
  key: string;
  label: string;
  type: DiscountType;
  value: number;
  capCents: number | null;
  appliesTo: 'subtotal' | { positionKeys: string[] };
  createdAt: string;
  updatedAt: string;
}

export interface CatalogVersionResponse {
  id: string;
  craftsmanId: string;
  trade: string;
  status: CatalogVersionStatus;
  effectiveFrom: string;
  publishedBy: string | null;
  publishedAt: string | null;
  positions: CatalogPositionResponse[];
  discounts: CatalogDiscountResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface TradeConfigResponse {
  id: string;
  trade: string;
  displayName: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
  pricingSchema: PricingSchemaField[] | null;
}

// Quote response

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

export interface QuoteTotals {
  netCents: number;
  totalDiscountCents: number;
  vatCents: number;
  grossCents: number;
}

export interface QuoteResponse {
  versionId: string;
  lines: QuoteLineResult[];
  vatGroups: VatGroupResult[];
  totals: QuoteTotals;
}

//  Request bodies

export interface SurchargeBody {
  key: string;
  label: string;
  type: 'flat' | 'percent';
  value: number;
}

export interface PositionBody {
  key: string;
  label: string;
  unit: PositionUnit;
  netPriceCents: number;
  vatRate: number;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  tradeAttributes?: Record<string, unknown>;
  surcharges?: SurchargeBody[];
}

export interface DiscountBody {
  key: string;
  label: string;
  type: DiscountType;
  value: number;
  capCents?: number | null;
  appliesTo: 'subtotal' | { positionKeys: string[] };
}

export interface CreateVersionBody {
  craftsmanId: string;
  trade: string;
  effectiveFrom: string;
}

export interface UpdateVersionBody {
  effectiveFrom?: string;
  positions?: PositionBody[];
  discounts?: DiscountBody[];
}

export interface QuoteLineRequest {
  positionKey: string;
  quantity: number;
  appliedSurchargeKeys?: string[];
}

export interface QuoteRequest {
  lines: QuoteLineRequest[];
}

// API functions

export function fetchVersions(
  craftsmanId: string,
  trade?: string,
): Promise<CatalogVersionResponse[]> {
  const params: Record<string, string> = { craftsmanId };
  if (trade) params['trade'] = trade;
  return apiClient
    .get<CatalogVersionResponse[]>('/pricing-catalogs', { params })
    .then((r) => r.data);
}

export function fetchVersion(versionId: string): Promise<CatalogVersionResponse> {
  return apiClient
    .get<CatalogVersionResponse>(`/pricing-catalogs/${versionId}`)
    .then((r) => r.data);
}

export function createVersion(body: CreateVersionBody): Promise<CatalogVersionResponse> {
  return apiClient.post<CatalogVersionResponse>('/pricing-catalogs', body).then((r) => r.data);
}

export function updateVersion(
  versionId: string,
  body: UpdateVersionBody,
): Promise<CatalogVersionResponse> {
  return apiClient
    .patch<CatalogVersionResponse>(`/pricing-catalogs/${versionId}`, body)
    .then((r) => r.data);
}

export function publishVersion(versionId: string): Promise<CatalogVersionResponse> {
  return apiClient
    .post<CatalogVersionResponse>(`/pricing-catalogs/${versionId}/publish`)
    .then((r) => r.data);
}

export function calculateQuote(versionId: string, body: QuoteRequest): Promise<QuoteResponse> {
  return apiClient
    .post<QuoteResponse>(`/pricing-catalogs/${versionId}/quote`, body)
    .then((r) => r.data);
}

export function fetchTrade(trade: string): Promise<TradeConfigResponse> {
  return apiClient.get<TradeConfigResponse>(`/trades/${trade}`).then((r) => r.data);
}
