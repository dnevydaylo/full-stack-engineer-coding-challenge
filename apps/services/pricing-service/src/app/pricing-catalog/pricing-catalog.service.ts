import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtPayload, UserRole } from '@sandbox/types';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { CatalogVersionResponseDto } from './dto/catalog-version-response.dto';
import { CreateCatalogVersionDto } from './dto/create-catalog-version.dto';
import { QueryCatalogVersionsDto } from './dto/query-catalog-versions.dto';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { UpdateCatalogVersionDto } from './dto/update-catalog-version.dto';
import { CatalogDiscount } from './entities/catalog-discount.entity';
import { CatalogPosition } from './entities/catalog-position.entity';
import { CatalogVersion, CatalogVersionStatus } from './entities/catalog-version.entity';
import { QuoteCalculatorInput, QuoteCalculatorResult, calculateQuote } from './quote-calculator';

@Injectable()
export class PricingCatalogService {
  private readonly logger = new Logger(PricingCatalogService.name);

  constructor(
    @InjectRepository(CatalogVersion)
    private readonly versions: Repository<CatalogVersion>,
    @InjectRepository(CatalogPosition)
    private readonly positions: Repository<CatalogPosition>,
    @InjectRepository(CatalogDiscount)
    private readonly discounts: Repository<CatalogDiscount>,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    query: QueryCatalogVersionsDto,
    user: JwtPayload,
  ): Promise<CatalogVersionResponseDto[]> {
    const qb = this.versions
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.positions', 'positions')
      .leftJoinAndSelect('v.discounts', 'discounts');

    if (query.craftsmanId) {
      qb.andWhere('v.craftsmanId = :craftsmanId', { craftsmanId: query.craftsmanId });
    }
    if (query.trade) {
      qb.andWhere('v.trade = :trade', { trade: query.trade });
    }

    if (this.isCraftsmanOnly(user)) {
      if (!user.craftsmanId) {
        return [];
      }
      qb.andWhere('v.craftsmanId = :ownId', { ownId: user.craftsmanId });
    }

    qb.orderBy('v.createdAt', 'DESC');

    const items = await qb.getMany();
    return items.map(CatalogVersionResponseDto.from);
  }

  async findOne(versionId: string, user: JwtPayload): Promise<CatalogVersionResponseDto> {
    const version = await this.versions.findOne({
      where: { id: versionId },
      relations: ['positions', 'discounts'],
    });
    if (!version) {
      throw new NotFoundException(`Catalog version ${versionId} not found`);
    }
    this.assertCanAccess(version.craftsmanId, user);
    return CatalogVersionResponseDto.from(version);
  }

  async create(dto: CreateCatalogVersionDto, user: JwtPayload): Promise<CatalogVersionResponseDto> {
    this.assertCanAccess(dto.craftsmanId, user);

    const version = this.versions.create({
      craftsmanId: dto.craftsmanId,
      trade: dto.trade,
      effectiveFrom: new Date(dto.effectiveFrom),
      status: CatalogVersionStatus.DRAFT,
      publishedBy: null,
      publishedAt: null,
    });

    const saved = await this.versions.save(version);
    this.logger.log(`Created catalog version ${saved.id} for craftsman ${saved.craftsmanId}`);

    const fresh = await this.versions.findOne({
      where: { id: saved.id },
      relations: ['positions', 'discounts'],
    });
    return CatalogVersionResponseDto.from(fresh as CatalogVersion);
  }

  async quote(
    versionId: string,
    dto: QuoteRequestDto,
    user: JwtPayload,
  ): Promise<QuoteCalculatorResult> {
    const version = await this.versions.findOne({
      where: { id: versionId },
      relations: ['positions', 'discounts', 'craftsman'],
    });
    if (!version) {
      throw new NotFoundException(`Catalog version ${versionId} not found`);
    }
    if (!version.craftsman.isActive) {
      throw new BadRequestException(`Craftsman ${version.craftsmanId} is not active`);
    }
    this.assertCanAccess(version.craftsmanId, user);

    const input: QuoteCalculatorInput = {
      versionId,
      positions: version.positions.map((p) => ({
        key: p.key,
        netPriceCents: p.netPriceCents,
        vatRate: Number(p.vatRate),
        minQuantity: p.minQuantity,
        maxQuantity: p.maxQuantity,
        surcharges: p.surcharges,
      })),
      discounts: version.discounts.map((d) => ({
        key: d.key,
        label: d.label,
        type: d.type as 'flat' | 'percent',
        value: Number(d.value),
        capCents: d.capCents,
        appliesTo: d.appliesTo,
      })),
      lines: dto.lines,
    };

    try {
      return calculateQuote(input);
    } catch (err: unknown) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid quote input');
    }
  }

  async publish(versionId: string, user: JwtPayload): Promise<CatalogVersionResponseDto> {
    const version = await this.versions.findOne({ where: { id: versionId } });
    if (!version) {
      throw new NotFoundException(`Catalog version ${versionId} not found`);
    }
    if (version.status !== CatalogVersionStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT versions can be published');
    }
    this.assertCanAccess(version.craftsmanId, user);

    try {
      await this.versions.save({
        ...version,
        status: CatalogVersionStatus.PUBLISHED,
        publishedBy: user.email,
        publishedAt: new Date(),
      });
    } catch (err: unknown) {
      // Partial unique index on (craftsman_id, trade) WHERE status = 'published' raises 23505 on conflict.
      const postgresErr = err as QueryFailedError & { driverError: { code: string } };
      if (err instanceof QueryFailedError && postgresErr.driverError?.code === '23505') {
        throw new ConflictException(
          `A published version already exists for craftsman ${version.craftsmanId} and trade ${version.trade}`,
        );
      }
      throw err;
    }

    this.logger.log(`Published catalog version ${versionId} by ${user.email}`);

    const fresh = await this.versions.findOne({
      where: { id: versionId },
      relations: ['positions', 'discounts'],
    });
    return CatalogVersionResponseDto.from(fresh as CatalogVersion);
  }

  async update(
    versionId: string,
    dto: UpdateCatalogVersionDto,
    user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    const version = await this.versions.findOne({ where: { id: versionId } });
    if (!version) {
      throw new NotFoundException(`Catalog version ${versionId} not found`);
    }
    if (version.status !== CatalogVersionStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT versions can be edited');
    }
    this.assertCanAccess(version.craftsmanId, user);

    await this.dataSource.transaction(async (entityManager) => {
      if (dto.effectiveFrom !== undefined) {
        version.effectiveFrom = new Date(dto.effectiveFrom);
      }
      await entityManager.getRepository(CatalogVersion).save(version);

      if (dto.positions !== undefined) {
        await entityManager.getRepository(CatalogPosition).delete({ versionId });
        if (dto.positions.length > 0) {
          await entityManager
            .getRepository(CatalogPosition)
            .save(
              dto.positions.map((p) =>
                entityManager.getRepository(CatalogPosition).create({ ...p, versionId }),
              ),
            );
        }
      }

      if (dto.discounts !== undefined) {
        await entityManager.getRepository(CatalogDiscount).delete({ versionId });
        if (dto.discounts.length > 0) {
          await entityManager
            .getRepository(CatalogDiscount)
            .save(
              dto.discounts.map((d) =>
                entityManager.getRepository(CatalogDiscount).create({ ...d, versionId }),
              ),
            );
        }
      }
    });

    this.logger.log(`Updated catalog version ${versionId}`);

    const fresh = await this.versions.findOne({
      where: { id: versionId },
      relations: ['positions', 'discounts'],
    });
    return CatalogVersionResponseDto.from(fresh as CatalogVersion);
  }

  // Authorization helpers

  private isCraftsmanOnly(user: JwtPayload): boolean {
    return user.roles.includes(UserRole.CRAFTSMAN) && !user.roles.includes(UserRole.ADMIN);
  }

  private assertCanAccess(craftsmanId: string, user: JwtPayload): void {
    if (!this.isCraftsmanOnly(user)) {
      return;
    }
    if (user.craftsmanId !== craftsmanId) {
      throw new ForbiddenException('Craftsmen may only access their own catalog');
    }
  }
}

