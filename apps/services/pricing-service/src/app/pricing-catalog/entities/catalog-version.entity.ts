import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Craftsman } from '../../craftsmen/entities/craftsman.entity';
import { CatalogDiscount } from './catalog-discount.entity';
import { CatalogPosition } from './catalog-position.entity';

export enum CatalogVersionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

@Entity({ schema: 'pricing_service', name: 'catalog_versions' })
@Index(['craftsmanId', 'trade'])
export class CatalogVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'craftsman_id', type: 'uuid' })
  @Index()
  craftsmanId: string;

  @Column({ type: 'varchar', length: 32 })
  @Index()
  trade: string;

  @Column({ type: 'varchar', length: 16, default: CatalogVersionStatus.DRAFT })
  status: CatalogVersionStatus;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom: Date;

  @Column({ name: 'published_by', type: 'varchar', length: 255, nullable: true })
  publishedBy: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => CatalogPosition, (pos) => pos.version)
  positions: CatalogPosition[];

  @OneToMany(() => CatalogDiscount, (dis) => dis.version)
  discounts: CatalogDiscount[];

  @ManyToOne(() => Craftsman, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'craftsman_id' })
  craftsman: Craftsman;
}
