import { createLogger } from '../utils/logger.js';
import { subscanService } from './SubscanService.js';

const logger = createLogger('RealDataService');

export class RealDataService {
  constructor(blockchainService, databaseService) {
    this.blockchain = blockchainService;
    this.database = databaseService;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get or fetch account data with caching
   */
  async getAccountData(address) {
    const cacheKey = `account:${address}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Try Subscan first for richer data
      let accountInfo = await subscanService.getAccountInfo(address);

      // Fallback to blockchain RPC if Subscan fails
      if (!accountInfo && this.blockchain?.api) {
        try {
          const account = await this.blockchain.api.query.system.account(address);
          let identity = null;

          // Try to get identity info if available
          try {
            if (this.blockchain.api.query.identity?.identityOf) {
              const identityData = await this.blockchain.api.query.identity.identityOf(address);
              if (identityData.isSome) {
                const info = identityData.unwrap().info;
                identity = this.blockchain.parseIdentity(info);
              }
            }
          } catch (identityError) {
            logger.debug('Failed to get identity from blockchain', { address, error: identityError.message });
          }

          accountInfo = {
            address,
            identity: {
              display: identity?.display || null,
              legal: identity?.legal || null,
              web: identity?.web || null,
              email: identity?.email || null,
              twitter: identity?.twitter || null,
              verified: false
            },
            balance: {
              free: account.data.free.toString(),
              reserved: account.data.reserved.toString(),
              locked: account.data.frozen?.toString() || '0'
            },
            nonce: account.nonce.toNumber(),
            role: 'regular'
          };
        } catch (blockchainError) {
          logger.warn('Failed to get account data from blockchain', { address, error: blockchainError.message });
        }
      }

      if (accountInfo) {
        this.setCache(cacheKey, accountInfo);

        // Update database
        await this.updateAccountInDatabase(accountInfo);
      }

      return accountInfo;
    } catch (error) {
      logger.error('Failed to get account data', { address, error: error.message });

      // Try database as last resort
      return await this.database?.getAccount(address);
    }
  }

  /**
   * Get address relationships from real data
   */
  async getAddressRelationships(address, options = {}) {
    const { limit = 50, minVolume = '0' } = options;
    const cacheKey = `relationships:${address}:${limit}:${minVolume}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get relationships from Subscan
      const relationships = await subscanService.getAccountRelationships(address, { limit });

      // Filter by minimum volume
      const filtered = relationships.filter(rel =>
        BigInt(rel.total_volume) >= BigInt(minVolume)
      );

      // Enrich with account info
      const enriched = await Promise.all(filtered.map(async rel => {
        const accountData = await this.getAccountData(rel.connected_address);
        return {
          ...rel,
          identity: accountData?.identity?.display || null,
          risk_score: 0, // TODO: Calculate risk score
          tags: []
        };
      }));

      this.setCache(cacheKey, enriched);

      // Update database with relationships
      await this.updateRelationshipsInDatabase(address, enriched);

      return enriched;
    } catch (error) {
      logger.error('Failed to get relationships', { address, error: error.message });

      // Fallback to database
      return await this.database?.getAddressRelationships(address, limit, minVolume);
    }
  }

  /**
   * Build graph data for visualization
   */
  async buildGraphData(centerAddress, depth = 2, options = {}) {
    const {
      maxNodes = 100,
      minVolume = '0'
    } = options;

    const nodes = new Map();
    const edges = new Map();
    const visited = new Set();
    const queue = [{ address: centerAddress, currentDepth: 0 }];

    // Add center node
    const centerAccount = await this.getAccountData(centerAddress);
    nodes.set(centerAddress, {
      address: centerAddress,
      identity: centerAccount?.identity || {},
      balance: centerAccount?.balance || {},
      nodeType: 'center',
      degree: 0,
      totalVolume: '0'
    });

    while (queue.length > 0 && nodes.size < maxNodes) {
      const { address, currentDepth } = queue.shift();

      if (visited.has(address) || currentDepth >= depth) {
        continue;
      }
      visited.add(address);

      // Get relationships
      const relationships = await this.getAddressRelationships(address, {
        limit: Math.min(20, maxNodes - nodes.size),
        minVolume
      });

      for (const rel of relationships) {
        const connectedAddress = rel.connected_address;

        // Skip if we have enough nodes
        if (nodes.size >= maxNodes) {
          break;
        }

        // Add connected node if not exists
        if (!nodes.has(connectedAddress)) {
          const connectedAccount = await this.getAccountData(connectedAddress);
          nodes.set(connectedAddress, {
            address: connectedAddress,
            identity: connectedAccount?.identity || {},
            balance: connectedAccount?.balance || {},
            nodeType: 'regular',
            degree: 0,
            totalVolume: '0',
            riskScore: rel.risk_score || 0
          });

          // Add to queue for next depth
          if (currentDepth + 1 < depth) {
            queue.push({ address: connectedAddress, currentDepth: currentDepth + 1 });
          }
        }

        // Create edge
        const edgeId = `${address}->${connectedAddress}`;
        const reverseEdgeId = `${connectedAddress}->${address}`;

        // Check if reverse edge exists (bidirectional)
        if (edges.has(reverseEdgeId)) {
          const existingEdge = edges.get(reverseEdgeId);
          existingEdge.bidirectional = true;
          existingEdge.volume = (BigInt(existingEdge.volume) + BigInt(rel.total_volume)).toString();
          existingEdge.count += rel.total_transactions;
        } else if (!edges.has(edgeId)) {
          edges.set(edgeId, {
            id: edgeId,
            source: address,
            target: connectedAddress,
            volume: rel.total_volume,
            count: rel.total_transactions,
            edgeType: 'transfer',
            bidirectional: false,
            firstTransfer: rel.first_interaction,
            lastTransfer: rel.last_interaction
          });
        }

        // Update node degrees and volumes
        const sourceNode = nodes.get(address);
        const targetNode = nodes.get(connectedAddress);

        sourceNode.degree++;
        targetNode.degree++;

        sourceNode.totalVolume = (BigInt(sourceNode.totalVolume) + BigInt(rel.sent_volume || 0)).toString();
        targetNode.totalVolume = (BigInt(targetNode.totalVolume) + BigInt(rel.received_volume || 0)).toString();
      }
    }

    // Convert to arrays and add visual properties
    const nodeArray = Array.from(nodes.values()).map(node => ({
      ...node,
      suggestedSize: Math.min(20 + node.degree * 2, 60),
      suggestedColor: node.nodeType === 'center' ? '#e6007a' :
        node.riskScore > 0.7 ? '#f44336' :
          node.riskScore > 0.3 ? '#ff9800' : '#2196F3'
    }));

    const edgeArray = Array.from(edges.values()).map(edge => ({
      ...edge,
      suggestedWidth: Math.min(1 + Math.log10(BigInt(edge.volume) / BigInt('1000000000000') + 1n) * 2, 10),
      suggestedColor: '#2196F3',
      suggestedOpacity: 0.6 + Math.min(edge.count / 50, 0.4)
    }));

    return {
      nodes: nodeArray,
      edges: edgeArray,
      metadata: {
        centerAddress,
        depth,
        totalNodes: nodeArray.length,
        totalEdges: edgeArray.length,
        dataSource: 'live',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Update account in database
   */
  async updateAccountInDatabase(accountInfo) {
    if (!this.database?.db) {
      return;
    }

    try {
      const stmt = this.database.db.prepare(`
        INSERT OR REPLACE INTO accounts (
          address, public_key, identity_display, identity_legal, identity_web,
          identity_email, identity_twitter, identity_riot, identity_verified,
          balance, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        accountInfo.address,
        '', // public_key not available from Subscan
        accountInfo.identity?.display || null,
        accountInfo.identity?.legal || null,
        accountInfo.identity?.web || null,
        accountInfo.identity?.email || null,
        accountInfo.identity?.twitter || null,
        null, // riot
        accountInfo.identity?.verified ? 1 : 0,
        accountInfo.balance?.free || '0'
      );
    } catch (error) {
      logger.warn('Failed to update account in database', { error: error.message });
    }
  }

  /**
   * Update relationships in database
   */
  async updateRelationshipsInDatabase(address, relationships) {
    if (!this.database?.db) {
      return;
    }

    try {
      const stmt = this.database.db.prepare(`
        INSERT OR REPLACE INTO account_relationships (
          from_address, to_address, total_volume, transfer_count,
          first_transfer_time, last_transfer_time, relationship_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.database.db.transaction((rels) => {
        for (const rel of rels) {
          if (rel.sent_count > 0) {
            stmt.run(
              address,
              rel.connected_address,
              rel.sent_volume,
              rel.sent_count,
              rel.first_interaction,
              rel.last_interaction,
              'transfer'
            );
          }
          if (rel.received_count > 0) {
            stmt.run(
              rel.connected_address,
              address,
              rel.received_volume,
              rel.received_count,
              rel.first_interaction,
              rel.last_interaction,
              'transfer'
            );
          }
        }
      });

      transaction(relationships);
    } catch (error) {
      logger.warn('Failed to update relationships in database', { error: error.message });
    }
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache() {
    this.cache.clear();
  }
}

export default RealDataService;