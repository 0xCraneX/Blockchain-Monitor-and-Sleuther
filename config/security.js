/**
 * Security Configuration for Polkadot Analysis Tool
 * 
 * Centralized security settings with environment-specific configurations
 * Based on security audit findings and best practices
 */

/**
 * Environment-specific security settings
 */
export const securityConfig = {
  // Environment detection
  environment: process.env.NODE_ENV || 'development',

  // CORS Configuration
  cors: {
    // Production origins - MUST be configured properly
    allowedOrigins: {
      development: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
      ],
      production: process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [],
      test: ['http://localhost:3000']
    },
    
    // WebSocket CORS configuration
    websocket: {
      development: {
        origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'],
        methods: ['GET', 'POST'],
        credentials: true
      },
      production: {
        origin: process.env.WEBSOCKET_ORIGINS?.split(',').filter(Boolean) || [],
        methods: ['GET', 'POST'],
        credentials: true
      },
      test: {
        origin: ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: false
      }
    },
    
    // HTTP CORS configuration
    http: {
      credentials: true,
      maxAge: 86400, // 24 hours
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-Session-ID'
      ],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-Total-Count'
      ]
    }
  },

  // Content Security Policy
  csp: {
    development: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://d3js.org", "https://cdn.socket.io"], // Allow external scripts for dev
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "ws://localhost:*", "wss://localhost:*", "https:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    },
    production: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Only allow inline styles for specific needs
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", ...(process.env.API_ENDPOINTS?.split(',') || [])],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    },
    test: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws://localhost:*"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },

  // Rate Limiting Configuration
  rateLimits: {
    // Global rate limits - General API: 100 requests per minute
    global: {
      development: {
        windowMs: 60 * 1000, // 1 minute 
        max: 200 // More permissive for development
      },
      production: {
        windowMs: 60 * 1000, // 1 minute
        max: 100 // 100 requests per minute as specified
      },
      test: {
        windowMs: 60 * 1000,
        max: 10000 // Very high for tests
      }
    },

    // API-specific limits
    api: {
      // Graph queries (expensive operations) - 20 requests per minute
      graph: {
        development: { windowMs: 60 * 1000, max: 40 }, // More permissive for development
        production: { windowMs: 60 * 1000, max: 20 }, // 20 requests per minute as specified
        test: { windowMs: 60 * 1000, max: 1000 }
      },
      
      // Search operations - 50 requests per minute
      search: {
        development: { windowMs: 60 * 1000, max: 100 }, // More permissive for development
        production: { windowMs: 60 * 1000, max: 50 }, // 50 requests per minute as specified
        test: { windowMs: 60 * 1000, max: 1000 }
      },
      
      // Investigation operations
      investigations: {
        development: { windowMs: 60 * 1000, max: 100 },
        production: { windowMs: 60 * 1000, max: 50 },
        test: { windowMs: 60 * 1000, max: 1000 }
      }
    }
  },

  // Query Security Limits
  queryLimits: {
    maxDepth: parseInt(process.env.MAX_QUERY_DEPTH) || 4,
    maxNodes: parseInt(process.env.MAX_QUERY_NODES) || 500,
    maxComplexity: parseInt(process.env.MAX_QUERY_COMPLEXITY) || 10,
    queryTimeout: parseInt(process.env.QUERY_TIMEOUT_MS) || 5000,
    maxMemoryPerQuery: parseInt(process.env.MAX_MEMORY_PER_QUERY) || 100 * 1024 * 1024, // 100MB
    maxConcurrentQueries: parseInt(process.env.MAX_CONCURRENT_QUERIES) || 5
  },

  // Authentication Configuration
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      issuer: 'polkadot-analysis-tool',
      audience: 'api'
    },
    
    session: {
      secret: process.env.SESSION_SECRET,
      timeout: parseInt(process.env.SESSION_TIMEOUT_MS) || 30 * 60 * 1000, // 30 minutes
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict'
    },
    
    bcrypt: {
      rounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
    }
  },

  // Security Headers Configuration
  headers: {
    hsts: {
      development: null, // Disabled for HTTP development
      production: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },
      test: null
    },
    
    // Additional security headers
    additional: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': [
        'accelerometer=()',
        'autoplay=()',
        'camera=()',
        'display-capture=()',
        'encrypted-media=()',
        'fullscreen=()',
        'geolocation=()',
        'gyroscope=()',
        'magnetometer=()',
        'microphone=()',
        'midi=()',
        'payment=()',
        'picture-in-picture=()',
        'publickey-credentials-get=()',
        'usb=()',
        'web-share=()',
        'xr-spatial-tracking=()'
      ].join(', ')
    }
  },

  // Monitoring and Alerting
  monitoring: {
    alertThresholds: {
      memoryUsage: parseFloat(process.env.ALERT_MEMORY_THRESHOLD) || 0.8,
      cpuUsage: parseFloat(process.env.ALERT_CPU_THRESHOLD) || 0.9,
      errorRate: parseFloat(process.env.ALERT_ERROR_RATE) || 0.05,
      responseTime: parseInt(process.env.ALERT_RESPONSE_TIME_MS) || 3000,
      failedValidations: parseInt(process.env.ALERT_FAILED_VALIDATIONS) || 10,
      rateLimitHits: parseInt(process.env.ALERT_RATE_LIMIT_HITS) || 50
    },
    
    retentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
    
    webhooks: {
      security: process.env.SECURITY_WEBHOOK_URL,
      monitoring: process.env.MONITORING_WEBHOOK_URL
    }
  },

  // Privacy Configuration
  privacy: {
    anonymizationSalt: process.env.ANONYMIZATION_SALT,
    dataRetention: {
      logs: parseInt(process.env.LOG_RETENTION_DAYS) || 90,
      sessions: parseInt(process.env.SESSION_RETENTION_DAYS) || 30,
      investigations: parseInt(process.env.INVESTIGATION_RETENTION_DAYS) || 365
    },
    
    gdprCompliant: process.env.GDPR_COMPLIANCE === 'true'
  },

  // Development Security Settings
  development: {
    allowInsecureConnections: process.env.ALLOW_INSECURE === 'true',
    debugMode: process.env.DEBUG_SECURITY === 'true',
    bypassRateLimit: process.env.BYPASS_RATE_LIMIT === 'true'
  }
};

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(key) {
  const env = securityConfig.environment;
  const config = securityConfig[key];
  
  if (!config) return null;
  
  if (typeof config === 'object' && config[env]) {
    return config[env];
  }
  
  return config;
}

/**
 * Validate required security environment variables
 */
export function validateSecurityEnvironment() {
  const errors = [];
  const env = process.env.NODE_ENV || 'development';
  
  // Production-specific validations
  if (env === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be set and at least 32 characters long in production');
    }
    
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      errors.push('SESSION_SECRET must be set and at least 32 characters long in production');
    }
    
    if (!process.env.ANONYMIZATION_SALT || process.env.ANONYMIZATION_SALT.length < 16) {
      errors.push('ANONYMIZATION_SALT must be set and at least 16 characters long in production');
    }
    
    if (!process.env.ALLOWED_ORIGINS) {
      errors.push('ALLOWED_ORIGINS must be set in production (no wildcards allowed)');
    }
    
    if (process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS.includes('*')) {
      errors.push('ALLOWED_ORIGINS cannot contain wildcards (*) in production');
    }
    
    if (!process.env.WEBSOCKET_ORIGINS) {
      errors.push('WEBSOCKET_ORIGINS must be set in production');
    }
  }
  
  // General validations for all environments
  if (process.env.MAX_QUERY_DEPTH && (parseInt(process.env.MAX_QUERY_DEPTH) > 6 || parseInt(process.env.MAX_QUERY_DEPTH) < 1)) {
    errors.push('MAX_QUERY_DEPTH must be between 1 and 6');
  }
  
  if (process.env.MAX_QUERY_NODES && parseInt(process.env.MAX_QUERY_NODES) > 1000) {
    errors.push('MAX_QUERY_NODES should not exceed 1000 for performance reasons');
  }
  
  return errors;
}

/**
 * Get CORS configuration for current environment
 */
export function getCorsConfig() {
  const env = securityConfig.environment;
  const allowedOrigins = securityConfig.cors.allowedOrigins[env] || [];
  
  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.) in development
      if (!origin && env === 'development') {
        return callback(null, true);
      }
      
      // In production, always require an origin
      if (!origin && env === 'production') {
        return callback(new Error('Origin header required in production'));
      }
      
      if (allowedOrigins.length === 0) {
        return callback(new Error('No allowed origins configured'));
      }
      
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    ...securityConfig.cors.http
  };
}

/**
 * Get WebSocket CORS configuration for current environment
 */
export function getWebSocketCorsConfig() {
  const env = securityConfig.environment;
  return securityConfig.cors.websocket[env] || securityConfig.cors.websocket.development;
}

/**
 * Get CSP configuration for current environment
 */
export function getCSPConfig() {
  const env = securityConfig.environment;
  return securityConfig.csp[env] || securityConfig.csp.development;
}

/**
 * Get rate limit configuration for a specific endpoint
 */
export function getRateLimitConfig(endpoint = 'global') {
  const env = securityConfig.environment;
  
  if (endpoint === 'global') {
    return securityConfig.rateLimits.global[env] || securityConfig.rateLimits.global.development;
  }
  
  const apiConfig = securityConfig.rateLimits.api[endpoint];
  if (apiConfig) {
    return apiConfig[env] || apiConfig.development;
  }
  
  return securityConfig.rateLimits.global[env] || securityConfig.rateLimits.global.development;
}

/**
 * Initialize security configuration
 */
export function initializeSecurityConfig() {
  const errors = validateSecurityEnvironment();
  
  if (errors.length > 0) {
    console.error('Security configuration errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Security configuration validation failed in production');
    } else {
      console.warn('Security configuration has issues but continuing in non-production environment');
    }
  }
  
  console.log(`Security configuration initialized for environment: ${securityConfig.environment}`);
  
  // Log security warnings for development
  if (securityConfig.environment === 'development') {
    if (securityConfig.development.allowInsecureConnections) {
      console.warn('WARNING: Insecure connections allowed in development mode');
    }
    if (securityConfig.development.bypassRateLimit) {
      console.warn('WARNING: Rate limiting bypassed in development mode');
    }
  }
  
  return securityConfig;
}

export default securityConfig;