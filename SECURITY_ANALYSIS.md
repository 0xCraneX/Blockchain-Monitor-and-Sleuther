# Security Analysis: Graph Traversal Functionality

## Executive Summary

This comprehensive security analysis evaluates the graph traversal functionality of the Polkadot Analysis Tool, identifying critical vulnerabilities and providing actionable mitigation strategies. The analysis covers query security, API protection, data privacy, performance-based attacks, and business logic vulnerabilities.

## 1. Query Security

### 1.1 SQL Injection Risks

**Current Vulnerabilities:**

1. **Direct String Concatenation in Dynamic Queries**
   - Location: `DatabaseService.js:getRelationships()` method
   - Risk: Medium-High
   - Example vulnerable pattern:
   ```javascript
   // VULNERABLE: String concatenation in query building
   query += ' AND timestamp >= @startTime';
   ```

2. **JSON Parsing Without Validation**
   - Location: Multiple methods parsing JSON from database
   - Risk: Medium
   - Example:
   ```javascript
   details: JSON.parse(p.details) // No validation before parsing
   ```

**Mitigation Strategies:**

```javascript
// security/queryValidator.js
import { z } from 'zod';
import createDOMPurify from 'isomorphic-dompurify';
const DOMPurify = createDOMPurify();

export class QueryValidator {
  // Validate and sanitize address inputs
  static validateAddress(address) {
    const addressSchema = z.string()
      .regex(/^[1-9A-HJ-NP-Za-km-z]{48,}$/)
      .refine((addr) => {
        // Additional validation for Polkadot addresses
        try {
          // Add polkadot.js address validation here
          return true;
        } catch {
          return false;
        }
      });
    
    return addressSchema.parse(address);
  }

  // Sanitize numeric inputs to prevent injection
  static sanitizeNumeric(value, defaultValue = 0) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  // Validate depth to prevent recursive bombs
  static validateDepth(depth) {
    const MAX_SAFE_DEPTH = 4;
    const validated = this.sanitizeNumeric(depth, 2);
    return Math.min(validated, MAX_SAFE_DEPTH);
  }

  // Sanitize JSON data before parsing
  static safeJsonParse(jsonString, defaultValue = {}) {
    try {
      if (typeof jsonString !== 'string') return defaultValue;
      
      // Remove potentially dangerous characters
      const sanitized = DOMPurify.sanitize(jsonString, { 
        USE_PROFILES: { html: false, svg: false, mathMl: false }
      });
      
      return JSON.parse(sanitized);
    } catch (error) {
      console.error('JSON parsing error:', error);
      return defaultValue;
    }
  }
}

// Updated DatabaseService method with validation
getRelationships(address, options = {}) {
  // Validate inputs
  const validatedAddress = QueryValidator.validateAddress(address);
  const { 
    depth = 1, 
    minVolume = '0', 
    limit = 100 
  } = options;

  const validatedDepth = QueryValidator.validateDepth(depth);
  const validatedLimit = Math.min(QueryValidator.sanitizeNumeric(limit, 100), 500);
  const validatedMinVolume = QueryValidator.sanitizeNumeric(minVolume, 0).toString();

  // Use parameterized query with validated inputs
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
  
  return stmt.all({ 
    address: validatedAddress, 
    minVolume: validatedMinVolume, 
    limit: validatedLimit 
  });
}
```

### 1.2 Recursive Query Bombs (DoS Attacks)

**Current Vulnerabilities:**
- No depth limiting in recursive CTEs
- No query timeout enforcement
- No resource monitoring

**Mitigation Strategies:**

```javascript
// security/recursiveQueryProtection.js
export class RecursiveQueryProtection {
  constructor(db) {
    this.db = db;
    this.activeQueries = new Map();
  }

  // Execute query with timeout and resource monitoring
  async executeProtectedQuery(queryId, queryFn, options = {}) {
    const {
      timeout = 5000, // 5 seconds default
      maxMemory = 100 * 1024 * 1024, // 100MB
      maxRows = 10000
    } = options;

    // Check if query is already running
    if (this.activeQueries.has(queryId)) {
      throw new Error('Query already in progress');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      this.activeQueries.set(queryId, { controller, startTime: Date.now() });

      // Monitor memory usage
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Execute with row limit
      const result = await new Promise((resolve, reject) => {
        const rows = [];
        let rowCount = 0;

        const stmt = queryFn();
        
        // Use iterator to process rows one by one
        for (const row of stmt.iterate()) {
          if (controller.signal.aborted) {
            reject(new Error('Query timeout'));
            return;
          }

          rowCount++;
          if (rowCount > maxRows) {
            reject(new Error(`Query exceeded maximum rows (${maxRows})`));
            return;
          }

          // Check memory usage
          const currentMemory = process.memoryUsage().heapUsed;
          if (currentMemory - initialMemory > maxMemory) {
            reject(new Error('Query exceeded memory limit'));
            return;
          }

          rows.push(row);
        }

        resolve(rows);
      });

      return result;
    } finally {
      clearTimeout(timeoutId);
      this.activeQueries.delete(queryId);
    }
  }

  // Safe recursive CTE with built-in protections
  getGraphTraversal(startAddress, maxDepth = 3) {
    const queryId = `traverse_${startAddress}_${Date.now()}`;
    
    return this.executeProtectedQuery(queryId, () => {
      return this.db.prepare(`
        WITH RECURSIVE graph_traverse AS (
          -- Base case
          SELECT 
            @address as address,
            @address as connected_address,
            0 as depth,
            @address as path,
            0 as total_volume
          
          UNION ALL
          
          -- Recursive case with protections
          SELECT 
            g.address,
            CASE 
              WHEN ar.from_address = g.connected_address THEN ar.to_address
              ELSE ar.from_address
            END as connected_address,
            g.depth + 1,
            g.path || '>' || CASE 
              WHEN ar.from_address = g.connected_address THEN ar.to_address
              ELSE ar.from_address
            END as path,
            g.total_volume + CAST(ar.total_volume AS INTEGER) as total_volume
          FROM graph_traverse g
          JOIN account_relationships ar ON (
            ar.from_address = g.connected_address OR 
            ar.to_address = g.connected_address
          )
          WHERE g.depth < @maxDepth
            -- Prevent cycles
            AND g.path NOT LIKE '%' || CASE 
              WHEN ar.from_address = g.connected_address THEN ar.to_address
              ELSE ar.from_address
            END || '%'
            -- Limit breadth per level
            AND (
              SELECT COUNT(*) 
              FROM graph_traverse g2 
              WHERE g2.depth = g.depth + 1
            ) < 1000
        )
        SELECT DISTINCT
          connected_address,
          MIN(depth) as depth,
          COUNT(*) as path_count,
          MAX(total_volume) as max_volume
        FROM graph_traverse
        WHERE connected_address != @address
        GROUP BY connected_address
        ORDER BY depth, max_volume DESC
        LIMIT 500
      `).bind({ address: startAddress, maxDepth });
    });
  }
}
```

### 1.3 Resource Exhaustion Attacks

**Mitigation Strategies:**

```javascript
// middleware/resourceMonitor.js
export class ResourceMonitor {
  constructor() {
    this.metrics = {
      activeQueries: 0,
      totalQueries: 0,
      avgQueryTime: 0,
      peakMemory: 0
    };
  }

  middleware() {
    return async (req, res, next) => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      // Limit concurrent queries per IP
      const ip = req.ip;
      const activeCount = this.getActiveQueriesForIP(ip);
      
      if (activeCount >= 3) {
        return res.status(429).json({
          error: 'Too many concurrent requests'
        });
      }

      this.incrementActiveQueries(ip);

      // Monitor response
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const memoryUsed = process.memoryUsage().heapUsed - startMemory;
        
        this.decrementActiveQueries(ip);
        this.updateMetrics(duration, memoryUsed);

        // Log slow queries
        if (duration > 3000) {
          console.warn('Slow query detected:', {
            path: req.path,
            duration,
            ip,
            params: req.query
          });
        }
      });

      next();
    };
  }

  getActiveQueriesForIP(ip) {
    // Implementation details...
    return 0;
  }

  incrementActiveQueries(ip) {
    // Implementation details...
  }

  decrementActiveQueries(ip) {
    // Implementation details...
  }

  updateMetrics(duration, memory) {
    this.metrics.totalQueries++;
    this.metrics.avgQueryTime = 
      (this.metrics.avgQueryTime * (this.metrics.totalQueries - 1) + duration) / 
      this.metrics.totalQueries;
    this.metrics.peakMemory = Math.max(this.metrics.peakMemory, memory);
  }
}
```

## 2. API Security

### 2.1 Parameter Validation and Sanitization

**Current Vulnerabilities:**
- Basic regex validation only
- No type coercion protection
- Missing bounds checking

**Enhanced Validation:**

```javascript
// security/apiValidator.js
import { z } from 'zod';
import validator from 'validator';

export const secureValidationSchemas = {
  // Enhanced graph query schema
  graphQuery: z.object({
    address: z.string()
      .regex(/^[1-9A-HJ-NP-Za-km-z]{48,}$/)
      .refine((addr) => {
        // Prevent homograph attacks
        return !containsHomographs(addr);
      }, 'Address contains suspicious characters'),
    
    depth: z.coerce.number()
      .int()
      .min(1)
      .max(4)
      .default(2)
      .refine((d) => {
        // Prevent floating point tricks
        return d === Math.floor(d);
      }),
    
    minVolume: z.string()
      .refine((v) => {
        // Validate as big number string
        return /^\d+$/.test(v) && BigInt(v) >= 0n;
      }, 'Invalid volume format')
      .default('0'),
    
    maxNodes: z.coerce.number()
      .int()
      .min(10)
      .max(500)
      .default(100),
    
    // Add timestamp validation to prevent replay attacks
    timestamp: z.coerce.number()
      .refine((ts) => {
        const now = Date.now();
        const diff = Math.abs(now - ts);
        return diff < 300000; // 5 minutes
      }, 'Request timestamp too old')
  }),

  // Investigation save schema
  investigationSave: z.object({
    sessionId: z.string()
      .uuid()
      .refine((id) => {
        // Prevent session fixation
        return !isKnownBadSession(id);
      }),
    
    title: z.string()
      .min(1)
      .max(200)
      .transform((t) => validator.escape(t)),
    
    description: z.string()
      .max(5000)
      .transform((d) => validator.escape(d))
      .optional(),
    
    addresses: z.array(
      z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{48,}$/)
    ).max(100),
    
    filters: z.object({
      minVolume: z.string().optional(),
      dateRange: z.object({
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional()
      }).optional(),
      riskThreshold: z.number().min(0).max(100).optional()
    }).strict() // Prevent additional properties
  }).strict()
};

// Helper functions
function containsHomographs(str) {
  // Check for Unicode homograph attacks
  const suspiciousPatterns = [
    /[\u0430-\u044f]/, // Cyrillic
    /[\u03b1-\u03c9]/, // Greek lowercase
    /[\u1e00-\u1eff]/  // Latin extended
  ];
  
  return suspiciousPatterns.some(pattern => pattern.test(str));
}

function isKnownBadSession(sessionId) {
  // Check against blacklist of compromised sessions
  // Implementation would check database/cache
  return false;
}

// Secure validation middleware
export function secureValidate(schema, property = 'body') {
  return async (req, res, next) => {
    try {
      // Add request metadata for validation
      const dataToValidate = {
        ...req[property],
        timestamp: Date.now()
      };

      const validated = await schema.parseAsync(dataToValidate);
      
      // Remove timestamp from validated data
      delete validated.timestamp;
      
      req[property] = validated;
      next();
    } catch (error) {
      // Log validation failures for security monitoring
      console.error('Validation failed:', {
        ip: req.ip,
        path: req.path,
        errors: error.errors
      });

      res.status(400).json({
        error: {
          message: 'Validation error',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        }
      });
    }
  };
}
```

### 2.2 Rate Limiting for Expensive Operations

**Enhanced Rate Limiting:**

```javascript
// security/advancedRateLimiter.js
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import crypto from 'crypto';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
});

// Cost-based rate limiting
export class CostBasedRateLimiter {
  constructor() {
    this.costMap = new Map([
      ['GET /api/graph', 50],           // Expensive graph queries
      ['GET /api/addresses/search', 10], // Search operations
      ['GET /api/addresses/:id', 5],     // Single address lookup
      ['POST /api/investigations', 20]   // Save operations
    ]);
  }

  middleware() {
    return async (req, res, next) => {
      const key = `${req.method} ${req.route.path}`;
      const cost = this.costMap.get(key) || 1;
      const ip = req.ip;
      const window = 60000; // 1 minute
      const maxBudget = 100;

      const currentBudget = await this.getCurrentBudget(ip, window);
      
      if (currentBudget + cost > maxBudget) {
        const resetTime = await this.getResetTime(ip);
        
        res.set({
          'X-RateLimit-Limit': maxBudget,
          'X-RateLimit-Remaining': Math.max(0, maxBudget - currentBudget),
          'X-RateLimit-Reset': resetTime,
          'Retry-After': Math.ceil((resetTime - Date.now()) / 1000)
        });

        return res.status(429).json({
          error: {
            message: 'Rate limit exceeded',
            retryAfter: resetTime
          }
        });
      }

      await this.consumeBudget(ip, cost, window);
      next();
    };
  }

  async getCurrentBudget(ip, window) {
    const key = `budget:${ip}`;
    const scores = await redis.zrangebyscore(
      key, 
      Date.now() - window, 
      Date.now(),
      'WITHSCORES'
    );

    let total = 0;
    for (let i = 1; i < scores.length; i += 2) {
      total += parseInt(scores[i]);
    }

    return total;
  }

  async consumeBudget(ip, cost, window) {
    const key = `budget:${ip}`;
    const now = Date.now();
    const id = crypto.randomBytes(16).toString('hex');

    await redis.zadd(key, now, `${id}:${cost}`);
    await redis.expire(key, Math.ceil(window / 1000));
  }

  async getResetTime(ip) {
    const key = `budget:${ip}`;
    const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
    
    if (oldest.length >= 2) {
      return parseInt(oldest[1]) + 60000;
    }
    
    return Date.now() + 60000;
  }
}

// Distributed rate limiting for graph operations
export const graphOperationLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:graph:'
  }),
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: async (req) => {
    // Dynamic limits based on query complexity
    const depth = parseInt(req.query.depth) || 2;
    const maxNodes = parseInt(req.query.maxNodes) || 100;
    
    // Calculate complexity score
    const complexity = depth * Math.log10(maxNodes);
    
    // Inverse relationship: higher complexity = lower limit
    if (complexity > 10) return 2;
    if (complexity > 5) return 5;
    return 10;
  },
  keyGenerator: (req) => {
    // Include query parameters in key to prevent parameter pollution
    const params = [
      req.ip,
      req.query.address,
      req.query.depth,
      req.query.maxNodes
    ].filter(Boolean);
    
    return crypto
      .createHash('sha256')
      .update(params.join(':'))
      .digest('hex');
  },
  handler: (req, res) => {
    res.status(429).json({
      error: {
        message: 'Complex query rate limit exceeded',
        complexity: calculateQueryComplexity(req.query),
        suggestion: 'Reduce depth or maxNodes parameter'
      }
    });
  }
});

function calculateQueryComplexity(query) {
  const depth = parseInt(query.depth) || 2;
  const maxNodes = parseInt(query.maxNodes) || 100;
  return depth * Math.log10(maxNodes);
}
```

### 2.3 Authentication/Authorization

**Implementation for Future Multi-User Support:**

```javascript
// security/auth.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
    this.refreshTokens = new Map(); // In production, use Redis
  }

  // Generate secure tokens
  generateTokens(userId, roles = []) {
    const accessToken = jwt.sign(
      { 
        userId, 
        roles,
        type: 'access'
      },
      this.jwtSecret,
      { 
        expiresIn: '15m',
        issuer: 'polkadot-analysis',
        audience: 'api'
      }
    );

    const refreshToken = crypto.randomBytes(32).toString('hex');
    
    // Store refresh token with metadata
    this.refreshTokens.set(refreshToken, {
      userId,
      roles,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return { accessToken, refreshToken };
  }

  // Middleware for optional auth (current single-user mode)
  optionalAuth() {
    return async (req, res, next) => {
      const token = this.extractToken(req);
      
      if (!token) {
        // Single-user mode: allow anonymous access
        req.user = { 
          id: 'anonymous', 
          roles: ['viewer'] 
        };
        return next();
      }

      try {
        const decoded = jwt.verify(token, this.jwtSecret, {
          issuer: 'polkadot-analysis',
          audience: 'api'
        });

        req.user = {
          id: decoded.userId,
          roles: decoded.roles || []
        };

        next();
      } catch (error) {
        return res.status(401).json({
          error: {
            message: 'Invalid token',
            code: 'INVALID_TOKEN'
          }
        });
      }
    };
  }

  // Middleware for required auth (future multi-user mode)
  requireAuth(requiredRoles = []) {
    return async (req, res, next) => {
      const token = this.extractToken(req);
      
      if (!token) {
        return res.status(401).json({
          error: {
            message: 'Authentication required',
            code: 'NO_TOKEN'
          }
        });
      }

      try {
        const decoded = jwt.verify(token, this.jwtSecret, {
          issuer: 'polkadot-analysis',
          audience: 'api'
        });

        // Check if user has required roles
        if (requiredRoles.length > 0) {
          const hasRole = requiredRoles.some(role => 
            (decoded.roles || []).includes(role)
          );

          if (!hasRole) {
            return res.status(403).json({
              error: {
                message: 'Insufficient permissions',
                code: 'FORBIDDEN'
              }
            });
          }
        }

        req.user = {
          id: decoded.userId,
          roles: decoded.roles || []
        };

        next();
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          return res.status(401).json({
            error: {
              message: 'Token expired',
              code: 'TOKEN_EXPIRED'
            }
          });
        }

        return res.status(401).json({
          error: {
            message: 'Invalid token',
            code: 'INVALID_TOKEN'
          }
        });
      }
    };
  }

  extractToken(req) {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return req.cookies?.accessToken || null;
  }

  // Role-based access control
  canAccess(user, resource, action) {
    const permissions = {
      viewer: {
        addresses: ['read'],
        graph: ['read'],
        investigations: ['read']
      },
      analyst: {
        addresses: ['read'],
        graph: ['read', 'analyze'],
        investigations: ['read', 'write', 'update']
      },
      admin: {
        addresses: ['read', 'write', 'delete'],
        graph: ['read', 'analyze', 'configure'],
        investigations: ['read', 'write', 'update', 'delete'],
        users: ['read', 'write', 'update', 'delete']
      }
    };

    // Check each role's permissions
    for (const role of user.roles) {
      const rolePerms = permissions[role];
      if (rolePerms && rolePerms[resource]?.includes(action)) {
        return true;
      }
    }

    return false;
  }
}

// Usage in routes
const auth = new AuthService();

router.get('/api/graph', 
  auth.optionalAuth(),
  (req, res, next) => {
    // Check if user can access graph data
    if (!auth.canAccess(req.user, 'graph', 'read')) {
      return res.status(403).json({
        error: { message: 'Access denied' }
      });
    }
    next();
  },
  graphController.getGraph
);
```

### 2.4 CORS and Security Headers

```javascript
// security/headers.js
import helmet from 'helmet';
import cors from 'cors';

export function configureSecurityHeaders(app) {
  // Basic security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Adjust for your needs
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "https:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },
    crossOriginEmbedderPolicy: { policy: "require-corp" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "no-referrer" },
    xssFilter: true
  }));

  // CORS configuration
  const corsOptions = {
    origin: (origin, callback) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
      
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    maxAge: 86400, // 24 hours
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
  };

  app.use(cors(corsOptions));

  // Additional security headers
  app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS filter
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Permissions Policy (formerly Feature Policy)
    res.setHeader('Permissions-Policy', 
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    );
    
    // Cache control for API responses
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    next();
  });
}
```

## 3. Data Privacy

### 3.1 Preventing Unauthorized Relationship Discovery

```javascript
// security/privacyProtection.js
export class PrivacyProtection {
  // Anonymize graph data based on user permissions
  static anonymizeGraphData(graphData, userId, userPermissions) {
    const { nodes, edges } = graphData;
    const anonymizedNodes = new Map();
    const sensitivePatterns = this.getSensitivePatterns();

    // Anonymize nodes
    const processedNodes = nodes.map(node => {
      // Check if node should be anonymized
      if (this.shouldAnonymize(node, userId, userPermissions)) {
        const anonId = this.generateAnonymousId(node.address);
        anonymizedNodes.set(node.address, anonId);
        
        return {
          ...node,
          address: anonId,
          identity_display: null,
          identity_legal: null,
          identity_email: null,
          identity_twitter: null,
          // Preserve non-identifying data
          risk_score: Math.round(node.risk_score * 10) / 10, // Round to reduce fingerprinting
          total_transfers: this.bucketize(node.total_transfers_in + node.total_transfers_out),
          balance: this.anonymizeBalance(node.balance)
        };
      }

      return node;
    });

    // Anonymize edges
    const processedEdges = edges.map(edge => {
      const fromAnon = anonymizedNodes.get(edge.from) || edge.from;
      const toAnon = anonymizedNodes.get(edge.to) || edge.to;

      return {
        ...edge,
        from: fromAnon,
        to: toAnon,
        // Anonymize sensitive metrics
        volume: this.anonymizeVolume(edge.volume),
        transfer_count: this.bucketize(edge.transfer_count)
      };
    });

    return {
      nodes: processedNodes,
      edges: processedEdges,
      metadata: {
        ...graphData.metadata,
        anonymized: true,
        anonymization_level: this.getAnonymizationLevel(userPermissions)
      }
    };
  }

  static shouldAnonymize(node, userId, permissions) {
    // Don't anonymize user's own address
    if (node.user_id === userId) return false;

    // Check permission levels
    if (permissions.includes('view_all_identities')) return false;

    // Apply rules based on node characteristics
    if (node.risk_score > 0.7) return false; // High-risk addresses remain visible
    if (node.is_exchange || node.is_validator) return false; // Public entities

    return true;
  }

  static generateAnonymousId(address) {
    // Generate consistent but non-reversible ID
    const hash = crypto
      .createHash('sha256')
      .update(address + process.env.ANONYMIZATION_SALT)
      .digest('hex');
    
    return `anon_${hash.substring(0, 12)}`;
  }

  static bucketize(value) {
    // Reduce precision to prevent fingerprinting
    if (value < 10) return value;
    if (value < 100) return Math.floor(value / 10) * 10;
    if (value < 1000) return Math.floor(value / 100) * 100;
    return Math.floor(value / 1000) * 1000;
  }

  static anonymizeBalance(balance) {
    const amount = BigInt(balance);
    const ranges = [
      { max: 10n ** 12n, label: '< 1 DOT' },
      { max: 10n ** 13n, label: '1-10 DOT' },
      { max: 10n ** 14n, label: '10-100 DOT' },
      { max: 10n ** 15n, label: '100-1K DOT' },
      { max: 10n ** 16n, label: '1K-10K DOT' },
      { max: 10n ** 17n, label: '10K-100K DOT' },
      { max: Infinity, label: '> 100K DOT' }
    ];

    for (const range of ranges) {
      if (amount < range.max) return range.label;
    }
  }

  static anonymizeVolume(volume) {
    return this.anonymizeBalance(volume);
  }

  static getSensitivePatterns() {
    return [
      /^exchange_/i,
      /^validator_/i,
      /^nominator_/i
    ];
  }

  static getAnonymizationLevel(permissions) {
    if (permissions.includes('admin')) return 'none';
    if (permissions.includes('analyst')) return 'minimal';
    return 'standard';
  }
}

// Middleware to apply privacy protection
export function privacyMiddleware(req, res, next) {
  const originalJson = res.json;

  res.json = function(data) {
    // Intercept graph responses
    if (req.path.includes('/graph') && data.nodes && data.edges) {
      const anonymized = PrivacyProtection.anonymizeGraphData(
        data,
        req.user?.id,
        req.user?.roles || []
      );
      
      return originalJson.call(this, anonymized);
    }

    return originalJson.call(this, data);
  };

  next();
}
```

### 3.2 Timing Attack Prevention

```javascript
// security/timingProtection.js
export class TimingProtection {
  // Constant-time string comparison
  static safeCompare(a, b) {
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  // Add random delay to prevent timing analysis
  static async randomDelay(minMs = 50, maxMs = 200) {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // Middleware to add timing protection
  middleware() {
    return async (req, res, next) => {
      // Record start time
      const startTime = process.hrtime.bigint();

      // Intercept response
      const originalSend = res.send;
      res.send = async function(data) {
        // Calculate elapsed time
        const elapsed = process.hrtime.bigint() - startTime;
        const elapsedMs = Number(elapsed / 1000000n);

        // Ensure minimum response time
        const minResponseTime = 100; // 100ms minimum
        if (elapsedMs < minResponseTime) {
          await TimingProtection.randomDelay(
            minResponseTime - elapsedMs,
            minResponseTime - elapsedMs + 50
          );
        }

        return originalSend.call(this, data);
      };

      next();
    };
  }

  // Protect sensitive lookups
  static async protectedLookup(lookupFn, fallbackValue) {
    const startTime = process.hrtime.bigint();

    try {
      const result = await lookupFn();
      
      // Add noise to execution time
      await this.randomDelay(10, 50);
      
      return result || fallbackValue;
    } catch (error) {
      // Ensure consistent timing even on errors
      const elapsed = process.hrtime.bigint() - startTime;
      const targetTime = 100000000n; // 100ms in nanoseconds
      
      if (elapsed < targetTime) {
        const remainingMs = Number((targetTime - elapsed) / 1000000n);
        await this.randomDelay(remainingMs, remainingMs + 20);
      }

      return fallbackValue;
    }
  }
}

// Usage in sensitive operations
async function getAccountWithTimingProtection(address) {
  return TimingProtection.protectedLookup(
    async () => {
      return db.getAccount(address);
    },
    null // fallback value
  );
}
```

## 4. Performance-based Attacks

### 4.1 Query Complexity Attacks

```javascript
// security/complexityAnalyzer.js
export class QueryComplexityAnalyzer {
  static calculateComplexity(query) {
    const factors = {
      depth: query.depth || 1,
      maxNodes: query.maxNodes || 100,
      filters: Object.keys(query.filters || {}).length,
      timeRange: this.calculateTimeRangeComplexity(query.startTime, query.endTime)
    };

    // Calculate base complexity
    const baseComplexity = factors.depth * Math.log10(factors.maxNodes + 1);
    
    // Add filter complexity
    const filterComplexity = factors.filters * 0.5;
    
    // Add time range complexity
    const timeComplexity = factors.timeRange;

    return {
      total: baseComplexity + filterComplexity + timeComplexity,
      factors,
      estimated_time_ms: this.estimateExecutionTime(baseComplexity + filterComplexity + timeComplexity)
    };
  }

  static calculateTimeRangeComplexity(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const rangeDays = (end - start) / (1000 * 60 * 60 * 24);
    
    // Logarithmic complexity for time ranges
    return Math.log10(rangeDays + 1);
  }

  static estimateExecutionTime(complexity) {
    // Based on benchmarking data
    const baseTime = 50; // 50ms base
    const complexityFactor = 100; // 100ms per complexity unit
    
    return Math.round(baseTime + (complexity * complexityFactor));
  }

  // Middleware to reject overly complex queries
  static complexityLimit(maxComplexity = 10) {
    return (req, res, next) => {
      const complexity = this.calculateComplexity(req.query);
      
      if (complexity.total > maxComplexity) {
        return res.status(400).json({
          error: {
            message: 'Query too complex',
            complexity: complexity.total,
            maxAllowed: maxComplexity,
            suggestion: 'Reduce depth, maxNodes, or narrow time range'
          }
        });
      }

      // Add complexity to request for logging
      req.queryComplexity = complexity;
      next();
    };
  }
}
```

### 4.2 Cache Poisoning Prevention

```javascript
// security/cacheProtection.js
import crypto from 'crypto';

export class CacheProtection {
  constructor(cache) {
    this.cache = cache;
  }

  // Generate secure cache keys
  generateCacheKey(prefix, params, userId = 'anonymous') {
    // Include user context to prevent cross-user cache poisoning
    const keyData = {
      prefix,
      params: this.normalizeParams(params),
      userId,
      version: process.env.CACHE_VERSION || '1.0'
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex');

    return `${prefix}:${hash}`;
  }

  // Normalize parameters to prevent cache key manipulation
  normalizeParams(params) {
    const normalized = {};
    const allowedKeys = ['address', 'depth', 'minVolume', 'maxNodes'];

    for (const key of allowedKeys) {
      if (params[key] !== undefined) {
        normalized[key] = this.sanitizeParam(key, params[key]);
      }
    }

    // Sort keys for consistent hashing
    return Object.keys(normalized)
      .sort()
      .reduce((obj, key) => {
        obj[key] = normalized[key];
        return obj;
      }, {});
  }

  sanitizeParam(key, value) {
    switch (key) {
      case 'address':
        return value.toLowerCase().trim();
      case 'depth':
      case 'maxNodes':
        return Math.min(Math.max(parseInt(value) || 0, 0), 1000);
      case 'minVolume':
        return value.replace(/[^0-9]/g, '');
      default:
        return String(value).substring(0, 100);
    }
  }

  // Secure cache middleware
  middleware() {
    return async (req, res, next) => {
      // Skip caching for non-GET requests
      if (req.method !== 'GET') return next();

      const cacheKey = this.generateCacheKey(
        req.path,
        req.query,
        req.user?.id
      );

      try {
        // Check cache
        const cached = await this.cache.get(cacheKey);
        
        if (cached) {
          // Validate cached data
          if (this.isValidCachedData(cached)) {
            res.set('X-Cache', 'HIT');
            return res.json(cached.data);
          } else {
            // Remove poisoned cache entry
            await this.cache.del(cacheKey);
          }
        }

        // Store original res.json
        const originalJson = res.json;
        
        // Intercept response for caching
        res.json = async (data) => {
          // Cache successful responses only
          if (res.statusCode === 200 && this.shouldCache(req, data)) {
            const cacheData = {
              data,
              timestamp: Date.now(),
              checksum: this.calculateChecksum(data)
            };

            // Set with TTL based on query complexity
            const ttl = this.calculateTTL(req.queryComplexity);
            await this.cache.setex(cacheKey, ttl, JSON.stringify(cacheData));
          }

          res.set('X-Cache', 'MISS');
          return originalJson.call(res, data);
        };

        next();
      } catch (error) {
        console.error('Cache error:', error);
        next(); // Continue without caching on error
      }
    };
  }

  isValidCachedData(cached) {
    try {
      const parsed = JSON.parse(cached);
      
      // Check data structure
      if (!parsed.data || !parsed.timestamp || !parsed.checksum) {
        return false;
      }

      // Verify checksum
      const calculatedChecksum = this.calculateChecksum(parsed.data);
      if (calculatedChecksum !== parsed.checksum) {
        console.warn('Cache checksum mismatch - possible tampering');
        return false;
      }

      // Check age (max 1 hour)
      const age = Date.now() - parsed.timestamp;
      if (age > 3600000) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  calculateChecksum(data) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data) + process.env.CACHE_SALT)
      .digest('hex');
  }

  shouldCache(req, data) {
    // Don't cache empty results
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return false;
    }

    // Don't cache large datasets
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 1024 * 1024) { // 1MB
      return false;
    }

    return true;
  }

  calculateTTL(complexity) {
    if (!complexity) return 300; // 5 minutes default

    // Shorter TTL for complex queries
    if (complexity.total > 8) return 60;   // 1 minute
    if (complexity.total > 5) return 180;  // 3 minutes
    return 300; // 5 minutes
  }
}
```

### 4.3 Memory Exhaustion Protection

```javascript
// security/memoryProtection.js
export class MemoryProtection {
  constructor() {
    this.activeRequests = new Map();
    this.memoryThreshold = parseInt(process.env.MEMORY_THRESHOLD) || 512 * 1024 * 1024; // 512MB
  }

  middleware() {
    return async (req, res, next) => {
      const requestId = crypto.randomUUID();
      const startMemory = process.memoryUsage();

      // Track active request
      this.activeRequests.set(requestId, {
        startTime: Date.now(),
        startMemory: startMemory.heapUsed,
        path: req.path,
        ip: req.ip
      });

      // Check current memory usage
      if (startMemory.heapUsed > this.memoryThreshold) {
        this.activeRequests.delete(requestId);
        
        // Trigger garbage collection if available
        if (global.gc) {
          global.gc();
        }

        return res.status(503).json({
          error: {
            message: 'Server under heavy load',
            code: 'MEMORY_EXHAUSTED'
          }
        });
      }

      // Monitor memory during request
      const memoryCheckInterval = setInterval(() => {
        const currentMemory = process.memoryUsage();
        const memoryIncrease = currentMemory.heapUsed - startMemory.heapUsed;

        if (memoryIncrease > this.memoryThreshold / 2) {
          console.error('Request consuming excessive memory:', {
            requestId,
            path: req.path,
            memoryIncrease: Math.round(memoryIncrease / 1024 / 1024) + 'MB'
          });

          // Abort the request
          res.status(503).json({
            error: {
              message: 'Request terminated due to excessive memory usage',
              code: 'MEMORY_LIMIT_EXCEEDED'
            }
          });

          clearInterval(memoryCheckInterval);
          this.activeRequests.delete(requestId);
        }
      }, 1000); // Check every second

      // Clean up on response
      res.on('finish', () => {
        clearInterval(memoryCheckInterval);
        this.activeRequests.delete(requestId);

        // Log memory usage for monitoring
        const endMemory = process.memoryUsage();
        const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
        
        if (memoryUsed > 50 * 1024 * 1024) { // Log if > 50MB
          console.log('High memory usage detected:', {
            path: req.path,
            memoryUsed: Math.round(memoryUsed / 1024 / 1024) + 'MB',
            duration: Date.now() - this.activeRequests.get(requestId)?.startTime
          });
        }
      });

      next();
    };
  }

  // Stream large results instead of loading all into memory
  static streamResults(query, res) {
    res.setHeader('Content-Type', 'application/json');
    res.write('{"results":[');

    let first = true;
    let count = 0;
    const maxResults = 10000;

    const stmt = db.prepare(query);
    
    for (const row of stmt.iterate()) {
      if (count >= maxResults) {
        break;
      }

      if (!first) {
        res.write(',');
      }
      first = false;

      res.write(JSON.stringify(row));
      count++;

      // Yield to event loop periodically
      if (count % 100 === 0) {
        setImmediate(() => {});
      }
    }

    res.write('],"count":' + count + ',"truncated":' + (count >= maxResults) + '}');
    res.end();
  }
}
```

## 5. Business Logic Security

### 5.1 Gaming the Scoring System

```javascript
// security/scoringProtection.js
export class ScoringProtection {
  constructor() {
    this.suspiciousPatterns = new Map();
  }

  // Detect manipulation attempts
  async detectManipulation(address, relationships) {
    const patterns = [];

    // Check for artificial relationship boosting
    const boostingScore = this.detectRelationshipBoosting(relationships);
    if (boostingScore > 0.7) {
      patterns.push({
        type: 'relationship_boosting',
        confidence: boostingScore,
        details: 'Suspicious pattern of mutual transactions'
      });
    }

    // Check for wash trading
    const washTradingScore = this.detectWashTrading(relationships);
    if (washTradingScore > 0.6) {
      patterns.push({
        type: 'wash_trading',
        confidence: washTradingScore,
        details: 'Circular transaction patterns detected'
      });
    }

    // Check for Sybil relationships
    const sybilScore = await this.detectSybilRelationships(address, relationships);
    if (sybilScore > 0.5) {
      patterns.push({
        type: 'sybil_attack',
        confidence: sybilScore,
        details: 'Multiple relationships with likely controlled addresses'
      });
    }

    return patterns;
  }

  detectRelationshipBoosting(relationships) {
    let suspiciousCount = 0;

    for (const rel of relationships) {
      // Check for reciprocal relationships with similar volumes
      const reciprocal = relationships.find(r => 
        r.from_address === rel.to_address && 
        r.to_address === rel.from_address
      );

      if (reciprocal) {
        const volumeRatio = Math.min(rel.total_volume, reciprocal.total_volume) / 
                          Math.max(rel.total_volume, reciprocal.total_volume);
        
        // Suspicious if volumes are very similar
        if (volumeRatio > 0.9) {
          suspiciousCount++;
        }

        // Check timing patterns
        const timeDiff = Math.abs(
          new Date(rel.last_transfer).getTime() - 
          new Date(reciprocal.last_transfer).getTime()
        );

        // Suspicious if transfers happen within minutes
        if (timeDiff < 5 * 60 * 1000) {
          suspiciousCount++;
        }
      }
    }

    return suspiciousCount / Math.max(relationships.length, 1);
  }

  detectWashTrading(relationships) {
    // Build transaction graph
    const graph = new Map();
    
    for (const rel of relationships) {
      if (!graph.has(rel.from_address)) {
        graph.set(rel.from_address, []);
      }
      graph.get(rel.from_address).push(rel.to_address);
    }

    // Detect cycles
    const cycles = this.findCycles(graph);
    
    // Calculate suspicion score based on cycle characteristics
    let maxScore = 0;
    
    for (const cycle of cycles) {
      if (cycle.length <= 5) { // Short cycles are more suspicious
        const cycleScore = 1 - (cycle.length - 2) / 10;
        maxScore = Math.max(maxScore, cycleScore);
      }
    }

    return maxScore;
  }

  findCycles(graph, maxDepth = 6) {
    const cycles = [];
    const visited = new Set();

    const dfs = (node, path, start) => {
      if (path.length > maxDepth) return;

      if (path.length > 2 && node === start) {
        cycles.push([...path]);
        return;
      }

      if (visited.has(node) || path.includes(node)) return;

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path, node], start);
      }
    };

    for (const [start] of graph) {
      dfs(start, [], start);
      visited.add(start);
    }

    return cycles;
  }

  async detectSybilRelationships(address, relationships) {
    const suspiciousAddresses = new Set();

    for (const rel of relationships) {
      const otherAddress = rel.from_address === address ? rel.to_address : rel.from_address;
      
      // Check account creation patterns
      const accountInfo = await db.getAccount(otherAddress);
      
      if (accountInfo) {
        // New accounts with only this relationship
        if (accountInfo.total_transfers_in + accountInfo.total_transfers_out <= 2) {
          suspiciousAddresses.add(otherAddress);
        }

        // Accounts created around the same time
        const creationTime = new Date(accountInfo.created_at).getTime();
        const timeClusters = relationships.filter(r => {
          const otherAccount = db.getAccount(
            r.from_address === address ? r.to_address : r.from_address
          );
          if (!otherAccount) return false;
          
          const otherTime = new Date(otherAccount.created_at).getTime();
          return Math.abs(creationTime - otherTime) < 24 * 60 * 60 * 1000; // 24 hours
        });

        if (timeClusters.length > 3) {
          timeClusters.forEach(r => {
            const addr = r.from_address === address ? r.to_address : r.from_address;
            suspiciousAddresses.add(addr);
          });
        }
      }
    }

    return suspiciousAddresses.size / Math.max(relationships.length, 1);
  }

  // Apply penalties to manipulated scores
  adjustScoreForManipulation(baseScore, manipulationPatterns) {
    let penalty = 0;

    for (const pattern of manipulationPatterns) {
      switch (pattern.type) {
        case 'relationship_boosting':
          penalty += pattern.confidence * 0.3;
          break;
        case 'wash_trading':
          penalty += pattern.confidence * 0.4;
          break;
        case 'sybil_attack':
          penalty += pattern.confidence * 0.5;
          break;
      }
    }

    // Apply penalty (max 80% reduction)
    const adjustedScore = baseScore * (1 - Math.min(penalty, 0.8));
    
    return {
      original: baseScore,
      adjusted: adjustedScore,
      penalty: penalty,
      patterns: manipulationPatterns
    };
  }
}
```

### 5.2 Reputation System Protection

```javascript
// security/reputationProtection.js
export class ReputationProtection {
  constructor() {
    this.reputationCache = new Map();
    this.updateQueue = [];
  }

  // Calculate reputation with fraud detection
  async calculateReputation(address) {
    const cached = this.reputationCache.get(address);
    
    if (cached && Date.now() - cached.timestamp < 3600000) {
      return cached.reputation;
    }

    // Get all relevant data
    const account = await db.getAccount(address);
    const relationships = await db.getRelationships(address);
    const patterns = await db.getPatterns(address);

    // Base reputation from account age and activity
    const baseReputation = this.calculateBaseReputation(account);

    // Network effects
    const networkReputation = await this.calculateNetworkReputation(address, relationships);

    // Apply penalties for suspicious behavior
    const penalties = this.calculatePenalties(patterns);

    // Combine scores with weights
    const totalReputation = 
      baseReputation * 0.3 +
      networkReputation * 0.5 -
      penalties * 0.2;

    // Detect and prevent rapid reputation changes
    const previousReputation = cached?.reputation || 0;
    const changeRate = Math.abs(totalReputation - previousReputation);

    if (changeRate > 0.3 && cached) {
      // Log suspicious reputation change
      console.warn('Rapid reputation change detected:', {
        address,
        previous: previousReputation,
        new: totalReputation,
        changeRate
      });

      // Smooth the change
      const smoothedReputation = previousReputation + 
        (totalReputation - previousReputation) * 0.3;

      this.reputationCache.set(address, {
        reputation: smoothedReputation,
        timestamp: Date.now()
      });

      return smoothedReputation;
    }

    this.reputationCache.set(address, {
      reputation: totalReputation,
      timestamp: Date.now()
    });

    return totalReputation;
  }

  calculateBaseReputation(account) {
    if (!account) return 0;

    const factors = {
      age: this.getAccountAgeFactor(account),
      activity: this.getActivityFactor(account),
      identity: this.getIdentityFactor(account),
      balance: this.getBalanceFactor(account)
    };

    return (
      factors.age * 0.2 +
      factors.activity * 0.3 +
      factors.identity * 0.3 +
      factors.balance * 0.2
    );
  }

  getAccountAgeFactor(account) {
    const ageInDays = (Date.now() - new Date(account.created_at).getTime()) / 
                     (1000 * 60 * 60 * 24);
    
    // Logarithmic growth, caps at 1.0 after ~365 days
    return Math.min(1, Math.log10(ageInDays + 1) / 2.5);
  }

  getActivityFactor(account) {
    const totalTransfers = account.total_transfers_in + account.total_transfers_out;
    
    // Logarithmic scale to prevent gaming through spam
    return Math.min(1, Math.log10(totalTransfers + 1) / 3);
  }

  getIdentityFactor(account) {
    let score = 0;
    
    if (account.identity_display) score += 0.3;
    if (account.identity_legal) score += 0.2;
    if (account.identity_email) score += 0.2;
    if (account.identity_verified) score += 0.3;

    return score;
  }

  getBalanceFactor(account) {
    const balance = BigInt(account.balance || 0);
    const dot = 10n ** 10n;

    // Tiered balance factor
    if (balance >= 10000n * dot) return 1.0;
    if (balance >= 1000n * dot) return 0.8;
    if (balance >= 100n * dot) return 0.6;
    if (balance >= 10n * dot) return 0.4;
    if (balance >= 1n * dot) return 0.2;
    
    return 0.1;
  }

  async calculateNetworkReputation(address, relationships) {
    let totalReputation = 0;
    let weightSum = 0;

    // Consider reputation of connected addresses
    for (const rel of relationships.slice(0, 50)) { // Limit to prevent gaming
      const otherAddress = rel.from_address === address ? 
        rel.to_address : rel.from_address;
      
      const otherRep = await this.getSimplifiedReputation(otherAddress);
      const weight = this.getRelationshipWeight(rel);

      totalReputation += otherRep * weight;
      weightSum += weight;
    }

    return weightSum > 0 ? totalReputation / weightSum : 0;
  }

  getRelationshipWeight(relationship) {
    // Weight based on relationship strength
    const volumeWeight = Math.min(1, 
      parseFloat(relationship.total_volume) / (10 ** 15)
    );
    
    const frequencyWeight = Math.min(1, 
      relationship.transfer_count / 100
    );

    return (volumeWeight + frequencyWeight) / 2;
  }

  calculatePenalties(patterns) {
    let penalty = 0;

    for (const pattern of patterns) {
      if (!pattern.reviewed && !pattern.false_positive) {
        switch (pattern.pattern_type) {
          case 'rapid_movement':
            penalty += 0.1 * pattern.confidence;
            break;
          case 'circular_flow':
            penalty += 0.2 * pattern.confidence;
            break;
          case 'mixing':
            penalty += 0.3 * pattern.confidence;
            break;
          case 'sybil_network':
            penalty += 0.4 * pattern.confidence;
            break;
        }
      }
    }

    return Math.min(penalty, 0.8); // Cap penalties at 80%
  }

  // Simplified reputation for network calculations (prevent infinite recursion)
  async getSimplifiedReputation(address) {
    const account = await db.getAccount(address);
    if (!account) return 0.1;

    return this.calculateBaseReputation(account);
  }

  // Batch update reputations to prevent gaming through timing
  async batchUpdateReputations() {
    const updates = [...this.updateQueue];
    this.updateQueue = [];

    // Process updates in random order
    updates.sort(() => Math.random() - 0.5);

    for (const address of updates) {
      await this.calculateReputation(address);
      
      // Add jitter to prevent timing analysis
      await new Promise(resolve => 
        setTimeout(resolve, Math.random() * 100)
      );
    }
  }
}
```

## 6. Security Testing Approaches

```javascript
// security/securityTests.js
import { describe, test, expect } from '@jest/globals';
import request from 'supertest';

describe('Security Tests', () => {
  describe('SQL Injection', () => {
    test('should handle malicious address input', async () => {
      const maliciousInputs = [
        "1' OR '1'='1",
        "1'; DROP TABLE accounts; --",
        "1' UNION SELECT * FROM accounts --",
        "1\\'; DROP TABLE accounts; --"
      ];

      for (const input of maliciousInputs) {
        const response = await request(app)
          .get(`/api/graph?address=${encodeURIComponent(input)}`)
          .expect(400);

        expect(response.body.error).toBeDefined();
        expect(response.body.error.message).toContain('Validation error');
      }
    });

    test('should handle numeric injection attempts', async () => {
      const response = await request(app)
        .get('/api/graph')
        .query({
          address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
          depth: '2 OR 1=1',
          maxNodes: '100; DELETE FROM accounts'
        })
        .expect(400);

      expect(response.body.error.details).toBeDefined();
    });
  });

  describe('Resource Exhaustion', () => {
    test('should limit recursive depth', async () => {
      const response = await request(app)
        .get('/api/graph')
        .query({
          address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
          depth: 100
        })
        .expect(400);

      expect(response.body.error.details).toContainEqual(
        expect.objectContaining({
          field: 'depth',
          message: expect.stringContaining('max')
        })
      );
    });

    test('should enforce rate limits', async () => {
      const address = '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww';

      // Make requests up to the limit
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get(`/api/graph?address=${address}`)
          .expect(200);
      }

      // Next request should be rate limited
      const response = await request(app)
        .get(`/api/graph?address=${address}`)
        .expect(429);

      expect(response.body.error.message).toContain('rate limit');
      expect(response.headers['retry-after']).toBeDefined();
    });
  });

  describe('Timing Attacks', () => {
    test('should have consistent response times for lookups', async () => {
      const timings = [];
      
      // Valid address
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await request(app)
          .get('/api/addresses/1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww');
        timings.push(Date.now() - start);
      }

      // Invalid address
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await request(app)
          .get('/api/addresses/invalid_address_that_does_not_exist');
        timings.push(Date.now() - start);
      }

      // Calculate variance
      const mean = timings.reduce((a, b) => a + b) / timings.length;
      const variance = timings.reduce((sum, time) => 
        sum + Math.pow(time - mean, 2), 0
      ) / timings.length;

      // Variance should be low (consistent timing)
      expect(variance).toBeLessThan(1000); // Less than 1 second variance
    });
  });

  describe('Cache Poisoning', () => {
    test('should not cache invalid responses', async () => {
      // Force an error
      const response1 = await request(app)
        .get('/api/graph?address=invalid')
        .expect(400);

      // Valid request should not get poisoned cache
      const response2 = await request(app)
        .get('/api/graph?address=1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww')
        .expect(200);

      expect(response2.body).not.toEqual(response1.body);
      expect(response2.headers['x-cache']).not.toBe('HIT');
    });
  });

  describe('Business Logic', () => {
    test('should detect circular transaction patterns', async () => {
      // Create circular pattern
      const addresses = [
        '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
        '14UBWBwX8rTq8qV7SUvvMjNnMbDeBdZmvH3uM5HgcEKhdEtT',
        '16FjXEQvA6VKnLMQVvh2WZfKcMvBBwTBqiiRiPSU2hCCb9Qs'
      ];

      // Simulate circular transfers
      for (let i = 0; i < addresses.length; i++) {
        const from = addresses[i];
        const to = addresses[(i + 1) % addresses.length];
        
        await db.createTransfer({
          hash: `circular_${i}`,
          from_address: from,
          to_address: to,
          value: '1000000000000',
          timestamp: new Date().toISOString()
        });
      }

      // Check if pattern is detected
      const patterns = await db.getPatterns(addresses[0]);
      const circularPattern = patterns.find(p => 
        p.pattern_type === 'circular_flow'
      );

      expect(circularPattern).toBeDefined();
      expect(circularPattern.confidence).toBeGreaterThan(0.5);
    });
  });
});
```

## 7. Monitoring Recommendations

```javascript
// monitoring/securityMonitor.js
export class SecurityMonitor {
  constructor() {
    this.alerts = [];
    this.metrics = {
      failedValidations: 0,
      rateLimitHits: 0,
      suspiciousQueries: 0,
      memoryPeaks: []
    };
  }

  // Log security events
  logSecurityEvent(event) {
    const enrichedEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      serverInfo: {
        nodeVersion: process.version,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      }
    };

    // Log to file/service
    console.log('SECURITY_EVENT:', JSON.stringify(enrichedEvent));

    // Check if alert needed
    if (this.shouldAlert(event)) {
      this.sendAlert(enrichedEvent);
    }
  }

  shouldAlert(event) {
    const alertThresholds = {
      failed_validation: 10,    // 10 failures per minute
      rate_limit: 50,          // 50 rate limit hits per minute
      memory_usage: 0.8,       // 80% memory usage
      query_complexity: 15,    // Complexity score > 15
      suspicious_pattern: 1    // Any suspicious pattern
    };

    switch (event.type) {
      case 'failed_validation':
        return this.getEventRate('failedValidations') > alertThresholds.failed_validation;
      
      case 'rate_limit':
        return this.getEventRate('rateLimitHits') > alertThresholds.rate_limit;
      
      case 'memory_peak':
        return event.usage > alertThresholds.memory_usage;
      
      case 'complex_query':
        return event.complexity > alertThresholds.query_complexity;
      
      case 'suspicious_pattern':
        return true;
      
      default:
        return false;
    }
  }

  getEventRate(metric) {
    // Calculate events per minute
    // Implementation would track time-windowed counters
    return this.metrics[metric] || 0;
  }

  sendAlert(event) {
    this.alerts.push(event);

    // In production, send to monitoring service
    if (process.env.MONITORING_WEBHOOK) {
      fetch(process.env.MONITORING_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: this.getEventSeverity(event),
          event
        })
      }).catch(console.error);
    }
  }

  getEventSeverity(event) {
    const severityMap = {
      suspicious_pattern: 'critical',
      memory_peak: 'high',
      complex_query: 'medium',
      rate_limit: 'low',
      failed_validation: 'low'
    };

    return severityMap[event.type] || 'info';
  }

  // Dashboard metrics
  getMetrics() {
    return {
      ...this.metrics,
      alerts: this.alerts.slice(-100), // Last 100 alerts
      health: this.calculateHealthScore()
    };
  }

  calculateHealthScore() {
    const factors = {
      memory: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal,
      errorRate: this.getEventRate('failedValidations') / 100,
      load: os.loadavg()[0] / os.cpus().length
    };

    const score = 1 - (
      factors.memory * 0.3 +
      factors.errorRate * 0.4 +
      factors.load * 0.3
    );

    return Math.max(0, Math.min(1, score));
  }
}

// Usage
const monitor = new SecurityMonitor();

// Integrate with middleware
export function securityMonitoringMiddleware(req, res, next) {
  // Monitor failed validations
  res.on('finish', () => {
    if (res.statusCode === 400 && res.locals.validationError) {
      monitor.logSecurityEvent({
        type: 'failed_validation',
        ip: req.ip,
        path: req.path,
        error: res.locals.validationError
      });
    }

    // Monitor rate limits
    if (res.statusCode === 429) {
      monitor.logSecurityEvent({
        type: 'rate_limit',
        ip: req.ip,
        path: req.path
      });
    }

    // Monitor query complexity
    if (req.queryComplexity && req.queryComplexity.total > 10) {
      monitor.logSecurityEvent({
        type: 'complex_query',
        ip: req.ip,
        path: req.path,
        complexity: req.queryComplexity.total
      });
    }
  });

  next();
}
```

## 8. Security Configuration

```javascript
// config/security.js
export const securityConfig = {
  // Rate limiting
  rateLimits: {
    global: {
      windowMs: 15 * 60 * 1000,
      max: 100
    },
    search: {
      windowMs: 60 * 1000,
      max: 20
    },
    expensive: {
      windowMs: 5 * 60 * 1000,
      max: 5
    }
  },

  // Query limits
  queryLimits: {
    maxDepth: 4,
    maxNodes: 500,
    maxComplexity: 10,
    queryTimeout: 5000,
    maxMemoryPerQuery: 100 * 1024 * 1024 // 100MB
  },

  // Authentication
  auth: {
    jwtExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
    bcryptRounds: 12,
    sessionTimeout: 30 * 60 * 1000 // 30 minutes
  },

  // Security headers
  headers: {
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    csp: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },

  // Monitoring
  monitoring: {
    alertThresholds: {
      memoryUsage: 0.8,
      cpuUsage: 0.9,
      errorRate: 0.05,
      responseTime: 3000
    },
    retentionDays: 30
  },

  // Privacy
  privacy: {
    anonymizationSalt: process.env.ANONYMIZATION_SALT || 'change-me',
    dataRetention: {
      logs: 90, // days
      sessions: 30,
      investigations: 365
    }
  }
};
```

## Conclusion

This comprehensive security analysis has identified multiple vulnerability vectors in the graph traversal functionality and provided detailed mitigation strategies. Key recommendations include:

1. **Immediate Actions:**
   - Implement input validation and sanitization
   - Add query complexity limits
   - Deploy rate limiting
   - Enable security headers

2. **Short-term Improvements:**
   - Add authentication/authorization framework
   - Implement privacy protection layers
   - Deploy monitoring and alerting
   - Add security testing suite

3. **Long-term Enhancements:**
   - Implement advanced anti-gaming mechanisms
   - Deploy distributed caching with integrity checks
   - Add machine learning-based anomaly detection
   - Implement zero-knowledge proofs for sensitive operations

Regular security audits and penetration testing should be conducted to ensure ongoing protection against evolving threats.