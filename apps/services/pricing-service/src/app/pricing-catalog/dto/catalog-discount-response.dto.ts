import { ApiProperty } from '@nestjs/swagger';
import { CatalogDiscount, DiscountAppliesTo, DiscountType } from '../entities/catalog-discount.entity';

export class CatalogDiscountResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() versionId: string;
  @ApiProperty() key: string;
  @ApiProperty() label: string;
  @ApiProperty({ enum: DiscountType }) type: DiscountType;
  @ApiProperty() value: number;
  @ApiProperty({ nullable: true }) capCents: number | null;
  @ApiProperty({ description: '"subtotal" or { positionKeys: string[] }' }) appliesTo: DiscountAppliesTo;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;

  static from(d: CatalogDiscount): CatalogDiscountResponseDto {
    return {
      id: d.id,
      versionId: d.versionId,
      key: d.key,
      label: d.label,
      type: d.type,
      value: d.value,
      capCents: d.capCents,
      appliesTo: d.appliesTo,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}
