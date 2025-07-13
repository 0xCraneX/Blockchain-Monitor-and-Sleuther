/**
 * Migration script from PostgreSQL/Neo4j to SQLite
 * This script handles the data transformation and migration process
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

class PostgreSQLToSQLiteMigrator {
  constructor(pgConfig, sqlitePath) {
    this.pgClient = new pg.Client(pgConfig);
    this.sqliteDb = new Database(sqlitePath);
    this.batchSize = 1000;
    this.setupSQLite();
  }

  setupSQLite() {
    // Set pragmas for optimal import performance
    this.sqliteDb.pragma('journal_mode = OFF'); // Turn off during import
    this.sqliteDb.pragma('synchronous = OFF');
    this.sqliteDb.pragma('cache_size = -2000000'); // 2GB cache
    this.sqliteDb.pragma('temp_store = MEMORY');
    this.sqliteDb.pragma('locking_mode = EXCLUSIVE');
    
    // Create schema
    this.createSQLiteSchema();
  }

  createSQLiteSchema() {
    const schema = `
      -- Core account table with denormalized identity data
      CREATE TABLE IF NOT EXISTS accounts (
        address TEXT PRIMARY KEY,
        display_name TEXT,
        legal_name TEXT,
        web TEXT,
        email TEXT,
        twitter TEXT,
        riot TEXT,
        is_verified INTEGER DEFAULT 0,
        parent_address TEXT,
        sub_display TEXT,
        risk_level TEXT DEFAULT 'unknown',
        tags TEXT,
        notes TEXT,
        first_seen_block INTEGER,
        last_seen_block INTEGER,
        created_at INTEGER,
        updated_at INTEGER,
        FOREIGN KEY (parent_address) REFERENCES accounts(address)
      );

      CREATE TABLE IF NOT EXISTS transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_number INTEGER NOT NULL,
        block_timestamp INTEGER NOT NULL,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        from_display TEXT,
        to_display TEXT,
        transaction_hash TEXT,
        event_index INTEGER,
        FOREIGN KEY (from_address) REFERENCES accounts(address),
        FOREIGN KEY (to_address) REFERENCES accounts(address)
      );

      CREATE TABLE IF NOT EXISTS transfer_stats (
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        total_amount TEXT NOT NULL,
        transfer_count INTEGER NOT NULL,
        first_transfer_block INTEGER,
        last_transfer_block INTEGER,
        avg_amount TEXT,
        PRIMARY KEY (from_address, to_address),
        FOREIGN KEY (from_address) REFERENCES accounts(address),
        FOREIGN KEY (to_address) REFERENCES accounts(address)
      );

      CREATE TABLE IF NOT EXISTS account_stats (
        address TEXT PRIMARY KEY,
        total_received TEXT DEFAULT '0',
        total_sent TEXT DEFAULT '0',
        receive_count INTEGER DEFAULT 0,
        send_count INTEGER DEFAULT 0,
        unique_senders INTEGER DEFAULT 0,
        unique_receivers INTEGER DEFAULT 0,
        first_activity_block INTEGER,
        last_activity_block INTEGER,
        suspicious_pattern_count INTEGER DEFAULT 0,
        high_risk_interaction_count INTEGER DEFAULT 0,
        FOREIGN KEY (address) REFERENCES accounts(address)
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        last_processed_block INTEGER DEFAULT 0,
        last_sync_timestamp INTEGER,
        is_syncing INTEGER DEFAULT 0
      );
    `;
    
    this.sqliteDb.exec(schema);
  }

  async migrate() {
    try {
      await this.pgClient.connect();
      console.log('Connected to PostgreSQL');
      
      // Migration steps
      await this.migrateAccounts();
      await this.migrateIdentities();
      await this.migrateSubIdentities();
      await this.migrateTransfers();
      await this.migrateTransferVolumes();
      await this.calculateAccountStats();
      await this.createIndexes();
      await this.optimizeDatabase();
      
      console.log('Migration completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    } finally {
      await this.pgClient.end();
      this.sqliteDb.close();
    }
  }

  async migrateAccounts() {
    console.log('Migrating accounts...');
    
    const insertStmt = this.sqliteDb.prepare(`
      INSERT OR IGNORE INTO accounts (address, created_at, updated_at)
      VALUES (?, ?, ?)
    `);
    
    const query = 'SELECT * FROM ftd_account ORDER BY created_at';
    const res = await this.pgClient.query(query);
    
    const insertMany = this.sqliteDb.transaction((accounts) => {
      for (const account of accounts) {
        insertStmt.run(
          account.address,
          Math.floor(new Date(account.created_at).getTime() / 1000),
          Math.floor(new Date(account.updated_at).getTime() / 1000)
        );
      }
    });
    
    // Process in batches
    for (let i = 0; i < res.rows.length; i += this.batchSize) {
      const batch = res.rows.slice(i, i + this.batchSize);
      insertMany(batch);
      process.stdout.write(`\rProcessed ${i + batch.length}/${res.rows.length} accounts`);
    }
    
    console.log('\nAccounts migration completed');
  }

  async migrateIdentities() {
    console.log('Migrating identities...');
    
    const updateStmt = this.sqliteDb.prepare(`
      UPDATE accounts SET
        display_name = ?,
        legal_name = ?,
        web = ?,
        email = ?,
        twitter = ?,
        riot = ?,
        is_verified = ?
      WHERE address = ?
    `);
    
    const query = 'SELECT * FROM ftd_identity';
    const res = await this.pgClient.query(query);
    
    const updateMany = this.sqliteDb.transaction((identities) => {
      for (const identity of identities) {
        updateStmt.run(
          identity.display,
          identity.legal,
          identity.web,
          identity.email,
          identity.twitter,
          identity.riot,
          identity.is_confirmed ? 1 : 0,
          identity.address
        );
      }
    });
    
    updateMany(res.rows);
    console.log(`Updated ${res.rows.length} identities`);
  }

  async migrateSubIdentities() {
    console.log('Migrating sub-identities...');
    
    const updateStmt = this.sqliteDb.prepare(`
      UPDATE accounts SET
        parent_address = ?,
        sub_display = ?
      WHERE address = ?
    `);
    
    const query = 'SELECT * FROM ftd_sub_identity';
    const res = await this.pgClient.query(query);
    
    const updateMany = this.sqliteDb.transaction((subIdentities) => {
      for (const subIdentity of subIdentities) {
        updateStmt.run(
          subIdentity.super_address,
          subIdentity.sub_display,
          subIdentity.address
        );
      }
    });
    
    updateMany(res.rows);
    console.log(`Updated ${res.rows.length} sub-identities`);
  }

  async migrateTransfers() {
    console.log('Migrating transfers...');
    
    const insertStmt = this.sqliteDb.prepare(`
      INSERT INTO transfers (
        block_number, block_timestamp, from_address, to_address,
        amount, transaction_hash, event_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Stream transfers to handle large datasets
    const countRes = await this.pgClient.query('SELECT COUNT(*) FROM ftd_transfer');
    const totalCount = parseInt(countRes.rows[0].count);
    
    let processed = 0;
    const batchSize = 10000;
    
    for (let offset = 0; offset < totalCount; offset += batchSize) {
      const query = `
        SELECT 
          t.*,
          b.hash as block_hash
        FROM ftd_transfer t
        JOIN ftd_block b ON t.block_hash = b.hash
        ORDER BY t.id
        LIMIT ${batchSize} OFFSET ${offset}
      `;
      
      const res = await this.pgClient.query(query);
      
      const insertMany = this.sqliteDb.transaction((transfers) => {
        for (const transfer of transfers) {
          insertStmt.run(
            transfer.block_number,
            transfer.timestamp,
            transfer.from_address,
            transfer.to_address,
            transfer.amount,
            transfer.block_hash,
            transfer.event_index
          );
        }
      });
      
      insertMany(res.rows);
      processed += res.rows.length;
      
      process.stdout.write(`\rProcessed ${processed}/${totalCount} transfers (${Math.round(processed/totalCount*100)}%)`);
    }
    
    console.log('\nTransfers migration completed');
  }

  async migrateTransferVolumes() {
    console.log('Migrating transfer volumes...');
    
    const insertStmt = this.sqliteDb.prepare(`
      INSERT OR REPLACE INTO transfer_stats (
        from_address, to_address, total_amount, transfer_count
      ) VALUES (?, ?, ?, ?)
    `);
    
    const query = 'SELECT * FROM ftd_transfer_volume';
    const res = await this.pgClient.query(query);
    
    const insertMany = this.sqliteDb.transaction((volumes) => {
      for (const volume of volumes) {
        insertStmt.run(
          volume.from_address,
          volume.to_address,
          volume.volume,
          volume.count
        );
      }
    });
    
    insertMany(res.rows);
    console.log(`Migrated ${res.rows.length} transfer volumes`);
  }

  async calculateAccountStats() {
    console.log('Calculating account statistics...');
    
    // This would be better done with SQL, but for demonstration:
    this.sqliteDb.exec(`
      INSERT OR REPLACE INTO account_stats (
        address,
        total_received,
        total_sent,
        receive_count,
        send_count,
        unique_senders,
        unique_receivers,
        first_activity_block,
        last_activity_block
      )
      SELECT 
        a.address,
        COALESCE(r.total_received, '0'),
        COALESCE(s.total_sent, '0'),
        COALESCE(r.receive_count, 0),
        COALESCE(s.send_count, 0),
        COALESCE(r.unique_senders, 0),
        COALESCE(s.unique_receivers, 0),
        COALESCE(LEAST(r.first_block, s.first_block), 0),
        COALESCE(GREATEST(r.last_block, s.last_block), 0)
      FROM accounts a
      LEFT JOIN (
        SELECT 
          to_address as address,
          SUM(CAST(amount AS INTEGER)) as total_received,
          COUNT(*) as receive_count,
          COUNT(DISTINCT from_address) as unique_senders,
          MIN(block_number) as first_block,
          MAX(block_number) as last_block
        FROM transfers
        GROUP BY to_address
      ) r ON a.address = r.address
      LEFT JOIN (
        SELECT 
          from_address as address,
          SUM(CAST(amount AS INTEGER)) as total_sent,
          COUNT(*) as send_count,
          COUNT(DISTINCT to_address) as unique_receivers,
          MIN(block_number) as first_block,
          MAX(block_number) as last_block
        FROM transfers
        GROUP BY from_address
      ) s ON a.address = s.address
    `);
    
    console.log('Account statistics calculated');
  }

  async createIndexes() {
    console.log('Creating indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_address)',
      'CREATE INDEX IF NOT EXISTS idx_accounts_risk ON accounts(risk_level)',
      'CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_address, block_number)',
      'CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_address, block_number)',
      'CREATE INDEX IF NOT EXISTS idx_transfers_block ON transfers(block_number)',
      'CREATE INDEX IF NOT EXISTS idx_transfer_stats_from ON transfer_stats(from_address)',
      'CREATE INDEX IF NOT EXISTS idx_transfer_stats_to ON transfer_stats(to_address)'
    ];
    
    for (const index of indexes) {
      this.sqliteDb.exec(index);
    }
    
    console.log('Indexes created');
  }

  async optimizeDatabase() {
    console.log('Optimizing database...');
    
    // Re-enable normal settings
    this.sqliteDb.pragma('journal_mode = WAL');
    this.sqliteDb.pragma('synchronous = NORMAL');
    this.sqliteDb.pragma('cache_size = -64000');
    this.sqliteDb.pragma('locking_mode = NORMAL');
    
    // Analyze for query optimizer
    this.sqliteDb.exec('ANALYZE');
    
    // Vacuum to reclaim space
    this.sqliteDb.exec('VACUUM');
    
    console.log('Database optimized');
  }
}

// Neo4j to SQLite relationship migration
class Neo4jToSQLiteMigrator {
  constructor(neo4jConfig, sqlitePath) {
    this.neo4jConfig = neo4jConfig;
    this.sqliteDb = new Database(sqlitePath);
  }

  async migrateGraphRelationships() {
    console.log('Migrating Neo4j relationships...');
    
    // This would require neo4j driver
    // Example of how to migrate TRANSFER relationships:
    
    const insertStmt = this.sqliteDb.prepare(`
      UPDATE transfer_stats SET
        first_transfer_block = ?,
        last_transfer_block = ?,
        avg_amount = ?
      WHERE from_address = ? AND to_address = ?
    `);
    
    // Query Neo4j for TRANSFER relationships
    // Process and insert into SQLite
    
    console.log('Graph relationships migrated');
  }
}

// Usage
async function runMigration() {
  const pgConfig = {
    host: 'localhost',
    port: 5432,
    database: 'followthedot',
    user: 'postgres',
    password: 'password'
  };
  
  const sqlitePath = './polkadot-analysis.db';
  
  const migrator = new PostgreSQLToSQLiteMigrator(pgConfig, sqlitePath);
  await migrator.migrate();
}

// Export for use in other modules
export { PostgreSQLToSQLiteMigrator, Neo4jToSQLiteMigrator };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration().catch(console.error);
}