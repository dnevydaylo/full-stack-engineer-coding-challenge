import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CatalogVersion } from './catalog-version.entity';

export enum PositionUnit {
  PIECE = 'piece',
  M2 = 'm2',
  METER = 'meter',
  HOUR = 'hour',
  FLAT = 'flat',
}

export interface Surcharge {
  key: string;
  label: string;
  type: 'flat' | 'percent';
  value: number;
}

@Entity({ schema: 'pricing_service', name: 'catalog_positions' })
@Index(['versionId'])
@Index(['versionId', 'key'], { unique: true })
export class CatalogPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'version_id', type: 'uuid' })
  versionId: string;

  @Column({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'varchar', length: 16 })
  unit: PositionUnit;

  @Column({ name: 'net_price_cents', type: 'integer' })
  netPriceCents: number;

  @Column({ name: 'vat_rate', type: 'numeric', precision: 5, scale: 4 })
  vatRate: number;

  @Column({ name: 'min_quantity', type: 'numeric', nullable: true })
  minQuantity: number | null;

  @Column({ name: 'max_quantity', type: 'numeric', nullable: true })
  maxQuantity: number | null;

  @Column({ name: 'trade_attributes', type: 'jsonb', default: {} })
  tradeAttributes: Record<string, unknown>;

  @Column({ type: 'jsonb', default: [] })
  surcharges: Surcharge[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CatalogVersion, (version) => version.positions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'version_id' })
  version: CatalogVersion;
}
