import { ApiProperty } from '@nestjs/swagger';
import { CatalogPosition, PositionUnit, Surcharge } from '../entities/catalog-position.entity';

export class CatalogPositionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() versionId: string;
  @ApiProperty() key: string;
  @ApiProperty() label: string;
  @ApiProperty({ enum: PositionUnit }) unit: PositionUnit;
  @ApiProperty() netPriceCents: number;
  @ApiProperty() netPriceFormatted: string;
  @ApiProperty() vatRate: number;
  @ApiProperty({ nullable: true }) minQuantity: number | null;
  @ApiProperty({ nullable: true }) maxQuantity: number | null;
  @ApiProperty() tradeAttributes: Record<string, unknown>;
  @ApiProperty({ type: [Object] }) surcharges: Surcharge[];
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;

  static from(p: CatalogPosition): CatalogPositionResponseDto {
    return {
      id: p.id,
      versionId: p.versionId,
      key: p.key,
      label: p.label,
      unit: p.unit,
      netPriceCents: p.netPriceCents,
      netPriceFormatted: new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
      }).format(p.netPriceCents / 100),
      vatRate: p.vatRate,
      minQuantity: p.minQuantity,
      maxQuantity: p.maxQuantity,
      tradeAttributes: p.tradeAttributes,
      surcharges: p.surcharges,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
