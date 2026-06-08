import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { dataSourceOptions } from '../data-source';
import { AuthModule } from './auth/auth.module';
import { CraftsmenModule } from './craftsmen/craftsmen.module';
import { TradesModule } from './trades/trades.module';
import { HealthModule } from './health/health.module';
import { PricingCatalogModule } from './pricing-catalog/pricing-catalog.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
      autoLoadEntities: false,
    }),
    AuthModule,
    CraftsmenModule,
    TradesModule,
    HealthModule,
    PricingCatalogModule,
  ],
})
export class AppModule {}
