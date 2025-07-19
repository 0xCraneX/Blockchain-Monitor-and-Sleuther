import { createLogger } from '../utils/logger.js';
import { subscanService } from './SubscanService.js';

const logger = createLogger('RealDataService');

export class RealDataService {
  constructor(blockchainService, databaseService) {
    logger.info('[CONSTRUCTOR] RealDataService constructor called', {
      hasBlockchainService: !!blockchainService,
      hasDatabaseService: !!databaseService,
      blockchainServiceType: blockchainService?.constructor?.name,
      databaseServiceType: databaseService?.constructor?.name,
      blockchainApiConnected: !!blockchainService?.api,
      databaseConnected: !!databaseService?.db,
      stackTrace: new Error().stack.split('\n').slice(1, 5).join('\n') // Log where it's being created from
    });

    this.blockchain = blockchainService;
    this.database = databaseService;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.serviceId = Math.random().toString(36).substring(7); // Unique ID for tracking this instance

    // Log all methods that will be available
    // const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this));
    // logger.debug('[CONSTRUCTOR] RealDataService initialized', {
    //   cacheTimeout: this.cacheTimeout,
    //   serviceId: this.serviceId,
    //   availableMethods: methods.filter(m => typeof this[m] === 'function' && m !== 'constructor'),
    //   hasBuildGraphData: methods.includes('buildGraphData'),
    //   buildGraphDataType: typeof this.buildGraphData
    // });
  }

  /**
   * Get or fetch account data with caching
   */
  async getAccountData(address) {
    // logger.debug('getAccountData called', {
    //   address,
    //   method: 'getAccountData',
    //   hasBlockchainApi: !!this.blockchain?.api,
    //   hasDatabaseService: !!this.database
    // });

    const cacheKey = `account:${address}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      // logger.debug('Account data found in cache', { address, cacheKey });
      return cached;
    }

    // logger.debug('Account data not in cache, fetching...', { address });

    try {
      // Try Subscan first for richer data
      // logger.debug('Attempting to fetch from Subscan', { address });
      let accountInfo = await subscanService.getAccountInfo(address);

      // logger.debug('Subscan response', {
      //   address,
      //   hasAccountInfo: !!accountInfo,
      //   accountInfoKeys: accountInfo ? Object.keys(accountInfo) : null
      // });

      // Fallback to blockchain RPC if Subscan fails
      if (!accountInfo && this.blockchain?.api) {
        // logger.debug('Subscan failed, trying blockchain RPC', { address });
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
            // logger.debug('Failed to get identity from blockchain', { address, error: identityError.message });
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

          // logger.debug('Successfully fetched from blockchain RPC', {
          //   address,
          //   hasIdentity: !!identity,
          //   balance: accountInfo.balance.free,
          //   nonce: accountInfo.nonce
          // });
        } catch (blockchainError) {
          logger.warn('Failed to get account data from blockchain', {
            address,
            error: blockchainError.message,
            stack: blockchainError.stack
          });
        }
      }

      if (accountInfo) {
        // logger.debug('Account info obtained, updating cache and database', { address });
        this.setCache(cacheKey, accountInfo);

        // Update database
        await this.updateAccountInDatabase(accountInfo);
      } else {
        logger.warn('No account info obtained from any source', { address });
      }

      // logger.debug('getAccountData completed', {
      //   address,
      //   hasResult: !!accountInfo,
      //   source: accountInfo ? 'subscan/blockchain' : 'none'
      // });

      return accountInfo;
    } catch (error) {
      logger.error('Failed to get account data', {
        address,
        error: error.message,
        stack: error.stack
      });

      // Try database as last resort
      // logger.debug('Attempting database fallback', { address });
      const dbResult = await this.database?.getAccount(address);

      // logger.debug('Database fallback result', {
      //   address,
      //   hasResult: !!dbResult,
      //   resultKeys: dbResult ? Object.keys(dbResult) : null
      // });

      return dbResult;
    }
  }

  /**
   * Get address relationships from real data
   */
  async getAddressRelationships(address, options = {}) {
    const { limit = 50, minVolume = '0' } = options;

    // logger.debug('getAddressRelationships called', {
    //   address,
    //   limit,
    //   minVolume,
    //   method: 'getAddressRelationships'
    // });

    const cacheKey = `relationships:${address}:${limit}:${minVolume}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      // logger.debug('Relationships found in cache', {
      //   address,
      //   cacheKey,
      //   relationshipCount: cached.length
      // });
      return cached;
    }

    // logger.debug('Relationships not in cache, fetching...', { address });

    try {
      // Get relationships from Subscan
      // logger.debug('Fetching relationships from Subscan', { address, limit });
      const relationships = await subscanService.getAccountRelationships(address, { limit });

      // logger.debug('Subscan relationships response', {
      //   address,
      //   relationshipCount: relationships.length,
      //   hasRelationships: relationships.length > 0
      // });

      // Filter by minimum volume
      const filtered = relationships.filter(rel =>
        BigInt(rel.total_volume) >= BigInt(minVolume)
      );

      // logger.debug('Filtered relationships by volume', {
      //   address,
      //   originalCount: relationships.length,
      //   filteredCount: filtered.length,
      //   minVolume
      // });

      // Enrich only the top relationships to avoid rate limiting
      const topRelationships = filtered.slice(0, 10); // Only enrich top 10 by volume
      const remainingRelationships = filtered.slice(10);

      // logger.debug('Enriching top relationships with account data', {
      //   address,
      //   topCount: topRelationships.length,
      //   skippedCount: remainingRelationships.length
      // });

      // Enrich top relationships sequentially to respect rate limit
      const enrichedTop = [];
      for (const rel of topRelationships) {
        try {
          const accountData = await this.getAccountData(rel.connected_address);
          enrichedTop.push({
            ...rel,
            identity: accountData?.identity?.display || null,
            merkle: accountData?.merkle || null,
            balance: accountData?.balance || null,
            risk_score: 0, // TODO: Calculate risk score
            tags: []
          });
        } catch (error) {
          // logger.debug('Failed to enrich relationship', { address: rel.connected_address });
          enrichedTop.push({
            ...rel,
            identity: null,
            risk_score: 0,
            tags: []
          });
        }
      }

      // Add remaining relationships without enrichment
      const enrichedRemaining = remainingRelationships.map(rel => ({
        ...rel,
        identity: null,
        risk_score: 0,
        tags: []
      }));

      const enriched = [...enrichedTop, ...enrichedRemaining];

      // logger.debug('Relationships enriched', {
      //   address,
      //   totalCount: enriched.length,
      //   enrichedCount: enrichedTop.length,
      //   hasIdentities: enrichedTop.filter(r => r.identity).length
      // });

      this.setCache(cacheKey, enriched);

      // Update database with relationships
      await this.updateRelationshipsInDatabase(address, enriched);

      // logger.debug('getAddressRelationships completed', {
      //   address,
      //   resultCount: enriched.length
      // });

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
    let {
      maxNodes = 50, // Reduced from 100 to avoid rate limiting
      minVolume = '0',
      progressive = false,
      onProgress = null
    } = options;
    
    // Limit depth to prevent exponential API calls
    if (depth > 3 && maxNodes > 200) {
      logger.warn('Large depth with high node limit detected, reducing maxNodes', {
        requestedDepth: depth,
        requestedMaxNodes: maxNodes,
        adjustedMaxNodes: 200
      });
      maxNodes = 200;
    }

    logger.info('[METHOD] buildGraphData called', {
      centerAddress,
      depth,
      maxNodes,
      minVolume,
      method: 'buildGraphData',
      hasBlockchainService: !!this.blockchain,
      hasDatabaseService: !!this.database,
      thisType: typeof this,
      thisConstructor: this?.constructor?.name,
      isRealDataService: this instanceof RealDataService,
      stackTrace: new Error().stack.split('\n').slice(1, 5).join('\n')
    });

    const nodes = new Map();
    const edges = new Map();
    const visited = new Set();
    const queue = [{ address: centerAddress, currentDepth: 0 }];

    // Add center node
    // logger.debug('Fetching center node data', { centerAddress });
    const centerAccount = await this.getAccountData(centerAddress);

    if (!centerAccount) {
      logger.warn('Center account data not found', { centerAddress });
    }

    nodes.set(centerAddress, {
      address: centerAddress,
      identity: centerAccount?.identity || {},
      balance: {
        free: this._sanitizeBalanceValue(centerAccount?.balance?.free) || '0',
        reserved: this._sanitizeBalanceValue(centerAccount?.balance?.reserved) || '0',
        frozen: this._sanitizeBalanceValue(centerAccount?.balance?.frozen) || '0'
      },
      merkle: centerAccount?.merkle || null,
      nodeType: 'center',
      degree: 0,
      totalVolume: '0'
    });

    // logger.debug('Center node added', {
    //   centerAddress,
    //   hasIdentity: !!centerAccount?.identity?.display,
    //   balance: centerAccount?.balance?.free
    // });

    let iteration = 0;
    const startTime = Date.now();
    
    while (queue.length > 0 && nodes.size < maxNodes) {
      iteration++;
      
      // Log progress every 10 iterations or every 5 seconds
      if (iteration % 10 === 0 || Date.now() - startTime > 5000) {
        logger.info('Graph building progress', {
          iteration,
          queueLength: queue.length,
          nodesCount: nodes.size,
          visitedCount: visited.size,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
          depth: depth,
          maxNodes: maxNodes
        });
      }
      const { address, currentDepth } = queue.shift();

      // logger.debug('Processing node', {
      //   address,
      //   currentDepth,
      //   alreadyVisited: visited.has(address),
      //   depthReached: currentDepth >= depth
      // });

      if (visited.has(address) || currentDepth >= depth) {
        // logger.debug('Skipping node', {
        //   address,
        //   reason: visited.has(address) ? 'already_visited' : 'depth_reached'
        // });
        continue;
      }
      visited.add(address);

      // Get relationships
      const relationshipLimit = Math.min(maxNodes - nodes.size, 100);
      // logger.debug('Fetching relationships for node', {
      //   address,
      //   currentDepth,
      //   relationshipLimit,
      //   minVolume
      // });

      const relationships = await this.getAddressRelationships(address, {
        limit: relationshipLimit,
        minVolume
      });

      // logger.debug('Relationships fetched', {
      //   address,
      //   relationshipCount: relationships.length,
      //   currentNodesCount: nodes.size
      // });

      for (const rel of relationships) {
        const connectedAddress = rel.connected_address;

        // Skip if we have enough nodes
        if (nodes.size >= maxNodes) {
          break;
        }

        // Add connected node if not exists
        if (!nodes.has(connectedAddress)) {
          // Use cached identity and merkle from relationship if available
          const nodeBalance = rel.balance || {};
          nodes.set(connectedAddress, {
            address: connectedAddress,
            identity: rel.identity ? { display: rel.identity } : {},
            balance: {
              free: this._sanitizeBalanceValue(nodeBalance.free) || '0',
              reserved: this._sanitizeBalanceValue(nodeBalance.reserved) || '0',
              frozen: this._sanitizeBalanceValue(nodeBalance.frozen) || '0'
            },
            merkle: rel.merkle || null,
            nodeType: 'regular',
            degree: 0,
            totalVolume: '0',
            riskScore: rel.risk_score || 0
          });

          // Add to queue for next depth
          if (currentDepth < depth) {
            queue.push({ address: connectedAddress, currentDepth: currentDepth + 1 });
          }
        }

        // Create edge with direction detection
        const edgeId = `${address}->${connectedAddress}`;
        const reverseEdgeId = `${connectedAddress}->${address}`;

        // Determine relationship direction based on sent/received volumes
        const hasSentVolume = rel.sent_volume && BigInt(rel.sent_volume) > 0;
        const hasReceivedVolume = rel.received_volume && BigInt(rel.received_volume) > 0;
        const isBidirectional = hasSentVolume && hasReceivedVolume;

        // Calculate dominant direction for bidirectional relationships
        let dominantDirection = 'balanced';
        if (isBidirectional) {
          const sentAmount = BigInt(rel.sent_volume || 0);
          const receivedAmount = BigInt(rel.received_volume || 0);
          const ratio = Number(sentAmount * 100n / (sentAmount + receivedAmount));

          if (ratio > 70) {
            dominantDirection = 'outgoing';
          } else if (ratio < 30) {
            dominantDirection = 'incoming';
          } else {
            dominantDirection = 'balanced';
          }
        } else {
          dominantDirection = hasSentVolume ? 'outgoing' : 'incoming';
        }

        // Check if reverse edge exists (bidirectional)
        if (edges.has(reverseEdgeId)) {
          const existingEdge = edges.get(reverseEdgeId);
          existingEdge.bidirectional = true;
          existingEdge.volume = (BigInt(existingEdge.volume) + BigInt(rel.total_volume)).toString();
          existingEdge.count += rel.total_transactions;
          existingEdge.direction = 'bidirectional';
          existingEdge.dominantDirection = dominantDirection;
          // Add volume breakdown for bidirectional edges
          existingEdge.sentVolume = (BigInt(existingEdge.sentVolume || 0) + BigInt(rel.sent_volume || 0)).toString();
          existingEdge.receivedVolume = (BigInt(existingEdge.receivedVolume || 0) + BigInt(rel.received_volume || 0)).toString();
        } else if (!edges.has(edgeId)) {
          edges.set(edgeId, {
            id: edgeId,
            source: address,
            target: connectedAddress,
            volume: rel.total_volume,
            count: rel.total_transactions,
            edgeType: 'transfer',
            bidirectional: isBidirectional,
            direction: isBidirectional ? 'bidirectional' : dominantDirection,
            dominantDirection: dominantDirection,
            sentVolume: rel.sent_volume || '0',
            receivedVolume: rel.received_volume || '0',
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

    // logger.debug('Graph building complete', {
    //   nodesCount: nodes.size,
    //   edgesCount: edges.size,
    //   visitedCount: visited.size
    // });

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
      suggestedWidth: Math.min(1 + Math.log10(Number(BigInt(edge.volume) / BigInt('1000000000000') + 1n)) * 2, 10),
      suggestedColor: '#2196F3',
      suggestedOpacity: 0.6 + Math.min(edge.count / 50, 0.4)
    }));

    const result = {
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

    logger.info('buildGraphData completed', {
      centerAddress,
      depth,
      totalNodes: nodeArray.length,
      totalEdges: edgeArray.length,
      nodesWithIdentity: nodeArray.filter(n => n.identity?.display).length,
      centerNodeDegree: nodes.get(centerAddress)?.degree,
      averageDegree: nodeArray.reduce((sum, n) => sum + n.degree, 0) / nodeArray.length
    });

    return result;
  }

  /**
   * Update account in database
   */
  async updateAccountInDatabase(accountInfo) {
    // logger.debug('updateAccountInDatabase called', {
    //   address: accountInfo.address,
    //   hasDatabaseDb: !!this.database?.db,
    //   hasIdentity: !!accountInfo.identity?.display
    // });

    if (!this.database?.db) {
      // logger.debug('No database connection, skipping update', {
      //   address: accountInfo.address
      // });
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

      // logger.debug('Account updated in database', {
      //   address: accountInfo.address,
      //   identityDisplay: accountInfo.identity?.display
      // });
    } catch (error) {
      logger.warn('Failed to update account in database', {
        address: accountInfo.address,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Update relationships in database
   */
  async updateRelationshipsInDatabase(address, relationships) {
    // logger.debug('updateRelationshipsInDatabase called', {
    //   address,
    //   relationshipCount: relationships.length,
    //   hasDatabaseDb: !!this.database?.db
    // });

    if (!this.database?.db) {
      // logger.debug('No database connection, skipping relationships update', {
      //   address
      // });
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

      // logger.debug('Relationships updated in database', {
      //   address,
      //   relationshipCount: relationships.length
      // });
    } catch (error) {
      logger.warn('Failed to update relationships in database', {
        address,
        error: error.message,
        stack: error.stack,
        relationshipCount: relationships.length
      });
    }
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      // logger.debug('Cache hit', {
      //   key,
      //   age: Date.now() - cached.timestamp,
      //   cacheTimeout: this.cacheTimeout
      // });
      return cached.data;
    }

    if (cached) {
      // logger.debug('Cache expired', {
      //   key,
      //   age: Date.now() - cached.timestamp,
      //   cacheTimeout: this.cacheTimeout
      // });
      this.cache.delete(key);
    } // else {
      // logger.debug('Cache miss', { key });
    // }

    return null;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
    // logger.debug('Cache set', {
    //   key,
    //   cacheSize: this.cache.size,
    //   dataType: Array.isArray(data) ? 'array' : typeof data,
    //   dataLength: Array.isArray(data) ? data.length : undefined
    // });
  }

  /**
   * Build filtered graph data with progressive loading
   * Fetches ALL connections matching filter criteria, not limited by node count
   */
  async buildFilteredGraphData(centerAddress, depth = 2, options = {}) {
    const {
      minVolume = '0',
      maxPages = 20,
      pageSize = 100,
      onProgress = null
    } = options;

    logger.info('Starting filtered graph build', {
      centerAddress,
      depth,
      minVolume: minVolume ? (BigInt(minVolume) / BigInt(10 ** 10)).toString() + ' DOT' : 'none',
      maxPages
    });

    const nodes = new Map();
    const edges = new Map();
    const visited = new Set();
    const queue = [{ address: centerAddress, currentDepth: 0 }];
    
    // Add center node
    const centerAccount = await this.getAccountData(centerAddress);
    if (!centerAccount) {
      throw new Error('Failed to fetch center account data');
    }

    nodes.set(centerAddress, {
      id: centerAddress,
      address: centerAddress,
      label: centerAccount.identity?.display || centerAddress.slice(0, 6) + '...',
      balance: centerAccount.balance,
      identity: centerAccount.identity,
      nodeType: 'center',
      degree: 0,
      depth: 0,
      riskScore: 0,
      lastActive: centerAccount.lastActive || Date.now()
    });

    let totalProgress = 0;
    const addressesToProcess = [];

    // Process queue with depth-first approach
    while (queue.length > 0) {
      const { address, currentDepth } = queue.shift();
      
      if (visited.has(address) || currentDepth >= depth) {
        continue;
      }
      
      visited.add(address);
      addressesToProcess.push({ address, currentDepth });
    }

    // Process each address with filtered fetching
    for (let i = 0; i < addressesToProcess.length; i++) {
      const { address, currentDepth } = addressesToProcess[i];
      
      // logger.debug('Processing address with filtered fetch', {
      //   address,
      //   currentDepth,
      //   progress: `${i + 1}/${addressesToProcess.length}`
      // });

      // Use the new filtered relationship fetching
      const relationships = await subscanService.getFilteredRelationships(address, {
        minVolume,
        maxPages,
        pageSize,
        onProgress: (progress) => {
          if (onProgress) {
            totalProgress++;
            onProgress({
              type: 'fetching',
              address,
              depth: currentDepth,
              ...progress,
              totalProgress,
              currentAddress: i + 1,
              totalAddresses: addressesToProcess.length
            });
          }
        }
      });

      // Process relationships
      for (const rel of relationships) {
        const connectedAddress = rel.address;

        // Add node if not exists
        if (!nodes.has(connectedAddress)) {
          const accountData = await this.getAccountData(connectedAddress);
          if (accountData) {
            nodes.set(connectedAddress, {
              id: connectedAddress,
              address: connectedAddress,
              label: accountData.identity?.display || connectedAddress.slice(0, 6) + '...',
              balance: accountData.balance,
              identity: accountData.identity,
              nodeType: 'connected',
              degree: 0,
              depth: currentDepth + 1,
              riskScore: 0,
              lastActive: accountData.lastActive || Date.now()
            });

            // Add to queue for next depth
            if (currentDepth < depth) {
              queue.push({ 
                address: connectedAddress, 
                currentDepth: currentDepth + 1 
              });
            }
          }
        }

        // Create edge
        const [source, target] = [address, connectedAddress].sort();
        const edgeId = `${source}-${target}`;

        if (!edges.has(edgeId)) {
          edges.set(edgeId, {
            id: edgeId,
            source: address,
            target: connectedAddress,
            volume: rel.totalVolume,
            count: rel.transferCount,
            edgeType: 'transfer',
            transfers: rel.transfers,
            firstTransfer: rel.firstTransfer,
            lastTransfer: rel.lastTransfer
          });
        }

        // Update node degrees
        if (nodes.has(address)) nodes.get(address).degree++;
        if (nodes.has(connectedAddress)) nodes.get(connectedAddress).degree++;
      }

      // Report completion for this address
      if (onProgress) {
        onProgress({
          type: 'completed',
          address,
          depth: currentDepth,
          foundRelationships: relationships.length,
          currentNodes: nodes.size,
          currentEdges: edges.size
        });
      }
    }

    // Convert to arrays with visual properties
    const nodeArray = Array.from(nodes.values()).map(node => ({
      ...node,
      suggestedSize: Math.min(20 + node.degree * 2, 60),
      suggestedColor: node.nodeType === 'center' ? '#e6007a' :
        node.degree > 10 ? '#f44336' : '#2196F3'
    }));

    const edgeArray = Array.from(edges.values()).map(edge => ({
      ...edge,
      suggestedWidth: Math.min(1 + Math.log10(Number(BigInt(edge.volume) / BigInt('1000000000000') + 1n)) * 2, 10),
      suggestedColor: BigInt(edge.volume) >= BigInt(minVolume) * 10n ? '#e6007a' : '#2196F3',
      suggestedOpacity: 0.6 + Math.min(edge.count / 50, 0.4)
    }));

    const result = {
      nodes: nodeArray,
      edges: edgeArray,
      metadata: {
        centerAddress,
        depth,
        totalNodes: nodeArray.length,
        totalEdges: edgeArray.length,
        dataSource: 'filtered',
        minVolume: minVolume ? (BigInt(minVolume) / BigInt(10 ** 10)).toString() + ' DOT' : 'none',
        timestamp: Date.now()
      }
    };

    logger.info('Filtered graph build completed', {
      centerAddress,
      depth,
      totalNodes: nodeArray.length,
      totalEdges: edgeArray.length,
      minVolume: result.metadata.minVolume,
      averageVolume: edgeArray.length > 0 ? 
        edgeArray.reduce((sum, e) => sum + Number(BigInt(e.volume) / BigInt(10 ** 10)), 0) / edgeArray.length + ' DOT' : 
        '0 DOT'
    });

    return result;
  }

  clearCache() {
    const previousSize = this.cache.size;
    this.cache.clear();
    // logger.debug('Cache cleared', {
    //   previousSize,
    //   newSize: this.cache.size
    // });
  }

  /**
   * Sanitize balance value to ensure it's a valid string
   * @private
   */
  _sanitizeBalanceValue(value) {
    if (value === null || value === undefined) {
      return '0';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'object') {
      // Handle nested balance objects
      if (value.free !== undefined) {
        return this._sanitizeBalanceValue(value.free);
      }
      // If it's an empty object or other invalid object, return '0'
      return '0';
    }
    // For any other type, convert to string or default to '0'
    try {
      return String(value);
    } catch (error) {
      logger.warn('Failed to sanitize balance value in RealDataService', { value, error: error.message });
      return '0';
    }
  }
}

export default RealDataService;