import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuoteLineRequestDto {
  @ApiProperty({ example: 'window-install-pvc' })
  @IsString()
  @IsNotEmpty()
  positionKey: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ required: false, type: [String], example: ['weekend-surcharge'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  appliedSurchargeKeys?: string[];
}

export class QuoteRequestDto {
  @ApiProperty({ type: [QuoteLineRequestDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineRequestDto)
  lines: QuoteLineRequestDto[];
}
