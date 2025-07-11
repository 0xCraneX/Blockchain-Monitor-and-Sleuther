# Security & Performance Guide

## Overview

This guide provides comprehensive security hardening and performance optimization strategies for the Polkadot Analysis Tool, based on lessons learned from FollowTheDot and industry best practices.

## Security Architecture

### 1. Input Validation & Sanitization

#### Address Validation
```javascript
// src/security/validators.js
import { z } from 'zod';
import { decodeAddress, encodeAddress, isAddress } from '@polkadot/util-crypto';

export class SecurityValidator {
  // Polkadot SS58 address validation
  static addressSchema = z.string().refine(
    (address) => {
      try {
        // Verify it's a valid SS58 address
        if (!isAddress(address)) return false;
        
        // Decode and re-encode to normalize
        const decoded = decodeAddress(address);
        const reencoded = encodeAddress(decoded);
        
        // Additional checks
        if (address.length < 47 || address.length > 48) return false;
        if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) return false;
        
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid Polkadot address format' }
  );
  
  // Sanitize search queries
  static sanitizeSearchQuery(query) {
    // Remove SQL injection attempts
    const dangerous = /['";\\]/g;
    let sanitized = query.replace(dangerous, '');
    
    // Limit length
    sanitized = sanitized.substring(0, 100);
    
    // Remove multiple spaces
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    // Escape special characters for LIKE queries
    sanitized = sanitized.replace(/[%_]/g, '\\$&');
    
    return sanitized;
  }
  
  // Validate numeric parameters
  static validateNumericParam(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const num = parseInt(value);
    
    if (isNaN(num)) {
      throw new Error('Invalid numeric parameter');
    }
    
    if (num < min || num > max) {
      throw new Error(`Value must be between ${min} and ${max}`);
    }
    
    return num;
  }
  
  // Validate BigInt amounts
  static validateAmount(amount) {
    try {
      const bigIntAmount = BigInt(amount);
      
      if (bigIntAmount < 0n) {
        throw new Error('Amount cannot be negative');
      }
      
      // Max supply check (customize per chain)
      const maxSupply = BigInt('10000000000000000000'); // 10 billion with 10 decimals
      if (bigIntAmount > maxSupply) {
        throw new Error('Amount exceeds maximum supply');
      }
      
      return bigIntAmount.toString();
    } catch (error) {
      throw new Error('Invalid amount format');
    }
  }
}
```

#### Request Validation Middleware
```javascript
// src/api/middleware/validation.js
export function createValidationMiddleware(schema) {
  return async (req, res, next) => {
    try {
      // Combine all request data
      const data = {
        ...req.params,
        ...req.query,
        ...req.body
      };
      
      // Validate against schema
      const validated = await schema.parseAsync(data);
      
      // Attach validated data
      req.validated = validated;
      
      next();
    } catch (error) {
      // Log validation errors
      logger.warn('Validation failed', {
        path: req.path,
        errors: error.errors,
        ip: req.ip
      });
      
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
  };
}

// Example usage
router.get('/api/address/:address/graph',
  createValidationMiddleware(z.object({
    address: SecurityValidator.addressSchema,
    depth: z.number().int().min(1).max(5).optional(),
    minVolume: z.string().regex(/^\d+$/).optional()
  })),
  graphController.getGraph
);
```

### 2. SQL Injection Prevention

```javascript
// src/security/database.js
export class SecureDatabase {
  constructor(db) {
    this.db = db;
    this.statements = new Map();
  }
  
  // Use parameterized queries exclusively
  prepare(name, sql) {
    if (!this.statements.has(name)) {
      this.statements.set(name, this.db.prepare(sql));
    }
    return this.statements.get(name);
  }
  
  // Safe account search
  async searchAccounts(query, limit = 50) {
    const sanitized = SecurityValidator.sanitizeSearchQuery(query);
    
    // Use parameterized query with ESCAPE clause
    const stmt = this.prepare('searchAccounts', `
      SELECT 
        a.address,
        a.display_name,
        a.is_verified,
        ast.risk_score
      FROM accounts a
      LEFT JOIN account_stats ast ON a.address = ast.address
      WHERE 
        a.address LIKE ? ESCAPE '\\'
        OR a.display_name LIKE ? ESCAPE '\\'
      ORDER BY 
        CASE 
          WHEN a.address = ? THEN 1
          WHEN a.address LIKE ? ESCAPE '\\' THEN 2
          ELSE 3
        END
      LIMIT ?
    `);
    
    const pattern = `%${sanitized}%`;
    const prefixPattern = `${sanitized}%`;
    
    return stmt.all(pattern, pattern, sanitized, prefixPattern, limit);
  }
  
  // Prevent dynamic query construction
  async getTransfers(filters) {
    // Build query safely
    const conditions = [];
    const params = [];
    
    // Validate and add conditions
    if (filters.fromAddress) {
      SecurityValidator.addressSchema.parse(filters.fromAddress);
      conditions.push('from_address = ?');
      params.push(filters.fromAddress);
    }
    
    if (filters.toAddress) {
      SecurityValidator.addressSchema.parse(filters.toAddress);
      conditions.push('to_address = ?');
      params.push(filters.toAddress);
    }
    
    if (filters.minAmount) {
      const amount = SecurityValidator.validateAmount(filters.minAmount);
      conditions.push('CAST(amount AS INTEGER) >= ?');
      params.push(amount);
    }
    
    // Build safe query
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    
    const stmt = this.db.prepare(`
      SELECT * FROM transfers
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    
    return stmt.all(...params, filters.limit || 100);
  }
  
  // Batch operations with transaction safety
  async batchInsert(table, records) {
    if (!records || records.length === 0) return;
    
    // Validate table name against whitelist
    const allowedTables = ['accounts', 'transfers', 'patterns'];
    if (!allowedTables.includes(table)) {
      throw new Error('Invalid table name');
    }
    
    // Get column names from first record
    const columns = Object.keys(records[0]);
    const placeholders = columns.map(() => '?').join(', ');
    
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders})
    `);
    
    const transaction = this.db.transaction((records) => {
      for (const record of records) {
        stmt.run(...columns.map(col => record[col]));
      }
    });
    
    transaction(records);
  }
}
```

### 3. API Security

#### Rate Limiting
```javascript
// src/api/middleware/rateLimiter.js
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';

export class RateLimitManager {
  constructor(redisClient = null) {
    // Use Redis if available, otherwise memory
    const options = {
      keyPrefix: 'rl:',
      points: 100, // Number of requests
      duration: 60, // Per 60 seconds
      blockDuration: 60 * 10 // Block for 10 minutes
    };
    
    this.limiter = redisClient
      ? new RateLimiterRedis({ storeClient: redisClient, ...options })
      : new RateLimiterMemory(options);
    
    // Different limits for different endpoints
    this.limiters = {
      search: this.createLimiter({ points: 30, duration: 60 }),
      graph: this.createLimiter({ points: 20, duration: 60 }),
      export: this.createLimiter({ points: 5, duration: 3600 }),
      api: this.limiter
    };
  }
  
  createLimiter(options) {
    return this.redisClient
      ? new RateLimiterRedis({ storeClient: this.redisClient, ...options })
      : new RateLimiterMemory(options);
  }
  
  middleware(limiterName = 'api') {
    const limiter = this.limiters[limiterName] || this.limiter;
    
    return async (req, res, next) => {
      try {
        // Use IP + User ID if authenticated
        const key = req.user ? `${req.ip}:${req.user.id}` : req.ip;
        
        await limiter.consume(key);
        
        // Add rate limit headers
        res.set({
          'X-RateLimit-Limit': limiter.points,
          'X-RateLimit-Remaining': limiter.remainingPoints || 0,
          'X-RateLimit-Reset': new Date(Date.now() + limiter.msBeforeNext).toISOString()
        });
        
        next();
      } catch (rejRes) {
        // Too many requests
        res.set({
          'X-RateLimit-Limit': limiter.points,
          'X-RateLimit-Remaining': rejRes.remainingPoints || 0,
          'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext).toISOString(),
          'Retry-After': Math.round(rejRes.msBeforeNext / 1000) || 60
        });
        
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.round(rejRes.msBeforeNext / 1000)
        });
      }
    };
  }
}
```

#### CORS Configuration
```javascript
// src/api/middleware/cors.js
import cors from 'cors';

export function configureCORS(env = 'production') {
  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = env === 'production'
        ? [
            'https://app.yourdomain.com',
            'https://yourdomain.com'
          ]
        : [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3000'
          ];
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400 // 24 hours
  };
  
  return cors(corsOptions);
}
```

#### Authentication & Authorization
```javascript
// src/api/middleware/auth.js
import jwt from 'jsonwebtoken';

export class AuthMiddleware {
  constructor(config) {
    this.config = config;
  }
  
  // API Key authentication
  apiKey() {
    return (req, res, next) => {
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      
      if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
      }
      
      // Validate API key (implement your validation logic)
      const isValid = this.validateApiKey(apiKey);
      
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      
      // Attach key info to request
      req.apiKey = apiKey;
      next();
    };
  }
  
  // JWT authentication
  jwt() {
    return (req, res, next) => {
      const token = this.extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }
      
      try {
        const decoded = jwt.verify(token, this.config.jwtSecret);
        req.user = decoded;
        next();
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(401).json({ error: 'Invalid token' });
      }
    };
  }
  
  extractToken(req) {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    // Check cookie
    if (req.cookies && req.cookies.token) {
      return req.cookies.token;
    }
    
    return null;
  }
  
  // Role-based access control
  requireRole(roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const userRoles = req.user.roles || [];
      const hasRole = roles.some(role => userRoles.includes(role));
      
      if (!hasRole) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      
      next();
    };
  }
}
```

### 4. Security Headers

```javascript
// src/api/middleware/security.js
import helmet from 'helmet';

export function configureSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss://rpc.polkadot.io', 'https://api.subscan.io'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: { policy: 'same-origin' },
    noSniff: true,
    xssFilter: true,
    ieNoOpen: true,
    frameguard: { action: 'deny' },
    permittedCrossDomainPolicies: false
  });
}
```

## Performance Optimization

### 1. Database Optimization

#### Index Strategy
```javascript
// migrations/optimize-indexes.js
export async function up(db) {
  // Composite indexes for common queries
  await db.exec(`
    -- Optimized transfer queries
    CREATE INDEX idx_transfers_addresses_time ON transfers(
      from_address, to_address, timestamp DESC
    );
    
    -- Covering index for account searches
    CREATE INDEX idx_accounts_search_covering ON accounts(
      address, display_name, balance, is_verified
    );
    
    -- Partial index for high-value transfers
    CREATE INDEX idx_transfers_high_value ON transfers(amount)
    WHERE CAST(amount AS INTEGER) > 1000000000000;
    
    -- Index for pattern detection
    CREATE INDEX idx_transfers_time_window ON transfers(
      timestamp, from_address, to_address
    ) WHERE timestamp > strftime('%s', 'now', '-7 days');
    
    -- Function-based index for case-insensitive search
    CREATE INDEX idx_accounts_name_lower ON accounts(
      LOWER(display_name)
    ) WHERE display_name IS NOT NULL;
    
    -- Index for relationship queries
    CREATE INDEX idx_transfer_stats_volume ON transfer_stats(
      total_volume DESC, transfer_count DESC
    );
  `);
  
  // Analyze tables for query planner
  await db.exec(`
    ANALYZE accounts;
    ANALYZE transfers;
    ANALYZE transfer_stats;
  `);
}
```

#### Query Optimization
```javascript
// src/repositories/OptimizedRepository.js
export class OptimizedRepository {
  constructor(db) {
    this.db = db;
    this.statements = new Map();
  }
  
  // Use prepared statements for performance
  prepare(key, sql) {
    if (!this.statements.has(key)) {
      this.statements.set(key, this.db.prepare(sql));
    }
    return this.statements.get(key);
  }
  
  // Optimized graph query using CTEs
  async getGraphData(centerAddress, depth = 2, limit = 100) {
    const stmt = this.prepare('getGraphData', `
      WITH RECURSIVE 
      graph_nodes AS (
        -- Base case: center node
        SELECT 
          ? as address,
          0 as depth,
          0 as path_id
        
        UNION ALL
        
        -- Recursive case: connected nodes
        SELECT DISTINCT
          CASE 
            WHEN ts.from_address = gn.address THEN ts.to_address
            ELSE ts.from_address
          END as address,
          gn.depth + 1,
          gn.path_id * 1000 + ROW_NUMBER() OVER (PARTITION BY gn.address ORDER BY ts.total_volume DESC)
        FROM graph_nodes gn
        JOIN transfer_stats ts ON (
          ts.from_address = gn.address OR 
          ts.to_address = gn.address
        )
        WHERE gn.depth < ?
      ),
      limited_nodes AS (
        SELECT DISTINCT address, MIN(depth) as depth
        FROM graph_nodes
        GROUP BY address
        ORDER BY depth, address
        LIMIT ?
      )
      SELECT 
        ln.address,
        ln.depth,
        a.display_name,
        a.balance,
        ast.risk_score,
        ast.total_sent,
        ast.total_received
      FROM limited_nodes ln
      JOIN accounts a ON ln.address = a.address
      LEFT JOIN account_stats ast ON ln.address = ast.address
    `);
    
    return stmt.all(centerAddress, depth, limit);
  }
  
  // Batch operations for efficiency
  async batchGetAccounts(addresses) {
    if (addresses.length === 0) return [];
    
    // Use IN clause with proper number of placeholders
    const placeholders = addresses.map(() => '?').join(',');
    const stmt = this.prepare(`batchGet${addresses.length}`, `
      SELECT 
        a.*,
        ast.risk_score,
        ast.total_sent,
        ast.total_received
      FROM accounts a
      LEFT JOIN account_stats ast ON a.address = ast.address
      WHERE a.address IN (${placeholders})
    `);
    
    return stmt.all(...addresses);
  }
}
```

### 2. Caching Strategy

#### Multi-Layer Cache
```javascript
// src/services/cache/CacheManager.js
import LRU from 'lru-cache';
import { createHash } from 'crypto';

export class CacheManager {
  constructor(options = {}) {
    // L1: In-memory cache
    this.memoryCache = new LRU({
      max: options.maxMemoryItems || 10000,
      ttl: options.memoryTTL || 5 * 60 * 1000, // 5 minutes
      updateAgeOnGet: true,
      updateAgeOnHas: false
    });
    
    // L2: Redis cache (optional)
    this.redisClient = options.redisClient;
    
    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      redisHits: 0
    };
  }
  
  generateKey(type, params) {
    const hash = createHash('sha256')
      .update(JSON.stringify({ type, params }))
      .digest('hex');
    return `${type}:${hash}`;
  }
  
  async get(type, params) {
    const key = this.generateKey(type, params);
    
    // L1: Check memory cache
    const memoryResult = this.memoryCache.get(key);
    if (memoryResult !== undefined) {
      this.stats.hits++;
      this.stats.memoryHits++;
      return memoryResult;
    }
    
    // L2: Check Redis cache
    if (this.redisClient) {
      try {
        const redisResult = await this.redisClient.get(key);
        if (redisResult) {
          const parsed = JSON.parse(redisResult);
          
          // Populate memory cache
          this.memoryCache.set(key, parsed);
          
          this.stats.hits++;
          this.stats.redisHits++;
          return parsed;
        }
      } catch (error) {
        console.error('Redis cache error:', error);
      }
    }
    
    this.stats.misses++;
    return null;
  }
  
  async set(type, params, value, ttl) {
    const key = this.generateKey(type, params);
    
    // L1: Set in memory cache
    this.memoryCache.set(key, value);
    
    // L2: Set in Redis cache
    if (this.redisClient) {
      try {
        const serialized = JSON.stringify(value);
        await this.redisClient.setex(
          key,
          ttl || 3600, // 1 hour default
          serialized
        );
      } catch (error) {
        console.error('Redis cache set error:', error);
      }
    }
  }
  
  // Invalidate related cache entries
  async invalidatePattern(pattern) {
    // Clear memory cache entries matching pattern
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }
    
    // Clear Redis entries
    if (this.redisClient) {
      const keys = await this.redisClient.keys(`*${pattern}*`);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    }
  }
  
  getStats() {
    const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0;
    return {
      ...this.stats,
      hitRate: (hitRate * 100).toFixed(2) + '%',
      memoryCacheSize: this.memoryCache.size
    };
  }
}
```

### 3. Connection Pooling

```javascript
// src/services/blockchain/ConnectionPool.js
export class BlockchainConnectionPool {
  constructor(options = {}) {
    this.maxConnections = options.maxConnections || 5;
    this.connections = [];
    this.available = [];
    this.waiting = [];
    this.connectionTimeout = options.connectionTimeout || 30000;
  }
  
  async initialize(endpoints) {
    // Create connections to different endpoints
    for (let i = 0; i < this.maxConnections; i++) {
      const endpoint = endpoints[i % endpoints.length];
      const connection = await this.createConnection(endpoint);
      this.connections.push(connection);
      this.available.push(connection);
    }
    
    // Health check interval
    setInterval(() => this.healthCheck(), 60000);
  }
  
  async getConnection() {
    // Return available connection
    if (this.available.length > 0) {
      const connection = this.available.pop();
      connection.lastUsed = Date.now();
      return connection;
    }
    
    // Wait for connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waiting.indexOf(resolver);
        if (index > -1) {
          this.waiting.splice(index, 1);
        }
        reject(new Error('Connection timeout'));
      }, this.connectionTimeout);
      
      const resolver = (connection) => {
        clearTimeout(timeout);
        resolve(connection);
      };
      
      this.waiting.push(resolver);
    });
  }
  
  releaseConnection(connection) {
    if (!connection.isHealthy()) {
      this.replaceConnection(connection);
      return;
    }
    
    // Give to waiting request or return to pool
    if (this.waiting.length > 0) {
      const resolver = this.waiting.shift();
      resolver(connection);
    } else {
      this.available.push(connection);
    }
  }
  
  async healthCheck() {
    for (const connection of this.connections) {
      if (!connection.isHealthy()) {
        await this.replaceConnection(connection);
      }
    }
  }
  
  async replaceConnection(unhealthyConnection) {
    const index = this.connections.indexOf(unhealthyConnection);
    if (index === -1) return;
    
    try {
      const newConnection = await this.createConnection(unhealthyConnection.endpoint);
      this.connections[index] = newConnection;
      
      const availableIndex = this.available.indexOf(unhealthyConnection);
      if (availableIndex > -1) {
        this.available[availableIndex] = newConnection;
      }
    } catch (error) {
      console.error('Failed to replace connection:', error);
    }
  }
}
```

### 4. Memory Management

```javascript
// src/utils/memoryManager.js
import v8 from 'v8';
import { performance } from 'perf_hooks';

export class MemoryManager {
  constructor(options = {}) {
    this.maxHeapSize = options.maxHeapSize || 1024 * 1024 * 1024; // 1GB
    this.gcThreshold = options.gcThreshold || 0.8; // 80%
    this.checkInterval = options.checkInterval || 60000; // 1 minute
    
    this.startMonitoring();
  }
  
  startMonitoring() {
    setInterval(() => this.checkMemory(), this.checkInterval);
    
    // Monitor event loop lag
    let lastCheck = performance.now();
    setInterval(() => {
      const now = performance.now();
      const lag = now - lastCheck - 100; // Expected 100ms interval
      
      if (lag > 50) {
        console.warn(`Event loop lag detected: ${lag.toFixed(2)}ms`);
      }
      
      lastCheck = now;
    }, 100);
  }
  
  checkMemory() {
    const heap = v8.getHeapStatistics();
    const usage = heap.used_heap_size / heap.heap_size_limit;
    
    if (usage > this.gcThreshold) {
      console.log('High memory usage detected, triggering GC');
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Clear caches if still high
      const newHeap = v8.getHeapStatistics();
      const newUsage = newHeap.used_heap_size / newHeap.heap_size_limit;
      
      if (newUsage > this.gcThreshold) {
        this.clearCaches();
      }
    }
    
    // Log memory metrics
    this.logMetrics({
      heapUsed: heap.used_heap_size,
      heapTotal: heap.total_heap_size,
      external: heap.external_memory,
      usage: (usage * 100).toFixed(2) + '%'
    });
  }
  
  clearCaches() {
    // Emit event for services to clear their caches
    process.emit('memory:pressure');
  }
  
  logMetrics(metrics) {
    // Log to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Send to monitoring service
    }
  }
  
  // Stream processing for large datasets
  createTransformStream(transformFn, options = {}) {
    const { Transform } = require('stream');
    
    return new Transform({
      objectMode: true,
      highWaterMark: options.highWaterMark || 100,
      transform: async function(chunk, encoding, callback) {
        try {
          const result = await transformFn(chunk);
          callback(null, result);
        } catch (error) {
          callback(error);
        }
      }
    });
  }
}
```

### 5. Query Performance Monitoring

```javascript
// src/monitoring/queryMonitor.js
export class QueryMonitor {
  constructor(db, options = {}) {
    this.db = db;
    this.slowQueryThreshold = options.slowQueryThreshold || 100; // 100ms
    this.queries = new Map();
    
    this.wrapDatabase();
  }
  
  wrapDatabase() {
    const originalPrepare = this.db.prepare.bind(this.db);
    
    this.db.prepare = (sql) => {
      const statement = originalPrepare(sql);
      
      // Wrap statement methods
      const originalAll = statement.all.bind(statement);
      const originalGet = statement.get.bind(statement);
      const originalRun = statement.run.bind(statement);
      
      statement.all = (...args) => {
        return this.measureQuery(sql, 'all', () => originalAll(...args));
      };
      
      statement.get = (...args) => {
        return this.measureQuery(sql, 'get', () => originalGet(...args));
      };
      
      statement.run = (...args) => {
        return this.measureQuery(sql, 'run', () => originalRun(...args));
      };
      
      return statement;
    };
  }
  
  measureQuery(sql, method, fn) {
    const start = performance.now();
    
    try {
      const result = fn();
      const duration = performance.now() - start;
      
      this.recordQuery(sql, method, duration, true);
      
      if (duration > this.slowQueryThreshold) {
        this.logSlowQuery(sql, duration);
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordQuery(sql, method, duration, false);
      throw error;
    }
  }
  
  recordQuery(sql, method, duration, success) {
    const key = `${method}:${sql.substring(0, 50)}`;
    
    if (!this.queries.has(key)) {
      this.queries.set(key, {
        sql,
        method,
        count: 0,
        totalTime: 0,
        avgTime: 0,
        maxTime: 0,
        errors: 0
      });
    }
    
    const stats = this.queries.get(key);
    stats.count++;
    stats.totalTime += duration;
    stats.avgTime = stats.totalTime / stats.count;
    stats.maxTime = Math.max(stats.maxTime, duration);
    
    if (!success) {
      stats.errors++;
    }
  }
  
  logSlowQuery(sql, duration) {
    console.warn('Slow query detected:', {
      sql: sql.substring(0, 100),
      duration: `${duration.toFixed(2)}ms`,
      threshold: `${this.slowQueryThreshold}ms`
    });
    
    // Analyze query plan
    try {
      const plan = this.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
      console.log('Query plan:', plan);
    } catch (error) {
      // Ignore explain errors
    }
  }
  
  getSlowQueries(limit = 10) {
    return Array.from(this.queries.values())
      .filter(q => q.avgTime > this.slowQueryThreshold)
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, limit);
  }
  
  getReport() {
    const queries = Array.from(this.queries.values());
    
    return {
      totalQueries: queries.reduce((sum, q) => sum + q.count, 0),
      uniqueQueries: queries.length,
      totalTime: queries.reduce((sum, q) => sum + q.totalTime, 0),
      slowQueries: this.getSlowQueries(),
      errorRate: queries.reduce((sum, q) => sum + q.errors, 0) / 
                 queries.reduce((sum, q) => sum + q.count, 0)
    };
  }
}
```

## Security Best Practices Checklist

### Development
- [ ] Use parameterized queries exclusively
- [ ] Validate all user inputs
- [ ] Implement proper error handling (no stack traces in production)
- [ ] Use security headers (CSP, HSTS, etc.)
- [ ] Keep dependencies updated
- [ ] Run security audits regularly

### API Security
- [ ] Implement rate limiting
- [ ] Use HTTPS only
- [ ] Add authentication/authorization
- [ ] Configure CORS properly
- [ ] Log security events
- [ ] Implement request signing for sensitive operations

### Database Security
- [ ] Use least privilege principle
- [ ] Encrypt sensitive data
- [ ] Regular backups with encryption
- [ ] Monitor for suspicious queries
- [ ] Implement query timeouts

### Infrastructure
- [ ] Use environment variables for secrets
- [ ] Implement proper logging
- [ ] Set up monitoring and alerting
- [ ] Regular security updates
- [ ] Implement DDoS protection
- [ ] Use Web Application Firewall (WAF)

## Performance Optimization Checklist

### Database
- [ ] Create appropriate indexes
- [ ] Use prepared statements
- [ ] Implement connection pooling
- [ ] Regular VACUUM and ANALYZE
- [ ] Monitor slow queries
- [ ] Implement query result caching

### Application
- [ ] Implement multi-layer caching
- [ ] Use async/await properly
- [ ] Implement request batching
- [ ] Monitor memory usage
- [ ] Use streaming for large datasets
- [ ] Implement pagination

### API
- [ ] Enable response compression
- [ ] Implement ETag caching
- [ ] Use CDN for static assets
- [ ] Implement request coalescing
- [ ] Monitor response times
- [ ] Set appropriate cache headers

This guide provides comprehensive security and performance optimizations to ensure the Polkadot Analysis Tool is both secure and performant in production environments.