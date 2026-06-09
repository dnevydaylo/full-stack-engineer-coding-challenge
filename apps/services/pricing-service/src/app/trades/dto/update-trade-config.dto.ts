import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PricingSchemaField } from '../entities/trade-config.entity';

export class UpdateTradeConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  displayName?: string;

  @ApiPropertyOptional({ type: [Object], nullable: true })
  @IsOptional()
  @IsArray()
  pricingSchema?: PricingSchemaField[] | null;
}
