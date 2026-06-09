import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CatalogPosition } from '../pricing-catalog/entities/catalog-position.entity';
import { TradeConfig } from './entities/trade-config.entity';
import { TradesService } from './trades.service';

function buildTradeConfig(overrides: Partial<TradeConfig> = {}): TradeConfig {
  return {
    id: '1',
    trade: 'HVAC',
    displayName: 'Heating',
    isActive: true,
    pricingSchema: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TradeConfig;
}

describe('TradesService', () => {
  let service: TradesService;
  let repo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let positionsQb: Record<string, jest.Mock>;
  let positionsRepo: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    positionsQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((x: TradeConfig) => Promise.resolve(x)),
    };

    positionsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(positionsQb),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TradesService,
        { provide: getRepositoryToken(TradeConfig), useValue: repo as Partial<Repository<TradeConfig>> },
        { provide: getRepositoryToken(CatalogPosition), useValue: positionsRepo },
      ],
    }).compile();

    service = moduleRef.get(TradesService);
  });

  // list

  describe('list', () => {
    it('returns mapped trade configs ordered by trade', async () => {
      repo.find.mockResolvedValue([buildTradeConfig()]);
      const result = await service.list();
      expect(repo.find).toHaveBeenCalledWith({ order: { trade: 'ASC' } });
      expect(result[0].trade).toBe('HVAC');
    });
  });

  // findByCode

  describe('findByCode', () => {
    it('returns one config', async () => {
      repo.findOne.mockResolvedValue(buildTradeConfig());
      const result = await service.findByCode('HVAC');
      expect(result.trade).toBe('HVAC');
    });

    it('throws NotFoundException when trade is unknown', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findByCode('UNKNOWN')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // update

  describe('update', () => {
    it('throws NotFoundException when trade does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update('UNKNOWN', { displayName: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('updates displayName without touching pricingSchema', async () => {
      repo.findOne.mockResolvedValue(buildTradeConfig());
      const result = await service.update('HVAC', { displayName: 'Klimatechnik' });
      expect(result.displayName).toBe('Klimatechnik');
      expect(positionsRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('updates pricingSchema when no positions exist', async () => {
      repo.findOne.mockResolvedValue(buildTradeConfig());
      positionsQb.getMany.mockResolvedValue([]);
      const newSchema = [{ name: 'power', type: 'number' as const, required: true }];

      const result = await service.update('HVAC', { pricingSchema: newSchema });
      expect(result.pricingSchema).toEqual(newSchema);
    });

    it('updates pricingSchema when all positions satisfy the new schema', async () => {
      repo.findOne.mockResolvedValue(buildTradeConfig());
      positionsQb.getMany.mockResolvedValue([
        { id: 'pos-1', versionId: 'v-1', key: 'p1', tradeAttributes: { power: 5 } },
      ]);
      const newSchema = [{ name: 'power', type: 'number' as const, required: true }];

      const result = await service.update('HVAC', { pricingSchema: newSchema });
      expect(result.pricingSchema).toEqual(newSchema);
    });

    it('throws ConflictException when new pricingSchema invalidates existing positions', async () => {
      repo.findOne.mockResolvedValue(buildTradeConfig());
      positionsQb.getMany.mockResolvedValue([
        { id: 'pos-1', versionId: 'v-1', key: 'p1', tradeAttributes: {} },
      ]);
      const newSchema = [{ name: 'power', type: 'number' as const, required: true }];

      await expect(service.update('HVAC', { pricingSchema: newSchema })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('conflict response includes positionId and positionKey of every offending position', async () => {
      repo.findOne.mockResolvedValue(buildTradeConfig());
      positionsQb.getMany.mockResolvedValue([
        { id: 'pos-1', versionId: 'v-1', key: 'boiler', tradeAttributes: {} },
        { id: 'pos-2', versionId: 'v-1', key: 'pump', tradeAttributes: {} },
      ]);
      const newSchema = [{ name: 'power', type: 'number' as const, required: true }];

      const error = await service.update('HVAC', { pricingSchema: newSchema }).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      const { violations } = error.getResponse() as { violations: unknown[] };
      expect(violations).toHaveLength(2);
    });

    it('skips schema validation when pricingSchema is null', async () => {
      repo.findOne.mockResolvedValue(buildTradeConfig());
      await service.update('HVAC', { pricingSchema: null });
      expect(positionsRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
