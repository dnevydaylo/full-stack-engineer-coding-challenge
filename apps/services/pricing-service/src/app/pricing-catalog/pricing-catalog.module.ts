import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatalogVersion } from './entities/catalog-version.entity';
import { CatalogPosition } from './entities/catalog-position.entity';
import { CatalogDiscount } from './entities/catalog-discount.entity';
import { PricingCatalogService } from './pricing-catalog.service';
import { PricingCatalogController } from './pricing-catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogVersion, CatalogPosition, CatalogDiscount])],
  providers: [PricingCatalogService],
  controllers: [PricingCatalogController],
  exports: [PricingCatalogService],
})
export class PricingCatalogModule {}
