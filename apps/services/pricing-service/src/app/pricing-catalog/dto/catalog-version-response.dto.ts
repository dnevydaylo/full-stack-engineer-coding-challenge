import { ApiProperty } from '@nestjs/swagger';
import { CatalogVersion, CatalogVersionStatus } from '../entities/catalog-version.entity';
import { CatalogDiscountResponseDto } from './catalog-discount-response.dto';
import { CatalogPositionResponseDto } from './catalog-position-response.dto';

export class CatalogVersionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() craftsmanId: string;
  @ApiProperty() trade: string;
  @ApiProperty({ enum: CatalogVersionStatus }) status: CatalogVersionStatus;
  @ApiProperty() effectiveFrom: string;
  @ApiProperty({ nullable: true }) publishedBy: string | null;
  @ApiProperty({ nullable: true }) publishedAt: string | null;
  @ApiProperty({ type: [CatalogPositionResponseDto] })
  positions: CatalogPositionResponseDto[];
  @ApiProperty({ type: [CatalogDiscountResponseDto] })
  discounts: CatalogDiscountResponseDto[];
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;

  static from(v: CatalogVersion): CatalogVersionResponseDto {
    return {
      id: v.id,
      craftsmanId: v.craftsmanId,
      trade: v.trade,
      status: v.status,
      effectiveFrom: v.effectiveFrom.toISOString(),
      publishedBy: v.publishedBy,
      publishedAt: v.publishedAt?.toISOString() ?? null,
      positions: v.positions?.map(CatalogPositionResponseDto.from) ?? [],
      discounts: v.discounts?.map(CatalogDiscountResponseDto.from) ?? [],
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    };
  }
}
