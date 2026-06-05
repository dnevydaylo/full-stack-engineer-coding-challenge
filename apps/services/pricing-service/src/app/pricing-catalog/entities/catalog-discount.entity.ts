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

export type DiscountAppliesTo = 'subtotal' | { positionKeys: string[] };

export enum DiscountType {
  FLAT = 'flat',
  PERCENT = 'percent',
}

@Entity({ schema: 'pricing_service', name: 'catalog_discounts' })
@Index(['versionId'])
@Index(['versionId', 'key'], { unique: true })
export class CatalogDiscount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'version_id', type: 'uuid' })
  versionId: string;

  @Column({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'varchar', length: 16 })
  type: DiscountType;

  @Column({ name: 'discount_value', type: 'numeric', precision: 12, scale: 4 })
  value: number;

  @Column({ name: 'cap_cents', type: 'integer', nullable: true })
  capCents: number | null;

  @Column({ name: 'applies_to', type: 'jsonb' })
  appliesTo: DiscountAppliesTo;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CatalogVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'version_id' })
  version: CatalogVersion;
}
