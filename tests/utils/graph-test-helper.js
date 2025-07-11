import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create a test database with the schema
 */
export async function createTestDatabase(customPath = null) {
  const dbPath = customPath || ':memory:';
  
  // If using file database, ensure directory exists
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Remove existing database
    try {
      await fs.unlink(dbPath);
      await fs.unlink(`${dbPath}-wal`).catch(() => {});
      await fs.unlink(`${dbPath}-shm`).catch(() => {});
    } catch (error) {
      // Ignore if files don't exist
    }
  }
  
  const db = new Database(dbPath);
  
  // Configure for optimal test performance
  db.pragma('journal_mode = DELETE'); // Avoid WAL mode conflicts in tests
  db.pragma('synchronous = FULL'); // Ensure data integrity
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('temp_store = MEMORY'); // Use memory for temp tables
  
  // Read and execute schema
  const schemaPath = path.join(__dirname, '../../src/database/schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  db.exec(schema);
  
  // Add additional indexes for graph queries if not in schema
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_relationships_volume 
    ON account_relationships(total_volume DESC);
    
    CREATE INDEX IF NOT EXISTS idx_relationships_composite 
    ON account_relationships(from_address, to_address, transfer_count);
    
    CREATE INDEX IF NOT EXISTS idx_transfers_timestamp 
    ON transfers(timestamp);
    
    CREATE INDEX IF NOT EXISTS idx_accounts_risk 
    ON accounts(risk_score DESC) WHERE risk_score > 0;
  `);
  
  // Add scoring columns to relationships if not present
  try {
    db.exec(`
      ALTER TABLE account_relationships ADD COLUMN volume_score REAL DEFAULT 0;
      ALTER TABLE account_relationships ADD COLUMN frequency_score REAL DEFAULT 0;
      ALTER TABLE account_relationships ADD COLUMN temporal_score REAL DEFAULT 0;
      ALTER TABLE account_relationships ADD COLUMN network_score REAL DEFAULT 0;
      ALTER TABLE account_relationships ADD COLUMN risk_score REAL DEFAULT 0;
      ALTER TABLE account_relationships ADD COLUMN total_score REAL DEFAULT 0;
    `);
  } catch (error) {
    // Columns might already exist
  }
  
  return db;
}

/**
 * Seed test data with realistic patterns
 */
export function seedTestData(db, options = {}) {
  const {
    accountCount = 10,
    transferCount = 50,
    relationshipCount = 20
  } = options;
  
  // Generate test accounts
  const accounts = generateTestAccounts(accountCount);
  
  // Insert accounts
  const insertAccount = db.prepare(`
    INSERT INTO accounts (
      address, identity_display, balance, total_transfers_in, 
      total_transfers_out, volume_in, volume_out, first_seen_block, 
      last_seen_block, risk_score
    ) VALUES (
      @address, @identity_display, @balance, @total_transfers_in,
      @total_transfers_out, @volume_in, @volume_out, @first_seen_block, 
      @last_seen_block, @risk_score
    )
  `);
  
  const insertManyAccounts = db.transaction((accounts) => {
    for (const account of accounts) {
      insertAccount.run(account);
    }
  });
  
  insertManyAccounts(accounts);
  
  // Generate and insert transfers
  const transfers = generateTestTransfers(accounts, transferCount);
  
  const insertTransfer = db.prepare(`
    INSERT INTO transfers (
      hash, block_number, timestamp, from_address, to_address,
      value, fee, success, method, section
    ) VALUES (
      @hash, @block_number, @timestamp, @from_address, @to_address,
      @value, @fee, @success, @method, @section
    )
  `);
  
  const insertManyTransfers = db.transaction((transfers) => {
    for (const transfer of transfers) {
      insertTransfer.run(transfer);
    }
  });
  
  insertManyTransfers(transfers);
  
  // The triggers should have created relationships, but we can add scoring
  updateRelationshipScores(db);
  
  return { accounts, transfers };
}

/**
 * Generate test accounts with various characteristics
 */
function generateTestAccounts(count) {
  const accounts = [];
  const baseAddresses = [
    '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
    '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
    '5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9'
  ];
  
  for (let i = 0; i < count; i++) {
    const address = i < baseAddresses.length ? 
      baseAddresses[i] : 
      generateAddress(i);
    
    accounts.push({
      address,
      identity_display: `Test Account ${i + 1}`,
      balance: String((i + 1) * 1000000000000), // Increasing balances
      total_transfers_in: Math.floor(Math.random() * 20),
      total_transfers_out: Math.floor(Math.random() * 20),
      volume_in: String(Math.floor(Math.random() * 100) * 1000000000000),
      volume_out: String(Math.floor(Math.random() * 100) * 1000000000000),
      first_seen_block: 1000000 + i * 10000,
      last_seen_block: 2000000 + i * 10000,
      risk_score: Math.random() * 0.5 // 0-0.5 risk scores
    });
  }
  
  return accounts;
}

/**
 * Generate test transfers with various patterns
 */
function generateTestTransfers(accounts, count) {
  const transfers = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const fromAccount = accounts[Math.floor(Math.random() * accounts.length)];
    const toAccount = accounts[Math.floor(Math.random() * accounts.length)];
    
    // Skip self-transfers most of the time
    if (fromAccount.address === toAccount.address && Math.random() > 0.1) {
      i--;
      continue;
    }
    
    const timestamp = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000); // Last 30 days
    
    transfers.push({
      hash: `0x${i.toString(16).padStart(64, '0')}`,
      block_number: 1500000 + i * 100,
      timestamp: timestamp.toISOString(),
      from_address: fromAccount.address,
      to_address: toAccount.address,
      value: String(Math.floor(Math.random() * 100 + 1) * 1000000000000),
      fee: '125000000',
      success: 1,
      method: Math.random() > 0.5 ? 'transfer' : 'transferKeepAlive',
      section: 'balances'
    });
  }
  
  return transfers;
}

/**
 * Generate a valid-looking Polkadot address
 */
function generateAddress(seed) {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let address = '5';
  
  // Use seed to generate deterministic addresses
  const rng = mulberry32(seed);
  
  for (let i = 0; i < 47; i++) {
    address += chars[Math.floor(rng() * chars.length)];
  }
  
  return address;
}

/**
 * Simple deterministic random number generator
 */
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Update relationship scores for testing
 */
function updateRelationshipScores(db) {
  // Simple scoring for test data
  db.exec(`
    UPDATE account_relationships
    SET 
      volume_score = MIN(100, CAST(total_volume AS REAL) / 1000000000000),
      frequency_score = MIN(100, transfer_count * 10),
      temporal_score = 50,
      network_score = 30,
      risk_score = RANDOM() % 20,
      total_score = (
        MIN(100, CAST(total_volume AS REAL) / 1000000000000) * 0.25 +
        MIN(100, transfer_count * 10) * 0.25 +
        50 * 0.20 +
        30 * 0.30
      ) * (1 - (RANDOM() % 20) / 200.0)
  `);
}

/**
 * Insert graph data (nodes, edges, relationships)
 */
export async function insertGraphData(db, graphData) {
  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO accounts (
      address, identity_display, balance, total_transfers_in, 
      total_transfers_out, volume_in, volume_out, first_seen_block, 
      last_seen_block
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertTransfer = db.prepare(`
    INSERT INTO transfers (
      hash, block_number, timestamp, from_address, to_address,
      value, fee, success, method, section
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertRelationship = db.prepare(`
    INSERT OR REPLACE INTO account_relationships (
      from_address, to_address, transfer_count, total_volume,
      first_transfer_block, last_transfer_block
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const transaction = db.transaction(() => {
    // Insert nodes
    for (const node of graphData.nodes) {
      insertAccount.run(
        node.address,
        node.identity_display || null,
        node.balance || '0',
        node.total_transfers_in || 0,
        node.total_transfers_out || 0,
        node.volume_in || '0',
        node.volume_out || '0',
        node.first_seen_block || 1000000,
        node.last_seen_block || 2000000
      );
    }
    
    // Insert edges
    for (const edge of graphData.edges) {
      insertTransfer.run(
        edge.hash,
        edge.block_number,
        edge.timestamp || new Date().toISOString(),
        edge.from_address,
        edge.to_address,
        edge.value || '1000000000000',
        edge.fee || '125000000',
        edge.success ? 1 : 0,
        edge.method || 'transfer',
        edge.section || 'balances'
      );
    }
    
    // Insert relationships if provided
    if (graphData.relationships) {
      for (const rel of graphData.relationships) {
        insertRelationship.run(
          rel.from_address,
          rel.to_address,
          rel.transfer_count,
          rel.total_volume,
          rel.first_transfer_block,
          rel.last_transfer_block
        );
      }
    }
  });
  
  transaction();
}

/**
 * Mock GraphQueries service for testing
 */
export class MockGraphQueries {
  constructor() {
    this.mockData = new Map();
  }
  
  setMockData(key, data) {
    this.mockData.set(key, data);
  }
  
  getDirectConnections(address, limit = 100) {
    return this.mockData.get(`direct_${address}`) || [];
  }
  
  getMultiHopConnections(address, depth, limit = 100) {
    return this.mockData.get(`multihop_${address}_${depth}`) || [];
  }
  
  findShortestPath(from, to, maxDepth = 6) {
    return this.mockData.get(`path_${from}_${to}`) || null;
  }
  
  extractSubgraph(address, depth = 2) {
    return this.mockData.get(`subgraph_${address}_${depth}`) || { nodes: [], edges: [] };
  }
  
  getGraphMetrics(address) {
    return this.mockData.get(`metrics_${address}`) || {
      degreeCentrality: { in: 0, out: 0, total: 0 },
      clusteringCoefficient: 0,
      volumeMetrics: {
        totalInVolume: '0',
        totalOutVolume: '0',
        averageTransferSize: '0'
      }
    };
  }
}

/**
 * Performance monitoring helper
 */
export class TestPerformanceMonitor {
  constructor() {
    this.measurements = new Map();
  }
  
  async measure(name, fn) {
    const start = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      const memoryDelta = process.memoryUsage().heapUsed - startMemory;
      
      this.record(name, { duration, memoryDelta, success: true });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.record(name, { duration, error: error.message, success: false });
      throw error;
    }
  }
  
  record(name, measurement) {
    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name).push(measurement);
  }
  
  getStats(name) {
    const measurements = this.measurements.get(name) || [];
    if (measurements.length === 0) return null;
    
    const durations = measurements.filter(m => m.success).map(m => m.duration);
    const memories = measurements.filter(m => m.success).map(m => m.memoryDelta);
    
    return {
      count: measurements.length,
      successCount: measurements.filter(m => m.success).length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      avgMemory: memories.reduce((a, b) => a + b, 0) / memories.length
    };
  }
  
  getAllStats() {
    const stats = {};
    for (const [name, measurements] of this.measurements) {
      stats[name] = this.getStats(name);
    }
    return stats;
  }
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for condition');
}

/**
 * Create a test graph with specific properties
 */
export function createTestGraph(options = {}) {
  const {
    nodeCount = 10,
    edgeCount = 20,
    pattern = 'random'
  } = options;
  
  const nodes = [];
  const edges = [];
  
  // Create nodes
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: generateAddress(i),
      address: generateAddress(i),
      identity_display: `Node ${i}`,
      balance: String((i + 1) * 1000000000000),
      risk_score: Math.random() * 0.5
    });
  }
  
  // Create edges based on pattern
  switch (pattern) {
    case 'chain':
      for (let i = 0; i < nodeCount - 1; i++) {
        edges.push({
          from: nodes[i].address,
          to: nodes[i + 1].address,
          transfers: Math.floor(Math.random() * 10) + 1,
          volume: String(Math.floor(Math.random() * 100) * 1000000000000)
        });
      }
      break;
      
    case 'hub':
      const hub = nodes[0];
      for (let i = 1; i < nodeCount; i++) {
        edges.push({
          from: hub.address,
          to: nodes[i].address,
          transfers: Math.floor(Math.random() * 10) + 1,
          volume: String(Math.floor(Math.random() * 100) * 1000000000000)
        });
      }
      break;
      
    case 'random':
    default:
      for (let i = 0; i < edgeCount; i++) {
        const from = nodes[Math.floor(Math.random() * nodeCount)];
        const to = nodes[Math.floor(Math.random() * nodeCount)];
        
        if (from.address !== to.address) {
          edges.push({
            from: from.address,
            to: to.address,
            transfers: Math.floor(Math.random() * 10) + 1,
            volume: String(Math.floor(Math.random() * 100) * 1000000000000)
          });
        }
      }
  }
  
  return { nodes, edges };
}