import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddPricingCatalogs1780667129801 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'pricing_service.trade_configs',
      new TableColumn({ name: 'pricing_schema', type: 'jsonb', isNullable: true }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'pricing_service.catalog_versions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'craftsman_id', type: 'uuid' },
          { name: 'trade', type: 'varchar', length: '32' },
          { name: 'status', type: 'varchar', length: '16', default: "'draft'" },
          { name: 'effective_from', type: 'timestamptz' },
          { name: 'published_by', type: 'varchar', length: '255', isNullable: true },
          { name: 'published_at', type: 'timestamptz', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'pricing_service.catalog_versions',
      new TableIndex({
        name: 'idx_catalog_versions_craftsman_trade',
        columnNames: ['craftsman_id', 'trade'],
      }),
    );

    await queryRunner.createForeignKey(
      'pricing_service.catalog_versions',
      new TableForeignKey({
        columnNames: ['craftsman_id'],
        referencedTableName: 'pricing_service.craftsmen',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'pricing_service.catalog_versions',
      new TableIndex({
        name: 'idx_one_published_per_craftsman_trade',
        columnNames: ['craftsman_id', 'trade'],
        isUnique: true,
        where: "status = 'published'",
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'pricing_service.catalog_positions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'version_id', type: 'uuid' },
          { name: 'key', type: 'varchar', length: '100' },
          { name: 'label', type: 'varchar', length: '255' },
          { name: 'unit', type: 'varchar', length: '16' },
          { name: 'net_price_cents', type: 'integer' },
          { name: 'vat_rate', type: 'numeric', precision: 5, scale: 4 },
          { name: 'min_quantity', type: 'numeric', isNullable: true },
          { name: 'max_quantity', type: 'numeric', isNullable: true },
          { name: 'trade_attributes', type: 'jsonb', default: "'{}'" },
          { name: 'surcharges', type: 'jsonb', default: "'[]'" },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.createIndex(
      'pricing_service.catalog_positions',
      new TableIndex({
        name: 'idx_catalog_positions_version_id',
        columnNames: ['version_id'],
      }),
    );

    await queryRunner.createIndex(
      'pricing_service.catalog_positions',
      new TableIndex({
        name: 'idx_catalog_positions_version_id_key',
        columnNames: ['version_id', 'key'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'pricing_service.catalog_positions',
      new TableForeignKey({
        columnNames: ['version_id'],
        referencedTableName: 'pricing_service.catalog_versions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'pricing_service.catalog_discounts',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'version_id', type: 'uuid' },
          { name: 'key', type: 'varchar', length: '100' },
          { name: 'label', type: 'varchar', length: '255' },
          { name: 'type', type: 'varchar', length: '16' },
          { name: 'discount_value', type: 'numeric', precision: 12, scale: 4 },
          { name: 'cap_cents', type: 'integer', isNullable: true },
          { name: 'applies_to', type: 'jsonb' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.createIndex(
      'pricing_service.catalog_discounts',
      new TableIndex({
        name: 'idx_catalog_discounts_version_id',
        columnNames: ['version_id'],
      }),
    );

    await queryRunner.createIndex(
      'pricing_service.catalog_discounts',
      new TableIndex({
        name: 'idx_catalog_discounts_version_id_key',
        columnNames: ['version_id', 'key'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'pricing_service.catalog_discounts',
      new TableForeignKey({
        columnNames: ['version_id'],
        referencedTableName: 'pricing_service.catalog_versions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('pricing_service.catalog_discounts', true);
    await queryRunner.dropTable('pricing_service.catalog_positions', true);
    await queryRunner.dropTable('pricing_service.catalog_versions', true);
    await queryRunner.dropColumn('pricing_service.trade_configs', 'pricing_schema');
  }
}
