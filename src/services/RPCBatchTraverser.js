import { createLogger } from '../utils/logger.js';

const logger = createLogger('RPCBatchTraverser');

/**
 * High-performance RPC-first blockchain traverser
 * Optimized for 100k req/min throughput with depth 5 support
 */
export class RPCBatchTraverser {
  constructor(blockchainService, databaseService) {
    this.blockchain = blockchainService;
    this.database = databaseService;

    // Batch configuration for 100k req/min
    this.batchSize = 500; // Process 500 addresses per batch
    this.maxConcurrentBatches = 20; // 20 batches in parallel = 10k addresses
    this.requestTimeout = 30000; // 30s timeout per batch

    // Cache with longer TTL for RPC data
    this.cache = new Map();
    this.cacheTTL = 30 * 60 * 1000; // 30 minutes

    logger.info('RPCBatchTraverser initialized', {
      batchSize: this.batchSize,
      maxConcurrentBatches: this.maxConcurrentBatches,
      cacheTTL: this.cacheTTL
    });
  }

  /**
   * Build graph with depth 5 support using RPC batching
   */
  async buildGraphDepth5(centerAddress, depth = 5, options = {}) {
    const {
      minVolume = '0',
      maxNodes = Infinity, // No artificial limits
      onProgress = null
    } = options;

    logger.info('Starting depth 5 graph traversal', {
      centerAddress,
      depth,
      minVolume: minVolume ? (BigInt(minVolume) / BigInt(10 ** 10)).toString() + ' DOT' : 'none'
    });

    const startTime = Date.now();
    const nodes = new Map();
    const edges = new Map();

    // Level-by-level traversal (breadth-first)
    const levels = [new Set([centerAddress])]; // Level 0 = center

    // Fetch center address data
    const centerData = await this._batchFetchAccounts([centerAddress]);
    if (centerData[0]) {
      nodes.set(centerAddress, {
        ...centerData[0],
        nodeType: 'center',
        depth: 0
      });
    }

    // Build graph level by level
    for (let currentDepth = 0; currentDepth < depth; currentDepth++) {
      const currentLevel = levels[currentDepth];
      const nextLevel = new Set();

      logger.debug(`Processing level ${currentDepth}`, {
        addressesInLevel: currentLevel.size,
        totalNodesFound: nodes.size
      });

      // Batch fetch transfers for all addresses in current level
      const levelAddresses = Array.from(currentLevel);
      const transferBatches = await this._batchFetchTransfers(levelAddresses, minVolume);

      // Process all transfers to find connected addresses
      for (const [fromAddr, transfers] of Object.entries(transferBatches)) {
        for (const transfer of transfers) {
          const connectedAddr = transfer.to === fromAddr ? transfer.from : transfer.to;

          // Skip if we've already processed this address
          if (nodes.has(connectedAddr)) {
            continue;
          }

          // Add to next level
          nextLevel.add(connectedAddr);

          // Create edge
          const edgeId = this._createEdgeId(fromAddr, connectedAddr);
          if (!edges.has(edgeId)) {
            edges.set(edgeId, {
              id: edgeId,
              source: fromAddr,
              target: connectedAddr,
              volume: transfer.value,
              count: 1,
              edgeType: 'transfer',
              firstTransfer: transfer.timestamp,
              lastTransfer: transfer.timestamp
            });
          } else {
            // Aggregate existing edge
            const edge = edges.get(edgeId);
            edge.volume = (BigInt(edge.volume) + BigInt(transfer.value)).toString();
            edge.count++;
            edge.lastTransfer = transfer.timestamp;
          }
        }
      }

      // Batch fetch account data for next level
      if (nextLevel.size > 0) {
        const nextLevelAddresses = Array.from(nextLevel);
        const accountDataBatch = await this._batchFetchAccounts(nextLevelAddresses);

        accountDataBatch.forEach((accountData, idx) => {
          if (accountData) {
            nodes.set(nextLevelAddresses[idx], {
              ...accountData,
              nodeType: 'connected',
              depth: currentDepth + 1
            });
          }
        });

        levels.push(nextLevel);
      }

      // Report progress
      if (onProgress) {
        onProgress({
          currentDepth,
          totalDepth: depth,
          nodesFound: nodes.size,
          edgesFound: edges.size,
          elapsedTime: Date.now() - startTime
        });
      }

      // Stop if no more addresses to process
      if (nextLevel.size === 0) {
        logger.info(`Graph traversal completed early at depth ${currentDepth + 1}`);
        break;
      }
    }

    const result = {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
      metadata: {
        centerAddress,
        actualDepth: levels.length - 1,
        requestedDepth: depth,
        totalNodes: nodes.size,
        totalEdges: edges.size,
        traversalTime: Date.now() - startTime,
        dataSource: 'rpc_batch',
        timestamp: Date.now()
      }
    };

    logger.info('Depth 5 graph traversal completed', {
      centerAddress,
      nodesFound: nodes.size,
      edgesFound: edges.size,
      actualDepth: levels.length - 1,
      traversalTime: result.metadata.traversalTime
    });

    return result;
  }

  /**
   * Batch fetch accounts from RPC (500 at a time)
   */
  async _batchFetchAccounts(addresses) {
    const cached = [];
    const toFetch = [];
    const cacheMap = new Map();

    // Check cache first
    addresses.forEach((addr, idx) => {
      const cacheKey = `account:${addr}`;
      const cachedData = this._getFromCache(cacheKey);

      if (cachedData) {
        cached.push({ idx, data: cachedData });
      } else {
        toFetch.push({ idx, addr });
      }
    });

    logger.debug(`Batch account fetch: ${cached.length} cached, ${toFetch.length} to fetch`);

    // Fetch uncached accounts in batches
    const results = new Array(addresses.length);

    // Fill cached results
    cached.forEach(({ idx, data }) => {
      results[idx] = data;
    });

    // Fetch in chunks
    for (let i = 0; i < toFetch.length; i += this.batchSize) {
      const chunk = toFetch.slice(i, i + this.batchSize);

      const chunkPromises = chunk.map(async ({ idx, addr }) => {
        try {
          if (!this.blockchain?.api) {
            logger.warn('Blockchain API not available');
            return { idx, data: null };
          }

          // Parallel RPC calls for account + identity
          const [accountInfo, identityInfo] = await Promise.all([
            this.blockchain.api.query.system.account(addr),
            this.blockchain.api.query.identity?.identityOf
              ? this.blockchain.api.query.identity.identityOf(addr)
              : Promise.resolve(null)
          ]);

          let identity = null;
          if (identityInfo && identityInfo.isSome) {
            const info = identityInfo.unwrap().info;
            identity = this.blockchain.parseIdentity(info);
          }

          const data = {
            address: addr,
            identity: identity ? {
              display: identity.display || null,
              legal: identity.legal || null,
              web: identity.web || null,
              email: identity.email || null,
              twitter: identity.twitter || null,
              verified: false
            } : null,
            balance: {
              free: accountInfo.data.free.toString(),
              reserved: accountInfo.data.reserved.toString(),
              frozen: accountInfo.data.frozen?.toString() || '0'
            },
            nonce: accountInfo.nonce.toNumber(),
            role: 'regular'
          };

          // Cache the result
          this._setCache(`account:${addr}`, data);

          return { idx, data };
        } catch (error) {
          logger.warn('Failed to fetch account', { addr, error: error.message });
          return { idx, data: null };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      chunkResults.forEach(({ idx, data }) => {
        results[idx] = data;
      });
    }

    return results;
  }

  /**
   * Batch fetch transfers for multiple addresses
   * Returns: { address: [transfers] }
   */
  async _batchFetchTransfers(addresses, minVolume = '0') {
    logger.debug('Batch fetching transfers', {
      addressCount: addresses.length,
      minVolume
    });

    // Check database first (much faster than RPC for transfers)
    const results = {};

    for (const address of addresses) {
      const cacheKey = `transfers:${address}:${minVolume}`;
      const cached = this._getFromCache(cacheKey);

      if (cached) {
        results[address] = cached;
        continue;
      }

      try {
        // Get transfers from database
        const transfers = await this._getTransfersFromDB(address, minVolume);

        if (transfers && transfers.length > 0) {
          results[address] = transfers;
          this._setCache(cacheKey, transfers);
        } else {
          results[address] = [];
        }
      } catch (error) {
        logger.warn('Failed to fetch transfers', { address, error: error.message });
        results[address] = [];
      }
    }

    return results;
  }

  /**
   * Get transfers from database (pre-indexed)
   */
  async _getTransfersFromDB(address, minVolume = '0') {
    if (!this.database?.db) {
      return [];
    }

    try {
      const stmt = this.database.db.prepare(`
        SELECT
          from_address as "from",
          to_address as "to",
          value,
          timestamp,
          success
        FROM transfers
        WHERE (from_address = ? OR to_address = ?)
          AND CAST(value AS INTEGER) >= CAST(? AS INTEGER)
          AND success = 1
        ORDER BY timestamp DESC
        LIMIT 1000
      `);

      const transfers = stmt.all(address, address, minVolume);
      return transfers;
    } catch (error) {
      logger.warn('Database query failed', { address, error: error.message });
      return [];
    }
  }

  /**
   * Create deterministic edge ID
   */
  _createEdgeId(addr1, addr2) {
    // Always use lexicographic order for undirected edges
    return addr1 < addr2 ? `${addr1}->${addr2}` : `${addr2}->${addr1}`;
  }

  /**
   * Cache helpers
   */
  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }

  _setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    logger.debug('Cache cleared', { entriesRemoved: size });
  }
}
