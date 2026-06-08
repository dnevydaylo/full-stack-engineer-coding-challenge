import { ApiProperty } from '@nestjs/swagger';
import { TRADE_CODES, TradeCode } from '@sandbox/types';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class QueryCatalogVersionsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  craftsmanId?: string;

  @ApiProperty({ required: false, enum: TRADE_CODES })
  @IsOptional()
  @IsIn(TRADE_CODES)
  trade?: TradeCode;
}
