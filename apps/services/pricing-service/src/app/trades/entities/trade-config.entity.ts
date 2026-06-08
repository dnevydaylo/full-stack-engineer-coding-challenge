import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface PricingSchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  min?: number;
  max?: number;
  allowedValues?: string[];
  dependsOn?: {
    field: string;
    equals: string;
  };
}

/**
 * Configuration per trade category. Holds the human-readable label plus any
 * trade-specific schema definitions (currently used for nothing — the
 * pricing challenge adds `pricingSchema` here).
 */
@Entity({ schema: 'pricing_service', name: 'trade_configs' })
export class TradeConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  @Index({ unique: true })
  trade: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'pricing_schema', type: 'jsonb', nullable: true })
  pricingSchema: PricingSchemaField[] | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
