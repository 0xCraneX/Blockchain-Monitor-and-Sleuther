import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';
import { 
  DatabaseConnectionError, 
  DatabaseError, 
  RecordNotFoundError,
  createDatabaseError 
} from '../errors/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseService {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DATABASE_PATH || './data/analysis.db';
    this.preparedStatements = new Map();
    this.isInitialized = false;
    this.connectionPool = {
      maxConnections: 10,
      activeConnections: 0,
      maxIdleTime: 30000, // 30 seconds
      lastActivity: Date.now()
    };
    
    // Cleanup interval for prepared statements
    this.cleanupInterval = null;
    this.startCleanupMonitoring();
  }

  // Utility method to safely convert values for SQLite binding
  static sanitizeForSQLite(value) {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === undefined) {
      return null;
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return value;
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

      // Register custom REGEXP function for SQLite
      this.db.function('REGEXP', (pattern, text) => {
        if (!pattern || !text) return 0;
        try {
          const regex = new RegExp(pattern);
          return regex.test(String(text)) ? 1 : 0;
        } catch (error) {
          logger.warn('Invalid regex pattern:', pattern);
          return 0;
        }
      });

      // Run main schema
      const schemaPath = path.join(__dirname, '../database/schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');
      this.db.exec(schema);
      
      // Run graph schema
      const graphSchemaPath = path.join(__dirname, '../database/graph-schema.sql');
      try {
        const graphSchema = await fs.readFile(graphSchemaPath, 'utf8');
        // Execute statements one by one to handle ALTER TABLE gracefully
        const statements = graphSchema.split(';').filter(s => s.trim());
        for (const statement of statements) {
          if (statement.trim()) {
            try {
              this.db.exec(statement + ';');
            } catch (error) {
              // Ignore errors for ALTER TABLE if column already exists
              if (!error.message.includes('duplicate column name')) {
                logger.warn('Error executing graph schema statement:', error.message);
              }
            }
          }
        }
      } catch (error) {
        logger.warn('Graph schema not found or error loading:', error.message);
      }

      // Run relationship scoring schema
      const scoringSchemaPath = path.join(__dirname, '../database/relationship_scoring.sql');
      try {
        const scoringSchema = await fs.readFile(scoringSchemaPath, 'utf8');
        // Execute statements one by one to handle ALTER TABLE and CREATE VIEW gracefully
        const statements = scoringSchema.split(';').filter(s => s.trim());
        for (const statement of statements) {
          if (statement.trim()) {
            try {
              this.db.exec(statement + ';');
            } catch (error) {
              // Ignore errors for ALTER TABLE if column already exists or VIEW already exists
              if (!error.message.includes('duplicate column name') && 
                  !error.message.includes('already exists')) {
                logger.warn('Error executing scoring schema statement:', error.message);
              }
            }
          }
        }
        logger.info('Relationship scoring schema loaded successfully');
      } catch (error) {
        logger.warn('Relationship scoring schema not found or error loading:', error.message);
      }

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
    
    // Ensure proper parameter mapping and data types
    const accountData = {
      address: account.address,
      publicKey: account.publicKey || account.public_key,
      identityDisplay: account.identityDisplay || account.identity_display,
      balance: account.balance,
      firstSeenBlock: account.firstSeenBlock || account.first_seen_block
    };
    
    return stmt.get(accountData);
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
    
    // Convert boolean to integer for SQLite compatibility
    const identityData = {
      address,
      display: identity.display,
      legal: identity.legal,
      web: identity.web,
      email: identity.email,
      twitter: identity.twitter,
      riot: identity.riot,
      verified: typeof identity.verified === 'boolean' ? (identity.verified ? 1 : 0) : identity.verified
    };
    
    return stmt.run(identityData);
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
        @hash, @block_number, @timestamp, @from_address, @to_address,
        @value, @fee, @success, @method, @section
      )
      ON CONFLICT(hash) DO NOTHING
    `);
    
    // Ensure proper data types for SQLite binding
    const transferData = {
      hash: transfer.hash,
      block_number: transfer.block_number || transfer.blockNumber,
      timestamp: transfer.timestamp,
      from_address: transfer.from_address || transfer.fromAddress,
      to_address: transfer.to_address || transfer.toAddress,
      value: transfer.value,
      fee: transfer.fee,
      success: typeof transfer.success === 'boolean' ? (transfer.success ? 1 : 0) : transfer.success,
      method: transfer.method,
      section: transfer.section
    };
    
    return stmt.run(transferData);
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

  // Start cleanup monitoring for prepared statements
  startCleanupMonitoring() {
    this.cleanupInterval = setInterval(() => {
      try {
        const currentTime = Date.now();
        
        // Update connection pool activity
        this.connectionPool.lastActivity = currentTime;
        
        // Clear old prepared statements if needed
        if (this.preparedStatements.size > 50) {
          logger.debug('Cleaning up old prepared statements');
          const oldSize = this.preparedStatements.size;
          
          // Keep only the most recently used statements
          const entries = Array.from(this.preparedStatements.entries());
          entries.sort((a, b) => (b[1].lastUsed || 0) - (a[1].lastUsed || 0));
          
          this.preparedStatements.clear();
          entries.slice(0, 25).forEach(([key, value]) => {
            this.preparedStatements.set(key, value);
          });
          
          logger.debug(`Cleaned up prepared statements: ${oldSize} -> ${this.preparedStatements.size}`);
        }
        
        // Update connection metrics
        if (this.connectionPool.maxIdleTime && 
            currentTime - this.connectionPool.lastActivity > this.connectionPool.maxIdleTime) {
          logger.debug('Database connection idle for extended period');
        }
        
      } catch (error) {
        logger.error('Error during cleanup monitoring:', error);
      }
    }, 30000); // Run every 30 seconds
    
    logger.debug('Database cleanup monitoring started');
  }

  // Stop cleanup monitoring
  stopCleanupMonitoring() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.debug('Database cleanup monitoring stopped');
    }
  }

  // Close database connection
  close() {
    try {
      // Stop cleanup monitoring
      this.stopCleanupMonitoring();
      
      // Clear prepared statements cache
      this.preparedStatements.clear();
      
      // Close database connection
      if (this.db) {
        this.db.close();
        logger.info('Database connection closed');
      }
      
      this.isInitialized = false;
    } catch (error) {
      logger.error('Error closing database:', error);
      throw error;
    }
  }
}