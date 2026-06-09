import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DiscountType } from '../entities/catalog-discount.entity';
import { PositionUnit } from '../entities/catalog-position.entity';

export class SurchargeDto {
  @ApiProperty({ example: 'wochenendzuschlag' })
  @IsString()
  @Length(1, 100)
  key: string;

  @ApiProperty({ example: 'Wochenendzuschlag' })
  @IsString()
  @Length(1, 255)
  label: string;

  @ApiProperty({ enum: ['flat', 'percent'] })
  @IsEnum({ flat: 'flat', percent: 'percent' })
  type: 'flat' | 'percent';

  @ApiProperty({ example: 0.1 })
  @IsNumber()
  @Min(0)
  value: number;
}

export class CreateCatalogPositionDto {
  @ApiProperty({ example: 'Fenster installation' })
  @IsString()
  @Length(1, 100)
  key: string;

  @ApiProperty({ example: 'Fenster-Einbau PVC 100×120cm' })
  @IsString()
  @Length(1, 255)
  label: string;

  @ApiProperty({ enum: PositionUnit })
  @IsEnum(PositionUnit)
  unit: PositionUnit;

  @ApiProperty({ example: 15000, description: ' Nettopreis in ganzzahligen Cent' })
  @IsInt()
  @Min(0)
  netPriceCents: number;

  @ApiProperty({ example: 0.19 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  vatRate: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantity?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxQuantity?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  tradeAttributes?: Record<string, unknown>;

  @ApiProperty({ required: false, type: [SurchargeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurchargeDto)
  surcharges?: SurchargeDto[];
}

export class CreateCatalogDiscountDto {
  @ApiProperty({ example: 'Kundenrabatt' })
  @IsString()
  @Length(1, 100)
  key: string;

  @ApiProperty({ example: 'Treuerabatt' })
  @IsString()
  @Length(1, 255)
  label: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  type: DiscountType;

  @ApiProperty({ example: 0.05 })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiProperty({ required: false, description: 'Maximaler Rabatt in Euro-Cent' })
  @IsOptional()
  @IsInt()
  @Min(0)
  capCents?: number | null;

  @ApiProperty({ description: '"subtotal" or { positionKeys: string[] }' })
  appliesTo: 'subtotal' | { positionKeys: string[] };
}

export class UpdateCatalogVersionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiProperty({ required: false, type: [CreateCatalogPositionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCatalogPositionDto)
  positions?: CreateCatalogPositionDto[];

  @ApiProperty({ required: false, type: [CreateCatalogDiscountDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCatalogDiscountDto)
  discounts?: CreateCatalogDiscountDto[];
}
