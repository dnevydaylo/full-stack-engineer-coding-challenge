import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtPayload, UserRole } from '@sandbox/types';
import { DataSource, ObjectLiteral, QueryFailedError, Repository } from 'typeorm';

import { Craftsman } from '../craftsmen/entities/craftsman.entity';
import { CatalogDiscount, DiscountType } from './entities/catalog-discount.entity';
import { CatalogPosition, PositionUnit } from './entities/catalog-position.entity';
import { CatalogVersion, CatalogVersionStatus } from './entities/catalog-version.entity';
import { PricingCatalogService } from './pricing-catalog.service';

// Type helpers

type Repo<T extends ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

// Users

const adminUser: JwtPayload = {
  sub: 'admin-id',
  email: 'admin@example.com',
  roles: [UserRole.ADMIN],
  craftsmanId: null,
};

const craftsmanA: JwtPayload = {
  sub: 'user-a',
  email: 'a@example.com',
  roles: [UserRole.CRAFTSMAN],
  craftsmanId: 'craftsman-a-id',
};

const craftsmanB: JwtPayload = {
  sub: 'user-b',
  email: 'b@example.com',
  roles: [UserRole.CRAFTSMAN],
  craftsmanId: 'craftsman-b-id',
};

// Entity builders

function buildActiveCraftsman(id = 'craftsman-a-id'): Craftsman {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id,
    companyName: 'Test GmbH',
    email: null,
    phone: null,
    vatNumber: null,
    addressLine1: null,
    addressLine2: null,
    postalCode: null,
    city: null,
    country: 'Germany',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    tradeAssignments: [],
  } as Craftsman;
}

function buildPosition(overrides: Partial<CatalogPosition> = {}): CatalogPosition {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'pos-id',
    versionId: 'version-id',
    key: 'p1',
    label: 'Position 1',
    unit: PositionUnit.PIECE,
    netPriceCents: 1000,
    vatRate: 0.19,
    minQuantity: null,
    maxQuantity: null,
    tradeAttributes: {},
    surcharges: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as CatalogPosition;
}

function buildVersion(overrides: Partial<CatalogVersion> = {}): CatalogVersion {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'version-id',
    craftsmanId: 'craftsman-a-id',
    trade: 'HVAC',
    status: CatalogVersionStatus.DRAFT,
    effectiveFrom: new Date('2026-06-01T00:00:00Z'),
    publishedBy: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    positions: [],
    discounts: [],
    craftsman: buildActiveCraftsman(),
    ...overrides,
  } as CatalogVersion;
}

function makePostgresUniqueError(): QueryFailedError {
  const err = Object.create(QueryFailedError.prototype) as QueryFailedError & {
    driverError: Error & { code: string };
  };
  const driverError = new Error('unique violation') as Error & { code: string };
  driverError.code = '23505';
  err.driverError = driverError;
  return err;
}

// Test setup

describe('PricingCatalogService', () => {
  let service: PricingCatalogService;
  let versionsRepo: Repo<CatalogVersion>;
  let positionsRepo: Repo<CatalogPosition>;
  let discountsRepo: Repo<CatalogDiscount>;
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    versionsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn().mockImplementation((x: Partial<CatalogVersion>) => ({ ...x })),
    };

    positionsRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockImplementation((x: Partial<CatalogPosition>) => ({ ...x })),
    };

    discountsRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockImplementation((x: Partial<CatalogDiscount>) => ({ ...x })),
    };

    const dataSource = {
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          getRepository: (entity: unknown) => {
            if (entity === CatalogVersion) return versionsRepo;
            if (entity === CatalogPosition) return positionsRepo;
            return discountsRepo;
          },
        }),
      ),
    } as unknown as DataSource;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PricingCatalogService,
        { provide: getRepositoryToken(CatalogVersion), useValue: versionsRepo },
        { provide: getRepositoryToken(CatalogPosition), useValue: positionsRepo },
        { provide: getRepositoryToken(CatalogDiscount), useValue: discountsRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(PricingCatalogService);
  });

  // list

  describe('list', () => {
    it('returns all catalog versions for admin', async () => {
      const version = buildVersion();
      qb.getMany.mockResolvedValue([version]);
      const result = await service.list({}, adminUser);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('version-id');
    });

    it('scopes results to own craftsmanId for CRAFTSMAN role', async () => {
      await service.list({}, craftsmanA);
      expect(qb.andWhere).toHaveBeenCalledWith('v.craftsmanId = :ownId', {
        ownId: 'craftsman-a-id',
      });
    });

    it('returns empty array when CRAFTSMAN has no craftsmanId', async () => {
      const result = await service.list({}, { ...craftsmanA, craftsmanId: null });
      expect(result).toEqual([]);
      expect(qb.getMany).not.toHaveBeenCalled();
    });

    it('applies craftsmanId filter from query when provided', async () => {
      await service.list({ craftsmanId: 'craftsman-a-id' }, adminUser);
      expect(qb.andWhere).toHaveBeenCalledWith('v.craftsmanId = :craftsmanId', {
        craftsmanId: 'craftsman-a-id',
      });
    });
  });

  // findOne

  describe('findOne', () => {
    it('returns the catalog version for admin', async () => {
      versionsRepo.findOne!.mockResolvedValue(buildVersion());
      const result = await service.findOne('version-id', adminUser);
      expect(result.id).toBe('version-id');
    });

    it('returns the catalog version when craftsman accesses their own', async () => {
      versionsRepo.findOne!.mockResolvedValue(buildVersion({ craftsmanId: 'craftsman-a-id' }));
      const result = await service.findOne('version-id', craftsmanA);
      expect(result.id).toBe('version-id');
    });

    it('throws NotFoundException when version does not exist', async () => {
      versionsRepo.findOne!.mockResolvedValue(null);
      await expect(service.findOne('missing', adminUser)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when craftsman A reads craftsman B catalog', async () => {
      versionsRepo.findOne!.mockResolvedValue(buildVersion({ craftsmanId: 'craftsman-b-id' }));
      await expect(service.findOne('version-id', craftsmanA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // create

  describe('create', () => {
    it('creates a DRAFT version and returns it', async () => {
      const saved = buildVersion({ id: 'new-id' });
      versionsRepo.save!.mockResolvedValue(saved);
      versionsRepo.findOne!.mockResolvedValue(saved);

      const result = await service.create(
        { craftsmanId: 'craftsman-a-id', trade: 'HVAC', effectiveFrom: '2026-07-01T00:00:00Z' },
        adminUser,
      );

      expect(result.id).toBe('new-id');
      expect(result.status).toBe(CatalogVersionStatus.DRAFT);
      expect(versionsRepo.save).toHaveBeenCalled();
    });

    it('throws ForbiddenException when craftsman A creates a catalog for craftsman B', async () => {
      await expect(
        service.create(
          { craftsmanId: 'craftsman-b-id', trade: 'HVAC', effectiveFrom: '2026-07-01T00:00:00Z' },
          craftsmanA,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // publish

  describe('publish', () => {
    it('publishes a DRAFT version and returns the updated version', async () => {
      const draft = buildVersion({ status: CatalogVersionStatus.DRAFT });
      const published = buildVersion({
        status: CatalogVersionStatus.PUBLISHED,
        publishedBy: adminUser.email,
      });
      versionsRepo
        .findOne!.mockResolvedValueOnce(draft) // initial load (no relations)
        .mockResolvedValueOnce(published); // reload with relations
      versionsRepo.save!.mockResolvedValue(published);

      const result = await service.publish('version-id', adminUser);
      expect(result.status).toBe(CatalogVersionStatus.PUBLISHED);
      expect(result.publishedBy).toBe(adminUser.email);
    });

    it('throws NotFoundException when version does not exist', async () => {
      versionsRepo.findOne!.mockResolvedValue(null);
      await expect(service.publish('missing', adminUser)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when publishing an already-published version', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ status: CatalogVersionStatus.PUBLISHED }),
      );
      await expect(service.publish('version-id', adminUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when craftsman A publishes craftsman B catalog', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ status: CatalogVersionStatus.DRAFT, craftsmanId: 'craftsman-b-id' }),
      );
      await expect(service.publish('version-id', craftsmanA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws ConflictException on unique constraint violation (concurrent publish)', async () => {
      versionsRepo.findOne!.mockResolvedValue(buildVersion({ status: CatalogVersionStatus.DRAFT }));
      versionsRepo.save!.mockRejectedValue(makePostgresUniqueError());
      await expect(service.publish('version-id', adminUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('concurrent publish: exactly one call wins', async () => {
      const draft = buildVersion({ status: CatalogVersionStatus.DRAFT });
      const published = buildVersion({ status: CatalogVersionStatus.PUBLISHED });

      // Both calls read DRAFT; first save succeeds, second hits unique constraint
      versionsRepo
        .findOne!.mockResolvedValueOnce(draft) // call 1 reads
        .mockResolvedValueOnce(draft) // call 2 reads
        .mockResolvedValue(published); // reload after successful publish

      versionsRepo
        .save!.mockResolvedValueOnce(published) // call 1 wins
        .mockRejectedValueOnce(makePostgresUniqueError()); // call 2 loses

      const [r1, r2] = await Promise.allSettled([
        service.publish('version-id', adminUser),
        service.publish('version-id', adminUser),
      ]);

      const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
      const rejected = [r1, r2].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    });
  });

  // update

  describe('update', () => {
    it('updates effectiveFrom on a DRAFT version', async () => {
      const draft = buildVersion({ status: CatalogVersionStatus.DRAFT });
      const updated = buildVersion({ effectiveFrom: new Date('2027-01-01T00:00:00Z') });
      versionsRepo
        .findOne!.mockResolvedValueOnce(draft) // initial load
        .mockResolvedValueOnce(updated); // reload after update

      const result = await service.update(
        'version-id',
        { effectiveFrom: '2027-01-01T00:00:00Z' },
        adminUser,
      );

      expect(result.effectiveFrom).toBe('2027-01-01T00:00:00.000Z');
    });

    it('replaces positions when positions array is provided', async () => {
      versionsRepo
        .findOne!.mockResolvedValueOnce(buildVersion({ status: CatalogVersionStatus.DRAFT }))
        .mockResolvedValueOnce(buildVersion());

      await service.update(
        'version-id',
        {
          positions: [
            {
              key: 'p1',
              label: 'New pos',
              unit: PositionUnit.PIECE,
              netPriceCents: 500,
              vatRate: 0.19,
            },
          ],
        },
        adminUser,
      );

      expect(positionsRepo.delete).toHaveBeenCalledWith({ versionId: 'version-id' });
      expect(positionsRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when version does not exist', async () => {
      versionsRepo.findOne!.mockResolvedValue(null);
      await expect(service.update('missing', {}, adminUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when editing a published version', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ status: CatalogVersionStatus.PUBLISHED }),
      );
      await expect(service.update('version-id', {}, adminUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when craftsman A edits craftsman B catalog', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ status: CatalogVersionStatus.DRAFT, craftsmanId: 'craftsman-b-id' }),
      );
      await expect(service.update('version-id', {}, craftsmanA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // quote

  describe('quote', () => {
    it('calculates a quote for a valid line and returns correct totals', async () => {
      const version = buildVersion({
        positions: [buildPosition({ key: 'p1', netPriceCents: 1000, vatRate: 0.19 })],
        discounts: [],
      });
      versionsRepo.findOne!.mockResolvedValue(version);

      const result = await service.quote(
        'version-id',
        { lines: [{ positionKey: 'p1', quantity: 2 }] },
        adminUser,
      );

      expect(result.versionId).toBe('version-id');
      expect(result.totals.netCents).toBe(2000);
      expect(result.totals.vatCents).toBe(380);
      expect(result.totals.grossCents).toBe(2380);
    });

    it('returns empty totals for an empty line list', async () => {
      const version = buildVersion({ positions: [buildPosition()], discounts: [] });
      versionsRepo.findOne!.mockResolvedValue(version);

      const result = await service.quote('version-id', { lines: [] }, adminUser);
      expect(result.lines).toHaveLength(0);
      expect(result.totals.netCents).toBe(0);
      expect(result.totals.grossCents).toBe(0);
    });

    it('throws BadRequestException for an unknown position key', async () => {
      const version = buildVersion({ positions: [buildPosition({ key: 'p1' })], discounts: [] });
      versionsRepo.findOne!.mockResolvedValue(version);

      await expect(
        service.quote(
          'version-id',
          { lines: [{ positionKey: 'unknown', quantity: 1 }] },
          adminUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when quantity is below minimum', async () => {
      const version = buildVersion({
        positions: [buildPosition({ key: 'p1', minQuantity: 5, maxQuantity: null })],
        discounts: [],
      });
      versionsRepo.findOne!.mockResolvedValue(version);

      await expect(
        service.quote('version-id', { lines: [{ positionKey: 'p1', quantity: 2 }] }, adminUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when quantity exceeds maximum', async () => {
      const version = buildVersion({
        positions: [buildPosition({ key: 'p1', minQuantity: null, maxQuantity: 3 })],
        discounts: [],
      });
      versionsRepo.findOne!.mockResolvedValue(version);

      await expect(
        service.quote('version-id', { lines: [{ positionKey: 'p1', quantity: 10 }] }, adminUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for an undeclared surcharge key', async () => {
      const version = buildVersion({
        positions: [buildPosition({ key: 'p1', surcharges: [] })],
        discounts: [],
      });
      versionsRepo.findOne!.mockResolvedValue(version);

      await expect(
        service.quote(
          'version-id',
          { lines: [{ positionKey: 'p1', quantity: 1, appliedSurchargeKeys: ['undeclared'] }] },
          adminUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('handles mixed VAT rates and groups them correctly', async () => {
      const version = buildVersion({
        positions: [
          buildPosition({ id: 'pos-1', key: 'p1', netPriceCents: 1000, vatRate: 0.19 }),
          buildPosition({ id: 'pos-2', key: 'p2', netPriceCents: 2000, vatRate: 0.07 }),
        ],
        discounts: [],
      });
      versionsRepo.findOne!.mockResolvedValue(version);

      const result = await service.quote(
        'version-id',
        {
          lines: [
            { positionKey: 'p1', quantity: 1 },
            { positionKey: 'p2', quantity: 1 },
          ],
        },
        adminUser,
      );

      expect(result.vatGroups).toHaveLength(2);
      expect(result.totals.netCents).toBe(3000);
    });

    it('applies percent discount with cap correctly', async () => {
      const discount = {
        id: 'disc-id',
        versionId: 'version-id',
        key: 'd1',
        label: '10%',
        type: DiscountType.PERCENT,
        value: 0.1,
        capCents: 500,
        appliesTo: 'subtotal' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CatalogDiscount;

      const version = buildVersion({
        positions: [buildPosition({ key: 'p1', netPriceCents: 10000 })],
        discounts: [discount],
      });
      versionsRepo.findOne!.mockResolvedValue(version);

      const result = await service.quote(
        'version-id',
        { lines: [{ positionKey: 'p1', quantity: 1 }] },
        adminUser,
      );

      expect(result.totals.totalDiscountCents).toBe(500);
      expect(result.totals.netCents).toBe(9500);
    });

    it('applies multiple stacked discounts in declaration order', async () => {
      const d1 = {
        id: 'disc-1',
        versionId: 'version-id',
        key: 'd1',
        label: '10%',
        type: DiscountType.PERCENT,
        value: 0.1,
        capCents: null,
        appliesTo: 'subtotal' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CatalogDiscount;

      const d2 = {
        id: 'disc-2',
        versionId: 'version-id',
        key: 'd2',
        label: '5€ flat',
        type: DiscountType.FLAT,
        value: 500,
        capCents: null,
        appliesTo: 'subtotal' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CatalogDiscount;

      const version = buildVersion({
        positions: [buildPosition({ key: 'p1', netPriceCents: 10000 })],
        discounts: [d1, d2],
      });
      versionsRepo.findOne!.mockResolvedValue(version);

      const result = await service.quote(
        'version-id',
        { lines: [{ positionKey: 'p1', quantity: 1 }] },
        adminUser,
      );

      // 10000 → -1000 (10%) → 9000 → -500 (flat) → 8500
      expect(result.totals.totalDiscountCents).toBe(1500);
      expect(result.totals.netCents).toBe(8500);
    });

    it('throws BadRequestException when craftsman is inactive', async () => {
      const version = buildVersion({
        craftsman: { ...buildActiveCraftsman(), isActive: false },
      });
      versionsRepo.findOne!.mockResolvedValue(version);

      await expect(service.quote('version-id', { lines: [] }, adminUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFoundException when version does not exist', async () => {
      versionsRepo.findOne!.mockResolvedValue(null);
      await expect(service.quote('missing', { lines: [] }, adminUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when craftsman A quotes craftsman B catalog', async () => {
      const version = buildVersion({ craftsmanId: 'craftsman-b-id' });
      versionsRepo.findOne!.mockResolvedValue(version);

      await expect(service.quote('version-id', { lines: [] }, craftsmanA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // Authorization: craftsman A cannot access craftsman B under any endpoint

  describe('authorization – craftsman A cannot read or write craftsman B catalog', () => {
    const bVersion = () =>
      buildVersion({ craftsmanId: 'craftsman-b-id', status: CatalogVersionStatus.DRAFT });

    it('list – A only sees their own catalog (B excluded by scoping)', async () => {
      qb.getMany.mockResolvedValue([bVersion()]);
      // The service will filter with andWhere('v.craftsmanId = :ownId', { ownId: 'craftsman-a-id' })
      // The mock still returns B's version but the real DB wouldn't – we assert the filter is applied
      await service.list({}, craftsmanA);
      expect(qb.andWhere).toHaveBeenCalledWith('v.craftsmanId = :ownId', {
        ownId: 'craftsman-a-id',
      });
    });

    it('findOne – A reading B throws Forbidden', async () => {
      versionsRepo.findOne!.mockResolvedValue(bVersion());
      await expect(service.findOne('version-id', craftsmanA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('create – A creating for B throws Forbidden', async () => {
      await expect(
        service.create(
          { craftsmanId: 'craftsman-b-id', trade: 'HVAC', effectiveFrom: '2026-07-01T00:00:00Z' },
          craftsmanA,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('publish – A publishing B throws Forbidden', async () => {
      versionsRepo.findOne!.mockResolvedValue(bVersion());
      await expect(service.publish('version-id', craftsmanA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('update – A editing B throws Forbidden', async () => {
      versionsRepo.findOne!.mockResolvedValue(bVersion());
      await expect(service.update('version-id', {}, craftsmanA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('quote – A quoting B throws Forbidden', async () => {
      versionsRepo.findOne!.mockResolvedValue(bVersion());
      await expect(service.quote('version-id', { lines: [] }, craftsmanA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // Publish twice: second call rejects

  describe('publish twice', () => {
    it('first publish succeeds; second publish on already-published version fails with BadRequest', async () => {
      const draft = buildVersion({ status: CatalogVersionStatus.DRAFT });
      const published = buildVersion({
        status: CatalogVersionStatus.PUBLISHED,
        publishedBy: adminUser.email,
      });

      versionsRepo
        .findOne!.mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(published) // reload after first publish
        .mockResolvedValueOnce(published); // second call reads PUBLISHED
      versionsRepo.save!.mockResolvedValueOnce(published);

      await service.publish('version-id', adminUser);
      await expect(service.publish('version-id', adminUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // Edit a published version must be rejected

  describe('update a published version', () => {
    it('throws BadRequestException when trying to edit a PUBLISHED version', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ status: CatalogVersionStatus.PUBLISHED }),
      );
      await expect(
        service.update('version-id', { effectiveFrom: '2027-01-01T00:00:00Z' }, adminUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
