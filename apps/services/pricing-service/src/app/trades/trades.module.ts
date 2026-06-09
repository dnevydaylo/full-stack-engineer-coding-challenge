import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatalogPosition } from '../pricing-catalog/entities/catalog-position.entity';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';
import { TradeConfig } from './entities/trade-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TradeConfig, CatalogPosition])],
  providers: [TradesService],
  controllers: [TradesController],
  exports: [TradesService],
})
export class TradesModule {}
