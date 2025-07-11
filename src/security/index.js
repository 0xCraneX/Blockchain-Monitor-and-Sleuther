/**
 * Security Middleware and Utilities
 * 
 * This module provides comprehensive security features for the Polkadot Analysis Tool
 * including input validation, rate limiting, query protection, and monitoring.
 */

import { z } from 'zod';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import createDOMPurify from 'isomorphic-dompurify';

const DOMPurify = createDOMPurify();

/**
 * Query Validator - Prevents SQL injection and validates inputs
 */
export class QueryValidator {
  static addressSchema = z.string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{48,}$/)
    .refine((addr) => !this.containsHomographs(addr), 
      'Address contains suspicious characters');

  static validateAddress(address) {
    return this.addressSchema.parse(address);
  }

  static sanitizeNumeric(value, defaultValue = 0) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  static validateDepth(depth) {
    const MAX_SAFE_DEPTH = 4;
    const validated = this.sanitizeNumeric(depth, 2);
    return Math.min(validated, MAX_SAFE_DEPTH);
  }

  static safeJsonParse(jsonString, defaultValue = {}) {
    try {
      if (typeof jsonString !== 'string') return defaultValue;
      
      const sanitized = DOMPurify.sanitize(jsonString, { 
        USE_PROFILES: { html: false, svg: false, mathMl: false }
      });
      
      return JSON.parse(sanitized);
    } catch (error) {
      console.error('JSON parsing error:', error);
      return defaultValue;
    }
  }

  static containsHomographs(str) {
    const suspiciousPatterns = [
      /[\u0430-\u044f]/, // Cyrillic
      /[\u03b1-\u03c9]/, // Greek lowercase
      /[\u1e00-\u1eff]/  // Latin extended
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(str));
  }
}

/**
 * Recursive Query Protection - Prevents DoS through recursive queries
 */
export class RecursiveQueryProtection {
  constructor(db) {
    this.db = db;
    this.activeQueries = new Map();
  }

  async executeProtectedQuery(queryId, queryFn, options = {}) {
    const {
      timeout = 5000,
      maxMemory = 100 * 1024 * 1024,
      maxRows = 10000
    } = options;

    if (this.activeQueries.has(queryId)) {
      throw new Error('Query already in progress');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      this.activeQueries.set(queryId, { 
        controller, 
        startTime: Date.now() 
      });

      const initialMemory = process.memoryUsage().heapUsed;
      const rows = [];
      let rowCount = 0;

      const stmt = queryFn();
      
      for (const row of stmt.iterate()) {
        if (controller.signal.aborted) {
          throw new Error('Query timeout');
        }

        rowCount++;
        if (rowCount > maxRows) {
          throw new Error(`Query exceeded maximum rows (${maxRows})`);
        }

        const currentMemory = process.memoryUsage().heapUsed;
        if (currentMemory - initialMemory > maxMemory) {
          throw new Error('Query exceeded memory limit');
        }

        rows.push(row);
      }

      return rows;
    } finally {
      clearTimeout(timeoutId);
      this.activeQueries.delete(queryId);
    }
  }
}

/**
 * Cost-based Rate Limiter - Different costs for different operations
 */
export class CostBasedRateLimiter {
  constructor() {
    this.costMap = new Map([
      ['GET /api/graph', 50],
      ['GET /api/addresses/search', 10],
      ['GET /api/addresses/:id', 5],
      ['POST /api/investigations', 20]
    ]);
    this.budgets = new Map();
  }

  middleware() {
    return async (req, res, next) => {
      const key = `${req.method} ${req.route?.path || req.path}`;
      const cost = this.costMap.get(key) || 1;
      const ip = req.ip;
      const window = 60000; // 1 minute
      const maxBudget = 100;

      const currentBudget = this.getCurrentBudget(ip);
      
      if (currentBudget + cost > maxBudget) {
        const resetTime = Date.now() + window;
        
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

      this.consumeBudget(ip, cost);
      next();
    };
  }

  getCurrentBudget(ip) {
    const now = Date.now();
    const window = 60000;
    const userBudget = this.budgets.get(ip) || [];
    
    // Filter out expired entries
    const validEntries = userBudget.filter(entry => 
      now - entry.timestamp < window
    );
    
    this.budgets.set(ip, validEntries);
    
    return validEntries.reduce((sum, entry) => sum + entry.cost, 0);
  }

  consumeBudget(ip, cost) {
    const userBudget = this.budgets.get(ip) || [];
    userBudget.push({ cost, timestamp: Date.now() });
    this.budgets.set(ip, userBudget);
  }
}

/**
 * Query Complexity Analyzer - Prevents complex query attacks
 */
export class QueryComplexityAnalyzer {
  static calculateComplexity(query) {
    const factors = {
      depth: query.depth || 1,
      maxNodes: query.maxNodes || 100,
      filters: Object.keys(query.filters || {}).length,
      timeRange: this.calculateTimeRangeComplexity(query.startTime, query.endTime)
    };

    const baseComplexity = factors.depth * Math.log10(factors.maxNodes + 1);
    const filterComplexity = factors.filters * 0.5;
    const timeComplexity = factors.timeRange;

    return {
      total: baseComplexity + filterComplexity + timeComplexity,
      factors,
      estimated_time_ms: Math.round(50 + ((baseComplexity + filterComplexity + timeComplexity) * 100))
    };
  }

  static calculateTimeRangeComplexity(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const rangeDays = (end - start) / (1000 * 60 * 60 * 24);
    
    return Math.log10(rangeDays + 1);
  }

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

      req.queryComplexity = complexity;
      next();
    };
  }
}

/**
 * Privacy Protection - Anonymizes sensitive data
 */
export class PrivacyProtection {
  static anonymizeGraphData(graphData, userId, userPermissions) {
    const { nodes, edges } = graphData;
    const anonymizedNodes = new Map();

    const processedNodes = nodes.map(node => {
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
          risk_score: Math.round(node.risk_score * 10) / 10,
          total_transfers: this.bucketize(node.total_transfers_in + node.total_transfers_out),
          balance: this.anonymizeBalance(node.balance)
        };
      }

      return node;
    });

    const processedEdges = edges.map(edge => {
      const fromAnon = anonymizedNodes.get(edge.from) || edge.from;
      const toAnon = anonymizedNodes.get(edge.to) || edge.to;

      return {
        ...edge,
        from: fromAnon,
        to: toAnon,
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
    if (node.user_id === userId) return false;
    if (permissions.includes('view_all_identities')) return false;
    if (node.risk_score > 0.7) return false;
    if (node.is_exchange || node.is_validator) return false;

    return true;
  }

  static generateAnonymousId(address) {
    const hash = crypto
      .createHash('sha256')
      .update(address + (process.env.ANONYMIZATION_SALT || 'default-salt'))
      .digest('hex');
    
    return `anon_${hash.substring(0, 12)}`;
  }

  static bucketize(value) {
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

  static getAnonymizationLevel(permissions) {
    if (permissions.includes('admin')) return 'none';
    if (permissions.includes('analyst')) return 'minimal';
    return 'standard';
  }
}

/**
 * Security Monitor - Tracks and alerts on security events
 */
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

    console.log('SECURITY_EVENT:', JSON.stringify(enrichedEvent));

    if (this.shouldAlert(event)) {
      this.sendAlert(enrichedEvent);
    }
  }

  shouldAlert(event) {
    const alertThresholds = {
      failed_validation: 10,
      rate_limit: 50,
      memory_usage: 0.8,
      query_complexity: 15,
      suspicious_pattern: 1
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
    return this.metrics[metric] || 0;
  }

  sendAlert(event) {
    this.alerts.push(event);

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
}

/**
 * Configure Security Headers
 */
export function configureSecurityHeaders(app) {
  // Helmet for basic security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "https:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration
  const corsOptions = {
    origin: (origin, callback) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
      
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    maxAge: 86400,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
  };

  app.use(cors(corsOptions));

  // Additional security headers
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Permissions-Policy', 
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    );
    
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    next();
  });
}

/**
 * Create validation middleware
 */
export function createValidationMiddleware(schema, property = 'query') {
  return async (req, res, next) => {
    try {
      const validated = await schema.parseAsync(req[property]);
      req[property] = validated;
      next();
    } catch (error) {
      res.locals.validationError = error;
      res.status(400).json({
        error: {
          message: 'Validation error',
          details: error.errors?.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        }
      });
    }
  };
}

// Export rate limiters
export const graphQueryLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: 'Too many graph queries, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many search requests, please try again later.',
  keyGenerator: (req) => `${req.ip}:${req.query.q || ''}`
});

// Create singleton instances
export const monitor = new SecurityMonitor();
export const costLimiter = new CostBasedRateLimiter();

// Export validation schemas
export const validationSchemas = {
  graphQuery: z.object({
    address: QueryValidator.addressSchema,
    depth: z.coerce.number().int().min(1).max(4).default(2),
    minVolume: z.string().regex(/^\d+$/).default('0'),
    maxNodes: z.coerce.number().int().min(10).max(500).default(100)
  }),

  addressSearch: z.object({
    q: z.string().min(1).max(100),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  }),

  investigationSave: z.object({
    sessionId: z.string().uuid(),
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    addresses: z.array(QueryValidator.addressSchema).max(100),
    filters: z.object({
      minVolume: z.string().optional(),
      dateRange: z.object({
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional()
      }).optional(),
      riskThreshold: z.number().min(0).max(100).optional()
    }).strict()
  }).strict()
};