# System Architecture Blueprint

## Overview

This document provides a complete architectural blueprint for the Polkadot Analysis Tool, designed as a monolithic Node.js application with modular structure, optimized for both desktop and web deployment.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                              │
├─────────────────────┬───────────────────┬───────────────────────┤
│   Web Browser       │  Desktop App     │    CLI Tool           │
│   (React/D3.js)     │  (Electron)      │    (Node.js)          │
└─────────────────────┴───────────────────┴───────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                 │
├─────────────────────────────────────────────────────────────────┤
│   REST API (Express.js)    │    WebSocket (Socket.io)           │
│   - Address Search         │    - Real-time Updates            │
│   - Graph Generation       │    - Live Transfers               │
│   - Pattern Detection      │    - Price Updates                │
│   - Export/Import          │    - Alert Notifications          │
└────────────────────────────┴────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Service Layer                               │
├──────────────┬──────────────┬──────────────┬───────────────────┤
│  Blockchain  │   Analysis   │    Data      │    Integration    │
│  Services    │   Services   │  Services    │    Services       │
├──────────────┼──────────────┼──────────────┼───────────────────┤
│ • Indexer    │ • Graph      │ • Search     │ • Subscan API     │
│ • Monitor    │   Builder    │   Engine     │ • Price APIs      │
│ • Sync       │ • Pattern    │ • Cache      │ • Identity        │
│              │   Detector   │   Manager    │   Service         │
└──────────────┴──────────────┴──────────────┴───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Access Layer                            │
├─────────────────────────────────────────────────────────────────┤
│            Database Abstraction (Repository Pattern)              │
│    • Account Repository    • Transfer Repository                  │
│    • Pattern Repository    • Statistics Repository                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Storage Layer                               │
├──────────────────────┬────────────────────┬────────────────────┤
│   SQLite Database    │   File Storage     │   Memory Cache     │
│   • Accounts         │   • Exports        │   • Hot Data       │
│   • Transfers        │   • Reports        │   • API Results    │
│   • Patterns         │   • Backups        │   • Search Index   │
└──────────────────────┴────────────────────┴────────────────────┘
```

## Technology Stack

### Core Technologies

```javascript
{
  "runtime": {
    "node": "20.x LTS",
    "npm": "10.x"
  },
  "framework": {
    "api": "Express.js 4.x",
    "websocket": "Socket.io 4.x",
    "desktop": "Electron 28.x"
  },
  "database": {
    "primary": "SQLite3 (better-sqlite3)",
    "orm": "None (raw SQL for performance)",
    "migrations": "db-migrate"
  },
  "blockchain": {
    "polkadot": "@polkadot/api 10.x",
    "hydration": "@galacticcouncil/sdk",
    "subscan": "Custom client"
  },
  "frontend": {
    "framework": "Vanilla JS (initially)",
    "visualization": "D3.js 7.x",
    "bundler": "Webpack 5.x",
    "styles": "CSS Modules"
  },
  "testing": {
    "unit": "Vitest",
    "integration": "Supertest",
    "e2e": "Playwright"
  },
  "monitoring": {
    "logging": "Pino",
    "metrics": "Prometheus client",
    "tracing": "OpenTelemetry"
  }
}
```

### NPM Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "better-sqlite3": "^9.4.0",
    "socket.io": "^4.6.1",
    "@polkadot/api": "^10.11.2",
    "zod": "^3.22.4",
    "pino": "^8.17.2",
    "prom-client": "^15.1.0",
    "db-migrate": "^0.11.13",
    "db-migrate-sqlite3": "^0.4.0",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "compression": "^1.7.4",
    "express-rate-limit": "^7.1.5"
  },
  "devDependencies": {
    "vitest": "^1.2.0",
    "supertest": "^6.3.4",
    "@playwright/test": "^1.41.0",
    "eslint": "^8.56.0",
    "prettier": "^3.2.4",
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.4",
    "nodemon": "^3.0.3"
  }
}
```

## Module Structure

```
polkadot-analysis-tool/
├── src/
│   ├── api/                    # API Layer
│   │   ├── routes/            # Express routes
│   │   ├── middleware/        # Auth, validation, etc.
│   │   ├── websocket/         # WebSocket handlers
│   │   └── server.js          # Express app setup
│   │
│   ├── services/              # Business Logic
│   │   ├── blockchain/        # Blockchain interaction
│   │   ├── analysis/          # Graph, patterns, etc.
│   │   ├── data/             # Search, cache, etc.
│   │   └── integration/       # External APIs
│   │
│   ├── repositories/          # Data Access
│   │   ├── AccountRepository.js
│   │   ├── TransferRepository.js
│   │   ├── PatternRepository.js
│   │   └── BaseRepository.js
│   │
│   ├── models/               # Data Models
│   │   ├── Account.js
│   │   ├── Transfer.js
│   │   ├── Pattern.js
│   │   └── schemas/          # Zod schemas
│   │
│   ├── utils/                # Utilities
│   │   ├── logger.js
│   │   ├── errors.js
│   │   ├── validators.js
│   │   └── helpers.js
│   │
│   ├── config/               # Configuration
│   │   ├── index.js
│   │   ├── database.js
│   │   ├── blockchain.js
│   │   └── api.js
│   │
│   └── index.js              # Application entry
│
├── migrations/               # Database migrations
├── tests/                   # Test files
├── scripts/                 # Utility scripts
├── docs/                    # Documentation
├── web/                     # Frontend files
│   ├── src/
│   ├── public/
│   └── webpack.config.js
│
├── .env.example
├── package.json
├── README.md
└── CLAUDE.md
```

## Service Layer Design

### Blockchain Services

```javascript
// src/services/blockchain/BlockchainIndexer.js
export class BlockchainIndexer {
  constructor(blockchainClient, transferRepo, eventEmitter) {
    this.blockchain = blockchainClient;
    this.transferRepo = transferRepo;
    this.events = eventEmitter;
    this.isRunning = false;
  }

  async start(fromBlock = null) {
    if (this.isRunning) return;
    this.isRunning = true;
    
    const lastBlock = fromBlock || await this.transferRepo.getLastProcessedBlock();
    
    // Subscribe to new blocks
    this.subscription = await this.blockchain.subscribeNewHeads(async (header) => {
      try {
        await this.processBlock(header.number.toNumber());
        this.events.emit('block:processed', header.number.toNumber());
      } catch (error) {
        this.events.emit('block:error', { block: header.number, error });
      }
    });
    
    // Catch up on missed blocks
    await this.catchUp(lastBlock);
  }

  async processBlock(blockNumber) {
    const block = await this.blockchain.getBlock(blockNumber);
    const transfers = this.extractTransfers(block);
    
    await this.transferRepo.saveTransfers(transfers, blockNumber);
  }

  stop() {
    if (this.subscription) {
      this.subscription();
      this.isRunning = false;
    }
  }
}
```

### Analysis Services

```javascript
// src/services/analysis/GraphBuilder.js
export class GraphBuilder {
  constructor(accountRepo, transferRepo, cacheManager) {
    this.accountRepo = accountRepo;
    this.transferRepo = transferRepo;
    this.cache = cacheManager;
  }

  async buildGraph(centerAddress, options = {}) {
    // Check cache first
    const cacheKey = `graph:${centerAddress}:${JSON.stringify(options)}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const graph = await this._buildGraphInternal(centerAddress, options);
    
    // Cache result
    await this.cache.set(cacheKey, graph, 300); // 5 min TTL
    
    return graph;
  }

  async _buildGraphInternal(centerAddress, options) {
    const { depth = 2, minVolume = 0n, timeRange = null } = options;
    
    const visited = new Set();
    const queue = [{ address: centerAddress, currentDepth: 0 }];
    const nodes = [];
    const edges = [];
    
    while (queue.length > 0) {
      const { address, currentDepth } = queue.shift();
      
      if (visited.has(address) || currentDepth > depth) continue;
      visited.add(address);
      
      // Get account details
      const account = await this.accountRepo.getAccountWithStats(address);
      nodes.push(account);
      
      // Get connections
      const connections = await this.transferRepo.getConnections(address, {
        minVolume,
        timeRange
      });
      
      for (const conn of connections) {
        edges.push(conn);
        
        const nextAddress = conn.from === address ? conn.to : conn.from;
        if (!visited.has(nextAddress) && currentDepth < depth) {
          queue.push({ address: nextAddress, currentDepth: currentDepth + 1 });
        }
      }
    }
    
    return { nodes, edges };
  }
}
```

## Data Flow Architecture

### Request Processing Flow

```
User Request → API Route → Validation → Service Layer → Repository → Database
     ↑                                                                    ↓
     └──────────────────────── Response ←────────────────────────────────┘
```

### Real-time Update Flow

```
Blockchain → Indexer → Event Bus → WebSocket → Client
                ↓
            Database
```

### Sequence Diagram: Address Analysis

```
Client          API            GraphBuilder      Repositories       Cache
  │              │                  │                 │               │
  ├──GET /graph──►                 │                 │               │
  │              ├──buildGraph()───►                 │               │
  │              │                  ├──checkCache()──────────────────►
  │              │                  │◄──────────────────────────miss─┤
  │              │                  ├──getAccount()──►               │
  │              │                  │◄───────────────┤               │
  │              │                  ├──getTransfers()►               │
  │              │                  │◄───────────────┤               │
  │              │                  ├──saveToCache()─────────────────►
  │              │◄─────────────────┤                               │
  │◄─────────────┤                  │                               │
```

## Storage Architecture

### Database Schema Optimization

```sql
-- Optimized indexes for common queries
CREATE INDEX idx_transfers_composite ON transfers(
  from_address, to_address, timestamp DESC
);

CREATE INDEX idx_transfers_amount ON transfers(
  amount DESC
) WHERE amount > 1000000000;

-- Partial indexes for performance
CREATE INDEX idx_accounts_active ON accounts(
  balance DESC
) WHERE balance > 0;

-- Function-based index for search
CREATE INDEX idx_accounts_search ON accounts(
  LOWER(display_name)
);
```

### Data Partitioning Strategy

```javascript
// Monthly partitioning for transfers
class PartitionManager {
  constructor(db) {
    this.db = db;
  }

  async createMonthlyPartition(year, month) {
    const tableName = `transfers_${year}_${month.toString().padStart(2, '0')}`;
    
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        LIKE transfers INCLUDING ALL
      );
      
      -- Attach partition
      ALTER TABLE transfers ATTACH PARTITION ${tableName}
      FOR VALUES FROM ('${year}-${month}-01') TO ('${year}-${month + 1}-01');
    `);
  }

  async archiveOldPartitions(monthsToKeep = 12) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
    
    // Move old partitions to archive
    const partitions = await this.getPartitionsOlderThan(cutoffDate);
    
    for (const partition of partitions) {
      await this.archivePartition(partition);
    }
  }
}
```

### Backup and Recovery

```javascript
// src/services/data/BackupService.js
export class BackupService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
  }

  async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.config.backupDir, `backup-${timestamp}.db`);
    
    // Online backup
    await new Promise((resolve, reject) => {
      this.db.backup(backupPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Compress backup
    const compressed = await this.compress(backupPath);
    
    // Verify backup integrity
    await this.verifyBackup(compressed);
    
    return compressed;
  }

  async restore(backupPath) {
    // Verify backup before restore
    const isValid = await this.verifyBackup(backupPath);
    if (!isValid) throw new Error('Invalid backup file');
    
    // Decompress if needed
    const dbPath = await this.decompress(backupPath);
    
    // Close current connections
    await this.db.close();
    
    // Replace database file
    await fs.copyFile(dbPath, this.config.dbPath);
    
    // Reopen connections
    await this.db.open();
    
    // Run integrity check
    await this.db.run('PRAGMA integrity_check');
  }
}
```

## Deployment Architecture

### Desktop Application (Electron)

```javascript
// electron/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

class DesktopApp {
  constructor() {
    this.mainWindow = null;
    this.apiProcess = null;
  }

  async init() {
    await app.whenReady();
    
    // Start backend API
    await this.startAPI();
    
    // Create window
    this.createWindow();
    
    // Setup IPC handlers
    this.setupIPC();
  }

  async startAPI() {
    const apiPath = path.join(__dirname, '../src/index.js');
    
    this.apiProcess = spawn('node', [apiPath], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: '3001',
        DATABASE_PATH: path.join(app.getPath('userData'), 'analysis.db')
      }
    });
    
    // Wait for API to be ready
    await this.waitForAPI();
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true
      }
    });
    
    this.mainWindow.loadFile('web/index.html');
  }

  setupIPC() {
    // Handle API calls from renderer
    ipcMain.handle('api:call', async (event, method, path, data) => {
      return this.callAPI(method, path, data);
    });
    
    // Handle file operations
    ipcMain.handle('file:save', async (event, data, filename) => {
      return this.saveFile(data, filename);
    });
  }
}
```

### Web Deployment (Docker)

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build frontend
RUN npm run build:web

# Production image
FROM node:20-alpine

WORKDIR /app

# Install dumb-init
RUN apk add --no-cache dumb-init

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/migrations ./migrations

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
```

### Auto-Update Mechanism

```javascript
// electron/updater.js
const { autoUpdater } = require('electron-updater');

class AutoUpdater {
  constructor(app) {
    this.app = app;
    
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    
    this.setupEvents();
  }

  setupEvents() {
    autoUpdater.on('update-available', (info) => {
      this.notifyUpdateAvailable(info);
    });
    
    autoUpdater.on('update-downloaded', (info) => {
      this.notifyUpdateReady(info);
    });
    
    autoUpdater.on('error', (error) => {
      this.handleError(error);
    });
  }

  async checkForUpdates() {
    if (process.env.NODE_ENV === 'development') return;
    
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error('Update check failed:', error);
    }
  }

  async downloadUpdate() {
    await autoUpdater.downloadUpdate();
  }

  quitAndInstall() {
    autoUpdater.quitAndInstall();
  }
}
```

## Performance Optimizations

### Database Query Optimization

```javascript
// Use prepared statements
class OptimizedRepository {
  constructor(db) {
    this.db = db;
    this.statements = {};
  }

  prepare(name, sql) {
    if (!this.statements[name]) {
      this.statements[name] = this.db.prepare(sql);
    }
    return this.statements[name];
  }

  getTransfersBatch(addresses, limit = 1000) {
    const stmt = this.prepare('getTransfersBatch', `
      SELECT * FROM transfers
      WHERE from_address IN (${addresses.map(() => '?').join(',')})
         OR to_address IN (${addresses.map(() => '?').join(',')})
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    
    return stmt.all(...addresses, ...addresses, limit);
  }
}
```

### Caching Strategy

```javascript
// Multi-layer cache
class CacheManager {
  constructor() {
    this.memory = new Map();
    this.maxMemorySize = 100 * 1024 * 1024; // 100MB
    this.currentSize = 0;
  }

  async get(key) {
    // L1: Memory cache
    const memoryHit = this.memory.get(key);
    if (memoryHit && Date.now() - memoryHit.timestamp < memoryHit.ttl) {
      return memoryHit.value;
    }
    
    return null;
  }

  async set(key, value, ttl = 300000) {
    const size = this.estimateSize(value);
    
    // Evict if necessary
    while (this.currentSize + size > this.maxMemorySize && this.memory.size > 0) {
      const firstKey = this.memory.keys().next().value;
      const evicted = this.memory.get(firstKey);
      this.currentSize -= this.estimateSize(evicted.value);
      this.memory.delete(firstKey);
    }
    
    this.memory.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
    
    this.currentSize += size;
  }

  estimateSize(obj) {
    return JSON.stringify(obj).length * 2; // Rough estimate
  }
}
```

### Connection Pooling

```javascript
// WebSocket connection pool
class WebSocketPool {
  constructor(maxConnections = 10) {
    this.connections = [];
    this.available = [];
    this.maxConnections = maxConnections;
  }

  async getConnection() {
    if (this.available.length > 0) {
      return this.available.pop();
    }
    
    if (this.connections.length < this.maxConnections) {
      const conn = await this.createConnection();
      this.connections.push(conn);
      return conn;
    }
    
    // Wait for available connection
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.available.length > 0) {
          clearInterval(checkInterval);
          resolve(this.available.pop());
        }
      }, 100);
    });
  }

  releaseConnection(conn) {
    if (conn.isHealthy()) {
      this.available.push(conn);
    } else {
      this.removeConnection(conn);
      this.createConnection().then(newConn => {
        this.connections.push(newConn);
        this.available.push(newConn);
      });
    }
  }
}
```

## Monitoring and Observability

### Metrics Collection

```javascript
// src/utils/metrics.js
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export class MetricsCollector {
  constructor() {
    this.registry = new Registry();
    
    // Define metrics
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry]
    });
    
    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation'],
      registers: [this.registry]
    });
    
    this.activeConnections = new Gauge({
      name: 'websocket_active_connections',
      help: 'Number of active WebSocket connections',
      registers: [this.registry]
    });
  }

  middleware() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        this.httpRequestDuration
          .labels(req.method, req.route?.path || 'unknown', res.statusCode)
          .observe(duration);
      });
      
      next();
    };
  }

  async getMetrics() {
    return this.registry.metrics();
  }
}
```

### Health Checks

```javascript
// src/api/routes/health.js
export class HealthController {
  constructor(services) {
    this.services = services;
  }

  async check(req, res) {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkBlockchain(),
      this.checkCache(),
      this.checkDiskSpace()
    ]);
    
    const results = {
      status: checks.every(c => c.status === 'fulfilled') ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: this.formatCheck(checks[0]),
        blockchain: this.formatCheck(checks[1]),
        cache: this.formatCheck(checks[2]),
        disk: this.formatCheck(checks[3])
      }
    };
    
    const statusCode = results.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(results);
  }

  async checkDatabase() {
    const start = Date.now();
    await this.services.db.get('SELECT 1');
    return { latency: Date.now() - start };
  }

  async checkBlockchain() {
    const connected = await this.services.blockchain.isConnected();
    const latestBlock = await this.services.blockchain.getLatestBlock();
    return { connected, latestBlock };
  }
}
```

## Security Considerations

### Input Validation

```javascript
// src/api/middleware/validation.js
import { z } from 'zod';

export const schemas = {
  address: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{47,48}$/),
  
  graphOptions: z.object({
    depth: z.number().int().min(1).max(5).optional(),
    minVolume: z.string().regex(/^\d+$/).optional(),
    timeRange: z.enum(['all', 'year', 'month', 'week']).optional()
  }),
  
  searchQuery: z.object({
    q: z.string().min(3).max(100),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional()
  })
};

export function validate(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body || req.query || req.params);
      req.validated = validated;
      next();
    } catch (error) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
  };
}
```

### Rate Limiting

```javascript
// src/api/middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';

export const rateLimiters = {
  api: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: 'Too many requests',
    standardHeaders: true,
    legacyHeaders: false
  }),
  
  search: rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => req.ip + ':search'
  }),
  
  export: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    keyGenerator: (req) => req.ip + ':export'
  })
};
```

This architecture provides a solid foundation for building a scalable, maintainable, and performant blockchain analysis tool.