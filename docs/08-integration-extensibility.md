# Integration & Extensibility Framework

## Overview

This document provides a comprehensive framework for integrating the Polkadot Analysis Tool with external systems and extending its functionality through plugins, custom features, and future enhancements.

## Blockchain Integration

### Multi-Chain Architecture

```javascript
// src/blockchain/ChainManager.js
export class ChainManager {
  constructor() {
    this.chains = new Map();
    this.providers = new Map();
    this.activeConnections = new Map();
  }

  async registerChain(config) {
    const chain = {
      id: config.id,
      name: config.name,
      type: config.type,
      endpoints: config.endpoints,
      decimals: config.decimals,
      symbol: config.symbol,
      features: config.features || []
    };
    
    this.chains.set(config.id, chain);
    
    // Create provider based on chain type
    const provider = await this.createProvider(chain);
    this.providers.set(config.id, provider);
    
    return chain;
  }

  async createProvider(chain) {
    switch (chain.type) {
      case 'substrate':
        return new SubstrateProvider(chain);
      case 'evm':
        return new EVMProvider(chain);
      default:
        throw new Error(`Unsupported chain type: ${chain.type}`);
    }
  }

  async connect(chainId) {
    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new Error(`Chain not registered: ${chainId}`);
    }
    
    const connection = await provider.connect();
    this.activeConnections.set(chainId, connection);
    
    // Emit connection event
    this.emit('chain:connected', { chainId, connection });
    
    return connection;
  }

  async getConnection(chainId) {
    let connection = this.activeConnections.get(chainId);
    
    if (!connection || !connection.isConnected()) {
      connection = await this.connect(chainId);
    }
    
    return connection;
  }
}
```

### Substrate Chain Provider

```javascript
// src/blockchain/providers/SubstrateProvider.js
import { ApiPromise, WsProvider } from '@polkadot/api';

export class SubstrateProvider {
  constructor(chain) {
    this.chain = chain;
    this.api = null;
    this.healthCheckInterval = null;
  }

  async connect() {
    // Try endpoints in order until one works
    for (const endpoint of this.chain.endpoints) {
      try {
        const provider = new WsProvider(endpoint, 1000, {}, 5000);
        this.api = await ApiPromise.create({ 
          provider,
          types: this.chain.types,
          rpc: this.chain.rpc
        });
        
        // Start health monitoring
        this.startHealthCheck();
        
        return new SubstrateConnection(this.api, this.chain);
      } catch (error) {
        console.warn(`Failed to connect to ${endpoint}:`, error.message);
      }
    }
    
    throw new Error(`Failed to connect to any endpoint for ${this.chain.name}`);
  }

  startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.api.rpc.system.health();
        if (!health.isSyncing && health.peers.toNumber() === 0) {
          console.warn(`Chain ${this.chain.name} appears unhealthy`);
          await this.reconnect();
        }
      } catch (error) {
        console.error(`Health check failed for ${this.chain.name}:`, error);
        await this.reconnect();
      }
    }, 30000); // Every 30 seconds
  }

  async reconnect() {
    clearInterval(this.healthCheckInterval);
    await this.api.disconnect();
    
    // Exponential backoff
    let retries = 0;
    while (retries < 5) {
      try {
        await this.connect();
        console.log(`Reconnected to ${this.chain.name}`);
        return;
      } catch (error) {
        retries++;
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error(`Failed to reconnect to ${this.chain.name}`);
  }
}

// src/blockchain/connections/SubstrateConnection.js
export class SubstrateConnection {
  constructor(api, chain) {
    this.api = api;
    this.chain = chain;
  }

  isConnected() {
    return this.api.isConnected;
  }

  async getBlock(blockNumber) {
    const blockHash = await this.api.rpc.chain.getBlockHash(blockNumber);
    const block = await this.api.rpc.chain.getBlock(blockHash);
    
    return this.normalizeBlock(block);
  }

  async subscribeNewHeads(callback) {
    return this.api.rpc.chain.subscribeNewHeads((header) => {
      callback(this.normalizeHeader(header));
    });
  }

  async getBalance(address) {
    const account = await this.api.query.system.account(address);
    return {
      free: account.data.free.toString(),
      reserved: account.data.reserved.toString(),
      frozen: account.data.frozen ? account.data.frozen.toString() : '0'
    };
  }

  normalizeBlock(block) {
    return {
      number: block.block.header.number.toNumber(),
      hash: block.block.header.hash.toString(),
      parentHash: block.block.header.parentHash.toString(),
      timestamp: this.extractTimestamp(block),
      extrinsics: block.block.extrinsics.map(ext => this.normalizeExtrinsic(ext))
    };
  }

  extractTimestamp(block) {
    const timestampExtrinsic = block.block.extrinsics.find(
      ext => ext.method.section === 'timestamp' && ext.method.method === 'set'
    );
    
    if (timestampExtrinsic) {
      return timestampExtrinsic.method.args[0].toNumber();
    }
    
    return Date.now();
  }
}
```

### Chain Configuration

```javascript
// config/chains.js
export const chainConfigs = {
  polkadot: {
    id: 'polkadot',
    name: 'Polkadot',
    type: 'substrate',
    endpoints: [
      'wss://rpc.polkadot.io',
      'wss://polkadot-rpc.dwellir.com',
      'wss://polkadot.api.onfinality.io/public-ws'
    ],
    decimals: 10,
    symbol: 'DOT',
    features: ['balances', 'identity', 'staking', 'xcm'],
    explorerUrl: 'https://polkadot.subscan.io'
  },
  
  hydration: {
    id: 'hydration',
    name: 'Hydration',
    type: 'substrate',
    endpoints: [
      'wss://rpc.hydradx.cloud',
      'wss://hydradx-rpc.dwellir.com'
    ],
    decimals: 12,
    symbol: 'HDX',
    features: ['balances', 'omnipool', 'lbp', 'xcm'],
    explorerUrl: 'https://hydration.subscan.io',
    
    // Custom types for Hydration
    types: {
      AssetId: 'u32',
      Balance: 'u128',
      Price: 'u128',
      // Add more custom types as needed
    },
    
    // Custom RPC methods
    rpc: {
      omnipool: {
        getAssetPrice: {
          description: 'Get asset price from Omnipool',
          params: [
            { name: 'assetId', type: 'AssetId' }
          ],
          type: 'Price'
        }
      }
    }
  },
  
  assetHub: {
    id: 'assethub',
    name: 'Asset Hub',
    type: 'substrate',
    endpoints: [
      'wss://polkadot-asset-hub-rpc.polkadot.io',
      'wss://sys.ibp.network/asset-hub-polkadot'
    ],
    decimals: 10,
    symbol: 'DOT',
    features: ['assets', 'nfts', 'xcm'],
    explorerUrl: 'https://assethub-polkadot.subscan.io'
  }
};
```

## External API Integration

### API Client Factory

```javascript
// src/integrations/ApiClientFactory.js
export class ApiClientFactory {
  constructor() {
    this.clients = new Map();
    this.configs = new Map();
  }

  register(name, ClientClass, config) {
    this.configs.set(name, { ClientClass, config });
  }

  async getClient(name) {
    // Return existing client if available
    if (this.clients.has(name)) {
      return this.clients.get(name);
    }
    
    // Create new client
    const clientConfig = this.configs.get(name);
    if (!clientConfig) {
      throw new Error(`Unknown API client: ${name}`);
    }
    
    const { ClientClass, config } = clientConfig;
    const client = new ClientClass(config);
    
    // Initialize if needed
    if (client.initialize) {
      await client.initialize();
    }
    
    this.clients.set(name, client);
    return client;
  }
}

// Register clients
const apiFactory = new ApiClientFactory();

apiFactory.register('subscan', SubscanClient, {
  apiKey: process.env.SUBSCAN_API_KEY,
  baseUrl: 'https://polkadot.api.subscan.io',
  rateLimit: { maxRequests: 10, perSeconds: 1 }
});

apiFactory.register('coingecko', CoinGeckoClient, {
  apiKey: process.env.COINGECKO_API_KEY,
  baseUrl: 'https://api.coingecko.com/api/v3',
  rateLimit: { maxRequests: 50, perMinute: 1 }
});
```

### Subscan API Client

```javascript
// src/integrations/subscan/SubscanClient.js
import axios from 'axios';
import { RateLimiter } from 'limiter';

export class SubscanClient {
  constructor(config) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    // Rate limiting
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: config.rateLimit.maxRequests,
      interval: config.rateLimit.perSeconds * 1000
    });
    
    // Request interceptor for rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.rateLimiter.removeTokens(1);
      return config;
    });
  }

  async getAccountInfo(address) {
    try {
      const response = await this.client.post('/api/v2/scan/account', {
        address
      });
      
      return this.normalizeAccountInfo(response.data.data);
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded');
      }
      throw error;
    }
  }

  async getTransfers(params) {
    const response = await this.client.post('/api/scan/transfers', {
      address: params.address,
      row: params.limit || 100,
      page: params.page || 0,
      from_block: params.fromBlock,
      to_block: params.toBlock
    });
    
    return this.normalizeTransfers(response.data.data);
  }

  normalizeAccountInfo(data) {
    return {
      address: data.address,
      balance: {
        free: data.balance,
        reserved: data.reserved,
        locked: data.locked
      },
      nonce: data.nonce,
      accountIndex: data.account_index,
      identity: data.identity ? {
        display: data.identity.display,
        legal: data.identity.legal,
        web: data.identity.web,
        email: data.identity.email,
        twitter: data.identity.twitter
      } : null,
      tags: data.tags || []
    };
  }

  normalizeTransfers(data) {
    return {
      transfers: data.transfers?.map(t => ({
        from: t.from,
        to: t.to,
        amount: t.amount,
        assetId: t.asset_symbol,
        blockNumber: t.block_num,
        timestamp: t.block_timestamp,
        hash: t.hash,
        success: t.success,
        fee: t.fee
      })) || [],
      count: data.count || 0
    };
  }
}
```

### Price Service Integration

```javascript
// src/integrations/price/PriceService.js
export class PriceService {
  constructor(providers = []) {
    this.providers = providers;
    this.cache = new Map();
    this.cacheTTL = 60000; // 1 minute
  }

  async getPrice(symbol, currency = 'usd') {
    const cacheKey = `${symbol}:${currency}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.price;
    }
    
    // Try providers in order
    for (const provider of this.providers) {
      try {
        const price = await provider.getPrice(symbol, currency);
        
        // Cache successful result
        this.cache.set(cacheKey, {
          price,
          timestamp: Date.now()
        });
        
        return price;
      } catch (error) {
        console.warn(`Price provider ${provider.name} failed:`, error.message);
      }
    }
    
    throw new Error(`Unable to fetch price for ${symbol}`);
  }

  async getBatchPrices(symbols, currency = 'usd') {
    const prices = {};
    
    // Check cache first
    const uncached = [];
    for (const symbol of symbols) {
      const cacheKey = `${symbol}:${currency}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        prices[symbol] = cached.price;
      } else {
        uncached.push(symbol);
      }
    }
    
    // Fetch uncached prices
    if (uncached.length > 0) {
      for (const provider of this.providers) {
        try {
          const batchPrices = await provider.getBatchPrices(uncached, currency);
          
          // Cache and merge results
          for (const [symbol, price] of Object.entries(batchPrices)) {
            prices[symbol] = price;
            this.cache.set(`${symbol}:${currency}`, {
              price,
              timestamp: Date.now()
            });
          }
          
          break; // Success, no need to try other providers
        } catch (error) {
          console.warn(`Batch price fetch failed for ${provider.name}:`, error.message);
        }
      }
    }
    
    return prices;
  }
}

// Price provider implementations
export class CoinGeckoPriceProvider {
  constructor(client) {
    this.client = client;
    this.name = 'CoinGecko';
  }

  async getPrice(symbol, currency) {
    const id = this.symbolToId(symbol);
    const response = await this.client.get('/simple/price', {
      params: {
        ids: id,
        vs_currencies: currency
      }
    });
    
    return response.data[id][currency];
  }

  async getBatchPrices(symbols, currency) {
    const ids = symbols.map(s => this.symbolToId(s));
    const response = await this.client.get('/simple/price', {
      params: {
        ids: ids.join(','),
        vs_currencies: currency
      }
    });
    
    const prices = {};
    for (const symbol of symbols) {
      const id = this.symbolToId(symbol);
      if (response.data[id]) {
        prices[symbol] = response.data[id][currency];
      }
    }
    
    return prices;
  }

  symbolToId(symbol) {
    const mapping = {
      'DOT': 'polkadot',
      'HDX': 'hydradx',
      'GLMR': 'moonbeam',
      'ASTR': 'astar',
      // Add more mappings
    };
    
    return mapping[symbol.toUpperCase()] || symbol.toLowerCase();
  }
}
```

## Plugin Architecture

### Plugin System

```javascript
// src/plugins/PluginManager.js
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs-extra';

export class PluginManager extends EventEmitter {
  constructor(app) {
    super();
    this.app = app;
    this.plugins = new Map();
    this.hooks = new Map();
    this.pluginDir = path.join(process.cwd(), 'plugins');
  }

  async loadPlugins() {
    // Ensure plugin directory exists
    await fs.ensureDir(this.pluginDir);
    
    // Load built-in plugins
    await this.loadBuiltInPlugins();
    
    // Load user plugins
    const pluginDirs = await fs.readdir(this.pluginDir);
    
    for (const dir of pluginDirs) {
      const pluginPath = path.join(this.pluginDir, dir);
      const stat = await fs.stat(pluginPath);
      
      if (stat.isDirectory()) {
        await this.loadPlugin(pluginPath);
      }
    }
  }

  async loadPlugin(pluginPath) {
    try {
      // Load plugin manifest
      const manifestPath = path.join(pluginPath, 'plugin.json');
      const manifest = await fs.readJson(manifestPath);
      
      // Validate manifest
      this.validateManifest(manifest);
      
      // Load plugin module
      const PluginClass = require(path.join(pluginPath, manifest.main));
      const plugin = new PluginClass.default(this.createPluginContext(manifest));
      
      // Initialize plugin
      await plugin.initialize();
      
      // Register plugin
      this.plugins.set(manifest.id, {
        manifest,
        instance: plugin,
        path: pluginPath
      });
      
      console.log(`Loaded plugin: ${manifest.name} v${manifest.version}`);
      this.emit('plugin:loaded', manifest);
      
    } catch (error) {
      console.error(`Failed to load plugin from ${pluginPath}:`, error);
      this.emit('plugin:error', { path: pluginPath, error });
    }
  }

  createPluginContext(manifest) {
    return {
      id: manifest.id,
      
      // API access
      api: {
        registerEndpoint: (path, handler) => {
          this.app.api.registerPluginEndpoint(manifest.id, path, handler);
        },
        
        registerMiddleware: (middleware) => {
          this.app.api.use(middleware);
        }
      },
      
      // Service access
      services: {
        db: this.app.services.db,
        blockchain: this.app.services.blockchain,
        cache: this.app.services.cache
      },
      
      // Hook system
      hooks: {
        register: (hookName, handler) => {
          this.registerHook(manifest.id, hookName, handler);
        }
      },
      
      // UI extension
      ui: {
        registerComponent: (name, component) => {
          this.app.ui.registerPluginComponent(manifest.id, name, component);
        },
        
        registerRoute: (path, component) => {
          this.app.ui.registerPluginRoute(manifest.id, path, component);
        }
      },
      
      // Storage
      storage: {
        getPath: () => path.join(this.pluginDir, manifest.id, 'data'),
        
        get: async (key) => {
          const dataPath = path.join(this.pluginDir, manifest.id, 'data', `${key}.json`);
          return fs.readJson(dataPath).catch(() => null);
        },
        
        set: async (key, value) => {
          const dataPath = path.join(this.pluginDir, manifest.id, 'data');
          await fs.ensureDir(dataPath);
          await fs.writeJson(path.join(dataPath, `${key}.json`), value);
        }
      }
    };
  }

  registerHook(pluginId, hookName, handler) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    
    this.hooks.get(hookName).push({
      pluginId,
      handler
    });
  }

  async executeHook(hookName, data) {
    const hooks = this.hooks.get(hookName) || [];
    let result = data;
    
    for (const { pluginId, handler } of hooks) {
      try {
        result = await handler(result);
      } catch (error) {
        console.error(`Hook error in plugin ${pluginId}:`, error);
        this.emit('hook:error', { pluginId, hookName, error });
      }
    }
    
    return result;
  }

  validateManifest(manifest) {
    const required = ['id', 'name', 'version', 'main'];
    
    for (const field of required) {
      if (!manifest[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate version format
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      throw new Error('Invalid version format (expected x.y.z)');
    }
  }
}
```

### Example Plugin

```javascript
// plugins/risk-analyzer/index.js
export default class RiskAnalyzerPlugin {
  constructor(context) {
    this.context = context;
    this.riskThresholds = {
      low: 25,
      medium: 50,
      high: 75
    };
  }

  async initialize() {
    // Register API endpoint
    this.context.api.registerEndpoint('/risk/:address', async (req, res) => {
      const { address } = req.params;
      const risk = await this.analyzeRisk(address);
      res.json(risk);
    });
    
    // Register hooks
    this.context.hooks.register('account:beforeSave', async (account) => {
      const risk = await this.calculateRiskScore(account.address);
      return { ...account, riskScore: risk.score };
    });
    
    // Register UI component
    this.context.ui.registerComponent('RiskIndicator', {
      render: (props) => {
        const { score } = props;
        const level = this.getRiskLevel(score);
        return `<div class="risk-indicator risk-${level}">${level}: ${score}</div>`;
      }
    });
  }

  async analyzeRisk(address) {
    const [patterns, connections, volume] = await Promise.all([
      this.detectPatterns(address),
      this.analyzeConnections(address),
      this.analyzeVolume(address)
    ]);
    
    const score = this.calculateCompositeScore(patterns, connections, volume);
    
    return {
      address,
      score,
      level: this.getRiskLevel(score),
      factors: { patterns, connections, volume },
      timestamp: Date.now()
    };
  }

  async detectPatterns(address) {
    // Use core pattern detection service
    const patterns = await this.context.services.patternDetector.detect(address);
    
    // Add custom pattern detection
    const customPatterns = await this.detectCustomPatterns(address);
    
    return [...patterns, ...customPatterns];
  }

  getRiskLevel(score) {
    if (score >= this.riskThresholds.high) return 'high';
    if (score >= this.riskThresholds.medium) return 'medium';
    if (score >= this.riskThresholds.low) return 'low';
    return 'minimal';
  }
}

// plugins/risk-analyzer/plugin.json
{
  "id": "risk-analyzer",
  "name": "Advanced Risk Analyzer",
  "version": "1.0.0",
  "description": "Enhanced risk analysis with custom patterns",
  "author": "Your Name",
  "main": "index.js",
  "permissions": [
    "api:register",
    "hooks:register",
    "ui:components"
  ],
  "dependencies": {
    "core": "^1.0.0"
  }
}
```

## Export/Import Framework

### Export Manager

```javascript
// src/services/export/ExportManager.js
export class ExportManager {
  constructor() {
    this.exporters = new Map();
    this.registerDefaultExporters();
  }

  registerDefaultExporters() {
    this.register('csv', new CSVExporter());
    this.register('json', new JSONExporter());
    this.register('pdf', new PDFExporter());
    this.register('excel', new ExcelExporter());
  }

  register(format, exporter) {
    this.exporters.set(format, exporter);
  }

  async export(data, format, options = {}) {
    const exporter = this.exporters.get(format);
    
    if (!exporter) {
      throw new Error(`Unsupported export format: ${format}`);
    }
    
    // Validate data
    this.validateExportData(data);
    
    // Apply transforms
    const transformed = await this.transformData(data, options);
    
    // Export
    return exporter.export(transformed, options);
  }

  validateExportData(data) {
    if (!data.type) {
      throw new Error('Export data must have a type');
    }
    
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Export data must have items array');
    }
  }

  async transformData(data, options) {
    // Apply filters
    let items = data.items;
    
    if (options.filters) {
      items = this.applyFilters(items, options.filters);
    }
    
    // Apply field selection
    if (options.fields) {
      items = this.selectFields(items, options.fields);
    }
    
    // Apply formatting
    if (options.format) {
      items = await this.formatData(items, options.format);
    }
    
    return { ...data, items };
  }
}

// src/services/export/exporters/CSVExporter.js
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';

export class CSVExporter {
  async export(data, options = {}) {
    const { items, type } = data;
    
    // Get headers based on type
    const headers = this.getHeaders(type, items[0], options);
    
    // Convert to CSV
    const output = await new Promise((resolve, reject) => {
      stringify(items, {
        header: true,
        columns: headers,
        ...options.csvOptions
      }, (err, output) => {
        if (err) reject(err);
        else resolve(output);
      });
    });
    
    return {
      format: 'csv',
      mimeType: 'text/csv',
      filename: `${type}-${Date.now()}.csv`,
      data: output
    };
  }

  getHeaders(type, sample, options) {
    if (options.headers) {
      return options.headers;
    }
    
    // Default headers based on type
    const defaultHeaders = {
      'accounts': ['address', 'display_name', 'balance', 'risk_score'],
      'transfers': ['from', 'to', 'amount', 'timestamp', 'hash'],
      'patterns': ['address', 'pattern_type', 'severity', 'detected_at']
    };
    
    return defaultHeaders[type] || Object.keys(sample);
  }
}
```

### Import Manager

```javascript
// src/services/import/ImportManager.js
export class ImportManager {
  constructor(services) {
    this.services = services;
    this.importers = new Map();
    this.validators = new Map();
    
    this.registerDefaultImporters();
  }

  registerDefaultImporters() {
    this.register('csv', new CSVImporter());
    this.register('json', new JSONImporter());
    this.register('watchlist', new WatchlistImporter());
  }

  async import(file, type, options = {}) {
    // Detect format
    const format = this.detectFormat(file, options.format);
    const importer = this.importers.get(format);
    
    if (!importer) {
      throw new Error(`Unsupported import format: ${format}`);
    }
    
    // Parse file
    const data = await importer.parse(file);
    
    // Validate
    const validation = await this.validate(data, type);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors
      };
    }
    
    // Transform
    const transformed = await this.transform(data, type, options);
    
    // Import
    const result = await this.processImport(transformed, type, options);
    
    return {
      success: true,
      imported: result.count,
      skipped: result.skipped,
      errors: result.errors
    };
  }

  async validate(data, type) {
    const validator = this.validators.get(type);
    
    if (!validator) {
      return { valid: true };
    }
    
    const errors = [];
    
    for (let i = 0; i < data.length; i++) {
      const validation = validator.validate(data[i]);
      
      if (!validation.valid) {
        errors.push({
          row: i + 1,
          errors: validation.errors
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async processImport(data, type, options) {
    const batch = options.batchSize || 1000;
    const results = {
      count: 0,
      skipped: 0,
      errors: []
    };
    
    // Process in batches
    for (let i = 0; i < data.length; i += batch) {
      const chunk = data.slice(i, i + batch);
      
      try {
        const imported = await this.importBatch(chunk, type, options);
        results.count += imported.count;
        results.skipped += imported.skipped;
      } catch (error) {
        results.errors.push({
          batch: Math.floor(i / batch) + 1,
          error: error.message
        });
      }
    }
    
    return results;
  }

  async importBatch(items, type, options) {
    switch (type) {
      case 'watchlist':
        return this.importWatchlist(items, options);
      
      case 'accounts':
        return this.importAccounts(items, options);
      
      case 'transfers':
        return this.importTransfers(items, options);
      
      default:
        throw new Error(`Unknown import type: ${type}`);
    }
  }
}
```

## Future Enhancement Paths

### Machine Learning Integration

```javascript
// src/ml/MLService.js
import * as tf from '@tensorflow/tfjs-node';

export class MLService {
  constructor() {
    this.models = new Map();
    this.preprocessors = new Map();
  }

  async loadModel(name, modelPath) {
    const model = await tf.loadLayersModel(`file://${modelPath}`);
    this.models.set(name, model);
    
    console.log(`Loaded ML model: ${name}`);
  }

  async predictRisk(address, features) {
    const model = this.models.get('risk-predictor');
    
    if (!model) {
      throw new Error('Risk prediction model not loaded');
    }
    
    // Preprocess features
    const input = this.preprocessFeatures(features);
    
    // Make prediction
    const prediction = model.predict(input);
    const riskScore = await prediction.data();
    
    // Clean up
    input.dispose();
    prediction.dispose();
    
    return {
      address,
      riskScore: riskScore[0],
      confidence: this.calculateConfidence(riskScore),
      features
    };
  }

  preprocessFeatures(features) {
    // Normalize features
    const normalized = {
      transactionCount: features.transactionCount / 10000,
      uniqueAddresses: features.uniqueAddresses / 1000,
      totalVolume: Math.log10(features.totalVolume + 1) / 10,
      accountAge: features.accountAge / (365 * 24 * 60 * 60),
      patternCount: features.patternCount / 10
    };
    
    // Convert to tensor
    return tf.tensor2d([Object.values(normalized)]);
  }

  async clusterAccounts(accounts) {
    // Extract features for each account
    const features = await Promise.all(
      accounts.map(acc => this.extractFeatures(acc))
    );
    
    // Convert to tensor
    const data = tf.tensor2d(features);
    
    // Apply K-means clustering
    const k = 5; // Number of clusters
    const clusters = await this.kMeans(data, k);
    
    // Map accounts to clusters
    return accounts.map((account, i) => ({
      ...account,
      cluster: clusters[i],
      clusterName: this.getClusterName(clusters[i])
    }));
  }

  async detectAnomalies(transactions) {
    const model = this.models.get('anomaly-detector');
    
    if (!model) {
      // Fallback to statistical method
      return this.statisticalAnomalyDetection(transactions);
    }
    
    // Use autoencoder for anomaly detection
    const features = transactions.map(t => this.extractTransactionFeatures(t));
    const input = tf.tensor2d(features);
    
    // Get reconstruction
    const reconstructed = model.predict(input);
    
    // Calculate reconstruction error
    const errors = tf.losses.meanSquaredError(input, reconstructed, 1);
    const errorValues = await errors.data();
    
    // Determine threshold (95th percentile)
    const threshold = this.calculatePercentile(errorValues, 95);
    
    // Mark anomalies
    const anomalies = transactions.filter((t, i) => errorValues[i] > threshold);
    
    // Clean up
    input.dispose();
    reconstructed.dispose();
    errors.dispose();
    
    return anomalies;
  }
}
```

### Real-time Monitoring

```javascript
// src/monitoring/MonitoringService.js
export class MonitoringService {
  constructor(services) {
    this.services = services;
    this.monitors = new Map();
    this.alerts = new Map();
  }

  async createMonitor(config) {
    const monitor = {
      id: config.id,
      name: config.name,
      type: config.type,
      conditions: config.conditions,
      actions: config.actions,
      enabled: true,
      lastCheck: null,
      checkInterval: config.checkInterval || 60000
    };
    
    this.monitors.set(config.id, monitor);
    
    // Start monitoring
    this.startMonitor(monitor);
    
    return monitor;
  }

  startMonitor(monitor) {
    const interval = setInterval(async () => {
      if (!monitor.enabled) return;
      
      try {
        await this.checkMonitor(monitor);
      } catch (error) {
        console.error(`Monitor check failed for ${monitor.id}:`, error);
      }
    }, monitor.checkInterval);
    
    monitor.interval = interval;
  }

  async checkMonitor(monitor) {
    monitor.lastCheck = Date.now();
    
    switch (monitor.type) {
      case 'address':
        await this.checkAddressMonitor(monitor);
        break;
        
      case 'pattern':
        await this.checkPatternMonitor(monitor);
        break;
        
      case 'volume':
        await this.checkVolumeMonitor(monitor);
        break;
    }
  }

  async checkAddressMonitor(monitor) {
    const { address, conditions } = monitor;
    
    // Get latest data
    const [balance, transfers, patterns] = await Promise.all([
      this.services.blockchain.getBalance(address),
      this.services.transfers.getRecent(address, { limit: 100 }),
      this.services.patterns.detect(address)
    ]);
    
    // Check conditions
    for (const condition of conditions) {
      const triggered = await this.evaluateCondition(condition, {
        address,
        balance,
        transfers,
        patterns
      });
      
      if (triggered) {
        await this.triggerAlert(monitor, condition, {
          address,
          condition: condition.type,
          value: triggered.value,
          threshold: condition.threshold
        });
      }
    }
  }

  async triggerAlert(monitor, condition, data) {
    const alert = {
      id: `${monitor.id}-${Date.now()}`,
      monitorId: monitor.id,
      condition: condition.type,
      data,
      timestamp: Date.now()
    };
    
    this.alerts.set(alert.id, alert);
    
    // Execute actions
    for (const action of monitor.actions) {
      await this.executeAction(action, alert);
    }
  }

  async executeAction(action, alert) {
    switch (action.type) {
      case 'webhook':
        await this.sendWebhook(action.url, alert);
        break;
        
      case 'email':
        await this.sendEmail(action.email, alert);
        break;
        
      case 'notification':
        await this.sendNotification(alert);
        break;
    }
  }
}
```

### Multi-User Collaboration

```javascript
// src/collaboration/CollaborationService.js
import { Server } from 'socket.io';

export class CollaborationService {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL,
        credentials: true
      }
    });
    
    this.sessions = new Map();
    this.setupHandlers();
  }

  setupHandlers() {
    this.io.on('connection', (socket) => {
      console.log('User connected:', socket.id);
      
      socket.on('join-session', (data) => this.handleJoinSession(socket, data));
      socket.on('leave-session', (data) => this.handleLeaveSession(socket, data));
      socket.on('graph-update', (data) => this.handleGraphUpdate(socket, data));
      socket.on('cursor-move', (data) => this.handleCursorMove(socket, data));
      socket.on('annotation', (data) => this.handleAnnotation(socket, data));
      
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  handleJoinSession(socket, { sessionId, userId, userName }) {
    // Get or create session
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      session = {
        id: sessionId,
        users: new Map(),
        graph: null,
        annotations: [],
        cursors: new Map()
      };
      this.sessions.set(sessionId, session);
    }
    
    // Add user to session
    session.users.set(userId, {
      id: userId,
      name: userName,
      socketId: socket.id,
      color: this.generateUserColor(userId)
    });
    
    // Join socket room
    socket.join(sessionId);
    socket.userId = userId;
    socket.sessionId = sessionId;
    
    // Send current state
    socket.emit('session-state', {
      users: Array.from(session.users.values()),
      graph: session.graph,
      annotations: session.annotations
    });
    
    // Notify others
    socket.to(sessionId).emit('user-joined', {
      userId,
      userName
    });
  }

  handleGraphUpdate(socket, { action, data }) {
    const session = this.sessions.get(socket.sessionId);
    if (!session) return;
    
    // Apply update
    switch (action) {
      case 'add-node':
        this.addNode(session, data);
        break;
        
      case 'remove-node':
        this.removeNode(session, data);
        break;
        
      case 'expand-node':
        this.expandNode(session, data);
        break;
    }
    
    // Broadcast to others
    socket.to(socket.sessionId).emit('graph-update', {
      action,
      data,
      userId: socket.userId
    });
  }

  handleAnnotation(socket, { type, data }) {
    const session = this.sessions.get(socket.sessionId);
    if (!session) return;
    
    const annotation = {
      id: `${socket.userId}-${Date.now()}`,
      userId: socket.userId,
      type,
      data,
      timestamp: Date.now()
    };
    
    session.annotations.push(annotation);
    
    // Broadcast to all users
    this.io.to(socket.sessionId).emit('annotation', annotation);
  }

  generateUserColor(userId) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#6C5CE7', '#55A3FF', '#FD79A8'
    ];
    
    const index = userId.charCodeAt(0) % colors.length;
    return colors[index];
  }
}
```

This comprehensive framework provides all the necessary components for integrating external systems and extending the Polkadot Analysis Tool's functionality through plugins, APIs, and future enhancements.