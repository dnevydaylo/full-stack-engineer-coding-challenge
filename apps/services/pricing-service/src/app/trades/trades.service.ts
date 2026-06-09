import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CatalogPosition } from '../pricing-catalog/entities/catalog-position.entity';
import { validateTradeAttributes } from '../pricing-catalog/schema-validator';
import { TradeConfigResponseDto } from './dto/trade-config-response.dto';
import { UpdateTradeConfigDto } from './dto/update-trade-config.dto';
import { TradeConfig } from './entities/trade-config.entity';

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(
    @InjectRepository(TradeConfig) private readonly repo: Repository<TradeConfig>,
    @InjectRepository(CatalogPosition) private readonly positions: Repository<CatalogPosition>,
  ) {}

  async list(): Promise<TradeConfigResponseDto[]> {
    const items = await this.repo.find({ order: { trade: 'ASC' } });
    return items.map(TradeConfigResponseDto.from);
  }

  async findByCode(trade: string): Promise<TradeConfigResponseDto> {
    const found = await this.repo.findOne({ where: { trade } });
    if (!found) throw new NotFoundException(`Trade ${trade} not found`);
    return TradeConfigResponseDto.from(found);
  }

  async update(trade: string, dto: UpdateTradeConfigDto): Promise<TradeConfigResponseDto> {
    const config = await this.repo.findOne({ where: { trade } });
    if (!config) throw new NotFoundException(`Trade '${trade}' not found`);

    if (dto.pricingSchema !== undefined && dto.pricingSchema !== null) {
      const allPositions = await this.positions
        .createQueryBuilder('p')
        .innerJoin('p.version', 'v')
        .where('v.trade = :trade', { trade })
        .select(['p.id', 'p.versionId', 'p.key', 'p.tradeAttributes'])
        .getMany();

      const violations = allPositions.flatMap((pos) => {
        const errors = validateTradeAttributes(pos.tradeAttributes, dto.pricingSchema!);
        return errors.length > 0 ? [{ positionId: pos.id, positionKey: pos.key, errors }] : [];
      });

      if (violations.length > 0) {
        throw new ConflictException({
          message: 'New pricingSchema invalidates existing positions',
          violations,
        });
      }
    }

    if (dto.displayName !== undefined) config.displayName = dto.displayName;
    if (dto.pricingSchema !== undefined) config.pricingSchema = dto.pricingSchema;

    await this.repo.save(config);
    this.logger.log(`Updated trade config for '${trade}'`);
    return TradeConfigResponseDto.from(config);
  }
}
