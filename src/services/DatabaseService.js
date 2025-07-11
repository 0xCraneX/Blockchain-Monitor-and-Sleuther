import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseService {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DATABASE_PATH || './data/analysis.db';
  }

  async initialize() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      await fs.mkdir(dataDir, { recursive: true });

      // Open database connection
      this.db = new Database(this.dbPath, { 
        verbose: process.env.NODE_ENV === 'development' ? logger.debug : null 
      });

      // Enable foreign keys and WAL mode for better performance
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');

      // Run schema
      const schemaPath = path.join(__dirname, '../database/schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');
      this.db.exec(schema);

      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database', error);
      throw error;
    }
  }

  // Account methods
  getAccount(address) {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE address = ?');
    return stmt.get(address);
  }

  createAccount(account) {
    const stmt = this.db.prepare(`
      INSERT INTO accounts (address, public_key, identity_display, balance, first_seen_block)
      VALUES (@address, @publicKey, @identityDisplay, @balance, @firstSeenBlock)
      ON CONFLICT(address) DO UPDATE SET
        public_key = COALESCE(@publicKey, public_key),
        identity_display = COALESCE(@identityDisplay, identity_display),
        balance = COALESCE(@balance, balance),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `);
    return stmt.get(account);
  }

  updateAccountIdentity(address, identity) {
    const stmt = this.db.prepare(`
      UPDATE accounts SET
        identity_display = @display,
        identity_legal = @legal,
        identity_web = @web,
        identity_email = @email,
        identity_twitter = @twitter,
        identity_riot = @riot,
        identity_verified = @verified,
        updated_at = CURRENT_TIMESTAMP
      WHERE address = @address
    `);
    return stmt.run({ address, ...identity });
  }

  searchAccounts(query, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM accounts 
      WHERE address LIKE @query 
         OR identity_display LIKE @query
         OR identity_legal LIKE @query
      ORDER BY 
        CASE 
          WHEN address = @exactQuery THEN 0
          WHEN identity_display = @exactQuery THEN 1
          ELSE 2
        END,
        total_transfers_in + total_transfers_out DESC
      LIMIT @limit
    `);
    return stmt.all({ 
      query: `%${query}%`, 
      exactQuery: query,
      limit 
    });
  }

  // Transfer methods
  createTransfer(transfer) {
    const stmt = this.db.prepare(`
      INSERT INTO transfers (
        hash, block_number, timestamp, from_address, to_address, 
        value, fee, success, method, section
      ) VALUES (
        @hash, @blockNumber, @timestamp, @fromAddress, @toAddress,
        @value, @fee, @success, @method, @section
      )
      ON CONFLICT(hash) DO NOTHING
    `);
    return stmt.run(transfer);
  }

  getTransfers(address, options = {}) {
    const { limit = 100, offset = 0, startTime, endTime } = options;
    
    let query = `
      SELECT * FROM transfers 
      WHERE (from_address = @address OR to_address = @address)
    `;
    
    const params = { address, limit, offset };
    
    if (startTime) {
      query += ' AND timestamp >= @startTime';
      params.startTime = startTime;
    }
    
    if (endTime) {
      query += ' AND timestamp <= @endTime';
      params.endTime = endTime;
    }
    
    query += ' ORDER BY timestamp DESC LIMIT @limit OFFSET @offset';
    
    const stmt = this.db.prepare(query);
    return stmt.all(params);
  }

  // Relationship methods
  getRelationships(address, options = {}) {
    const { depth = 1, minVolume = '0', limit = 100 } = options;
    
    // For now, implement single depth - can be extended for multi-depth
    const stmt = this.db.prepare(`
      SELECT 
        CASE 
          WHEN from_address = @address THEN to_address
          ELSE from_address
        END as connected_address,
        SUM(CASE WHEN from_address = @address THEN 1 ELSE 0 END) as outgoing_count,
        SUM(CASE WHEN to_address = @address THEN 1 ELSE 0 END) as incoming_count,
        SUM(CAST(total_volume AS INTEGER)) as total_volume,
        MIN(first_transfer_block) as first_interaction,
        MAX(last_transfer_block) as last_interaction
      FROM account_relationships
      WHERE (from_address = @address OR to_address = @address)
        AND CAST(total_volume AS INTEGER) >= CAST(@minVolume AS INTEGER)
      GROUP BY connected_address
      ORDER BY total_volume DESC
      LIMIT @limit
    `);
    
    return stmt.all({ address, minVolume, limit });
  }

  // Pattern methods
  createPattern(pattern) {
    const stmt = this.db.prepare(`
      INSERT INTO patterns (address, pattern_type, confidence, details)
      VALUES (@address, @patternType, @confidence, @details)
    `);
    return stmt.run({
      address: pattern.address,
      patternType: pattern.patternType,
      confidence: pattern.confidence,
      details: JSON.stringify(pattern.details)
    });
  }

  getPatterns(address) {
    const stmt = this.db.prepare(`
      SELECT * FROM patterns 
      WHERE address = @address 
        AND reviewed = FALSE 
        AND false_positive = FALSE
      ORDER BY confidence DESC, detected_at DESC
    `);
    return stmt.all({ address }).map(p => ({
      ...p,
      details: JSON.parse(p.details)
    }));
  }

  // Investigation methods
  saveInvestigation(investigation) {
    const stmt = this.db.prepare(`
      INSERT INTO investigations (session_id, title, description, addresses, filters, graph_state)
      VALUES (@sessionId, @title, @description, @addresses, @filters, @graphState)
      ON CONFLICT(session_id) DO UPDATE SET
        title = @title,
        description = @description,
        addresses = @addresses,
        filters = @filters,
        graph_state = @graphState,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run({
      sessionId: investigation.sessionId,
      title: investigation.title,
      description: investigation.description,
      addresses: JSON.stringify(investigation.addresses),
      filters: JSON.stringify(investigation.filters),
      graphState: JSON.stringify(investigation.graphState)
    });
  }

  getInvestigation(sessionId) {
    const stmt = this.db.prepare('SELECT * FROM investigations WHERE session_id = ?');
    const result = stmt.get(sessionId);
    if (result) {
      return {
        ...result,
        addresses: JSON.parse(result.addresses),
        filters: JSON.parse(result.filters),
        graphState: JSON.parse(result.graph_state)
      };
    }
    return null;
  }

  // Sync status methods
  getSyncStatus(chainId) {
    const stmt = this.db.prepare('SELECT * FROM sync_status WHERE chain_id = ?');
    return stmt.get(chainId);
  }

  updateSyncStatus(chainId, status) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_status (chain_id, last_processed_block, status)
      VALUES (@chainId, @lastProcessedBlock, @status)
      ON CONFLICT(chain_id) DO UPDATE SET
        last_processed_block = @lastProcessedBlock,
        last_finalized_block = @lastFinalizedBlock,
        status = @status,
        error_message = @errorMessage,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run({
      chainId,
      lastProcessedBlock: status.lastProcessedBlock,
      lastFinalizedBlock: status.lastFinalizedBlock,
      status: status.status,
      errorMessage: status.errorMessage
    });
  }

  // Statistics methods
  updateStatistic(name, value, date = new Date().toISOString().split('T')[0]) {
    const stmt = this.db.prepare(`
      INSERT INTO statistics (metric_name, metric_value, metric_date)
      VALUES (@name, @value, @date)
      ON CONFLICT(metric_name, metric_date) DO UPDATE SET
        metric_value = @value
    `);
    return stmt.run({ name, value, date });
  }

  getStatistics(name, days = 30) {
    const stmt = this.db.prepare(`
      SELECT * FROM statistics 
      WHERE metric_name = @name 
        AND metric_date >= date('now', '-' || @days || ' days')
      ORDER BY metric_date DESC
    `);
    return stmt.all({ name, days });
  }

  // Transaction helpers
  transaction(fn) {
    return this.db.transaction(fn)();
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      logger.info('Database connection closed');
    }
  }
}