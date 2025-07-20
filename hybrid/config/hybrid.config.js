export const hybridConfig = {
  // Production vs Development mode
  environment: process.env.NODE_ENV || 'development',
  
  // RPC Configuration
  rpc: {
    endpoints: [
      'wss://rpc.polkadot.io',
      'wss://polkadot-rpc.dwellir.com',
      'wss://polkadot.api.onfinality.io/public-ws',
      'wss://polkadot-rpc.inyourhost.net'
    ],
    maxReconnectAttempts: 5,
    reconnectDelay: 5000,
    timeout: 30000
  },
  
  // Subscan API Configuration
  subscan: {
    baseURL: 'https://polkadot.api.subscan.io',
    apiKey: process.env.SUBSCAN_API_KEY || null,
    rateLimit: 250, // 4 req/s (conservative)
    maxRetries: 3,
    timeout: 15000
  },
  
  // Whale Detection Thresholds (in DOT)
  thresholds: {
    notable: 10000,     // 10k DOT
    important: 100000,  // 100k DOT  
    critical: 1000000   // 1M DOT
  },
  
  // Monitoring Configuration
  monitoring: {
    topAccountsLimit: 1000,
    blockScanDepth: 100,
    enableRealTimeMode: true,
    enableHistoricalMode: true,
    checkInterval: 60000 // 1 minute
  },
  
  // Alert Engine Configuration
  alerts: {
    enrichmentTimeout: 30000, // 30 seconds
    batchEnrichment: false,
    maxBatchSize: 10,
    
    patterns: {
      whaleThreshold: 100000,      // 100k DOT
      coordinationWindow: 3600000, // 1 hour
      dormantAccountDays: 180,     // 6 months
      minCoordinatedWhales: 3
    }
  },
  
  // Cache Configuration
  cache: {
    l1TTL: 30000,    // 30 seconds (hot cache)
    l2TTL: 300000,   // 5 minutes (warm cache)
    l3TTL: 3600000,  // 1 hour (cold cache)
    l2MaxSize: 5000,
    l3Path: './hybrid/cache/data'
  },
  
  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: './hybrid/logs/hybrid.log',
    console: true,
    maxFiles: 5,
    maxSize: '10MB'
  },
  
  // Performance Configuration
  performance: {
    maxMemoryUsage: 512 * 1024 * 1024, // 512MB
    gcInterval: 300000, // 5 minutes
    metricsInterval: 60000 // 1 minute
  },
  
  // Development Configuration
  development: {
    enableDebugLogs: true,
    mockData: false,
    testMode: false,
    simulatedDelay: 0
  },
  
  // Production Configuration
  production: {
    enableDebugLogs: false,
    strictMode: true,
    healthCheckInterval: 30000,
    autoRestart: true
  }
};

// Environment-specific overrides
if (hybridConfig.environment === 'development') {
  hybridConfig.subscan.rateLimit = 1000; // Slower in dev
  hybridConfig.monitoring.topAccountsLimit = 100; // Fewer accounts in dev
  hybridConfig.cache.l3Path = './hybrid/cache/dev-data';
}

if (hybridConfig.environment === 'test') {
  hybridConfig.rpc.maxReconnectAttempts = 2;
  hybridConfig.subscan.rateLimit = 2000; // Very slow in test
  hybridConfig.monitoring.topAccountsLimit = 10;
  hybridConfig.alerts.enrichmentTimeout = 5000;
  hybridConfig.cache.l3Path = './hybrid/cache/test-data';
}