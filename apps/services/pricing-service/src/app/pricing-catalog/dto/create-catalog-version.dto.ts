import { ApiProperty } from '@nestjs/swagger';
import { TRADE_CODES, TradeCode } from '@sandbox/types';
import { IsIn, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateCatalogVersionDto {
  @ApiProperty({ description: 'ID des Handwerkers' })
  @IsNotEmpty()
  @IsUUID()
  craftsmanId: string;

  @ApiProperty({ enum: TRADE_CODES, description: 'Handwerkszweig für den dieser Katalog gilt' })
  @IsNotEmpty()
  @IsIn(TRADE_CODES)
  trade: TradeCode;

  @ApiProperty({ description: 'Datum ab wann die Katalogversion gültig ist' })
  @IsNotEmpty()
  effectiveFrom: string;
}
