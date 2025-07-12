import {
  logger,
  createLogger,
  logMethodEntry,
  logMethodExit,
  logError,
  startPerformanceTimer,
  endPerformanceTimer
} from '../utils/logger.js';

const controllerLogger = createLogger('GraphController');

/**
 * GraphController - Handles graph visualization and analysis endpoints
 * Implements D3.js compatible format for all responses
 */
export class GraphController {
  constructor(databaseService, graphQueries, relationshipScorer, pathFinder, graphMetrics, realDataService) {
    const trackerId = logMethodEntry('GraphController', 'constructor');

    this.db = databaseService;
    this.graphQueries = graphQueries;
    this.relationshipScorer = relationshipScorer;
    this.pathFinder = pathFinder;
    this.graphMetrics = graphMetrics;
    this.realDataService = realDataService;

    controllerLogger.info('GraphController initialized with all services');
    logMethodExit('GraphController', 'constructor', trackerId);
  }

  /**
   * Get graph data centered around a specific address
   * GET /api/graph/:address
   */
  async getGraph(req, res) {
    const methodTrackerId = logMethodEntry('GraphController', 'getGraph', {
      address: req.params.address,
      query: req.query
    });
    const startTime = Date.now();
    const perfTimer = startPerformanceTimer('graph_generation');

    try {
      const { address } = req.params;
      const {
        depth = 2,
        maxNodes = 100,
        minVolume = '0',
        minBalance = '0',
        direction = 'both',
        layout = 'force',
        includeRiskScores = false,
        riskThreshold = null,
        nodeTypes = [],
        startTime: timeStart = null,
        endTime: timeEnd = null,
        enableClustering = false,
        clusteringAlgorithm = 'louvain'
      } = req.query;

      controllerLogger.info(`Getting graph for address ${address}`, {
        depth,
        maxNodes,
        direction,
        includeRiskScores,
        filters: {
          minVolume,
          minBalance,
          nodeTypes,
          timeRange: timeStart && timeEnd ? `${timeStart}-${timeEnd}` : 'none'
        }
      });

      // Validate address exists
      const accountLookupTimer = startPerformanceTimer('account_lookup');
      const centerAccount = this.db.getAccount(address);
      endPerformanceTimer(accountLookupTimer, 'account_lookup');

      if (!centerAccount) {
        controllerLogger.warn(`Address not found in database: ${address}`);
        logMethodExit('GraphController', 'getGraph', methodTrackerId);
        return res.status(404).json({
          error: {
            code: 'ADDRESS_NOT_FOUND',
            message: 'Address not found in database',
            status: 404,
            details: {
              address,
              expected: 'Valid Substrate address in database'
            }
          }
        });
      }

      controllerLogger.debug('Center account found', {
        address,
        balance: centerAccount.free_balance,
        type: centerAccount.type
      });

      // Parse filters
      const filters = {
        minVolume,
        minBalance,
        direction,
        nodeTypes: Array.isArray(nodeTypes) ? nodeTypes : (nodeTypes ? [nodeTypes] : []),
        timeRange: timeStart && timeEnd ? { start: timeStart, end: timeEnd } : null,
        riskThreshold: riskThreshold ? parseInt(riskThreshold) : null
      };

      // Get graph data - Try real data first if available
      let graphData;
      const graphQueryTimer = startPerformanceTimer('graph_query');

      try {
        // Check if we have real data service
        if (this.realDataService && !process.env.SKIP_BLOCKCHAIN) {
          controllerLogger.info('Using real blockchain data');
          const realDataTimer = startPerformanceTimer('real_data_fetch');

          const realGraphData = await this.realDataService.buildGraphData(address, depth, {
            maxNodes,
            minVolume,
            direction
          });

          endPerformanceTimer(realDataTimer, 'real_data_fetch');

          // Convert to expected format
          graphData = {
            nodes: realGraphData.nodes.map(n => ({
              id: n.address,
              ...n
            })),
            edges: realGraphData.edges
          };

          controllerLogger.info(`Real data retrieved: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
        } else {
          // Use database queries
          if (depth === 1) {
            controllerLogger.debug('Fetching direct connections', { address, minVolume, limit: maxNodes });
            graphData = this.graphQueries.getDirectConnections(address, {
              minVolume,
              limit: maxNodes
            });
          } else {
            controllerLogger.debug('Fetching multi-hop connections', { address, depth, minVolume, limit: maxNodes });
            graphData = this.graphQueries.getMultiHopConnections(address, depth, {
              minVolume,
              limit: maxNodes
            });
          }

          controllerLogger.info(`Graph data retrieved: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);

          // If no graph data, fallback to relationship-based graph
          if (!graphData.nodes || graphData.nodes.length === 0) {
            controllerLogger.info('No graph data from queries, falling back to relationships');
            const relationshipTimer = startPerformanceTimer('relationship_fallback');
            graphData = await this._buildGraphFromRelationships(address, { minVolume, limit: maxNodes });
            endPerformanceTimer(relationshipTimer, 'relationship_fallback');
          }
        }

        endPerformanceTimer(graphQueryTimer, 'graph_query');
      } catch (error) {
        endPerformanceTimer(graphQueryTimer, 'graph_query');
        logError(error, { context: 'graph_data_query', address, depth });
        controllerLogger.error('Error getting graph data, using relationships fallback');

        const relationshipTimer = startPerformanceTimer('relationship_fallback_error');
        graphData = await this._buildGraphFromRelationships(address, { minVolume, limit: maxNodes });
        endPerformanceTimer(relationshipTimer, 'relationship_fallback_error');
      }

      // Transform to D3.js format
      const d3Graph = await this._transformToD3Format(graphData, {
        centerAddress: address,
        includeRiskScores,
        filters,
        layout,
        enableClustering,
        clusteringAlgorithm
      });

      // Add layout parameters
      d3Graph.layout = this._generateLayoutParameters(layout, d3Graph.nodes.length);

      // Add clustering if enabled
      if (enableClustering) {
        d3Graph.clusters = await this._detectClusters(d3Graph.nodes, d3Graph.edges, clusteringAlgorithm);
      }

      // Calculate metadata
      let averageClusteringCoefficient = 0;
      try {
        averageClusteringCoefficient = await this._calculateAverageClusteringCoefficient(d3Graph.nodes);
      } catch (error) {
        controllerLogger.warn('Failed to calculate clustering coefficient', { error: error.message });
      }

      d3Graph.metadata = {
        ...d3Graph.metadata,
        totalNodes: d3Graph.nodes.length,
        totalEdges: d3Graph.edges.length,
        networkDensity: this._calculateNetworkDensity(d3Graph.nodes.length, d3Graph.edges.length),
        averageClusteringCoefficient,
        centerNode: address,
        requestedDepth: parseInt(depth),
        actualDepth: d3Graph.metadata.depth || parseInt(depth),
        hasMore: d3Graph.nodes.length >= maxNodes,
        nextCursor: d3Graph.nodes.length >= maxNodes ? this._generateCursor(d3Graph.nodes, address, parseInt(depth)) : null,
        nodesOmitted: Math.max(0, (d3Graph.metadata.totalPaths || 0) - d3Graph.nodes.length),
        edgesOmitted: 0,
        renderingComplexity: this._calculateRenderingComplexity(d3Graph.nodes.length, d3Graph.edges.length),
        suggestedLayout: this._suggestLayout(d3Graph.nodes.length, d3Graph.edges.length),
        highRiskNodeCount: d3Graph.nodes.filter(n => n.riskScore && n.riskScore > 70).length,
        suspiciousEdgeCount: d3Graph.edges.filter(e => e.suspiciousPattern).length,
        earliestTransfer: d3Graph.edges.length > 0 ? Math.min(...d3Graph.edges.map(e => e.firstTransfer || Date.now())) : null,
        latestTransfer: d3Graph.edges.length > 0 ? Math.max(...d3Graph.edges.map(e => e.lastTransfer || 0)) : null
      };

      const executionTime = Date.now() - startTime;
      logger.info(`Graph generated in ${executionTime}ms for ${address}`, {
        nodes: d3Graph.nodes.length,
        edges: d3Graph.edges.length
      });

      res.json(d3Graph);
      logMethodExit('GraphController', 'getGraph', methodTrackerId, d3Graph);

    } catch (error) {
      endPerformanceTimer(perfTimer, 'graph_generation');
      logError(error, {
        context: 'getGraph',
        address: req.params.address,
        query: req.query,
        stage: 'graph_generation'
      });
      logger.error(`Error in getGraph: ${error.message}`);

      if (error.message.includes('Depth must be between')) {
        return res.status(400).json({
          error: {
            code: 'DEPTH_LIMIT_EXCEEDED',
            message: error.message,
            status: 400
          }
        });
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error generating graph',
          status: 500
        }
      });
    }
  }

  /**
   * Find shortest path between two addresses
   * GET /api/graph/path?from=:fromAddress&to=:toAddress
   */
  async getShortestPath(req, res) {
    const startTime = Date.now();

    try {
      const { from, to, maxDepth = 4, algorithm = 'dijkstra', includeAlternatives = false } = req.query;

      if (!from || !to) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Both from and to addresses are required',
            status: 400
          }
        });
      }

      logger.info(`Finding shortest path from ${from} to ${to}`, { algorithm, maxDepth });

      // Validate addresses exist
      const fromAccount = this.db.getAccount(from);
      const toAccount = this.db.getAccount(to);

      if (!fromAccount) {
        return res.status(404).json({
          error: {
            code: 'ADDRESS_NOT_FOUND',
            message: 'From address not found in database',
            status: 404,
            details: { address: from }
          }
        });
      }

      if (!toAccount) {
        return res.status(404).json({
          error: {
            code: 'ADDRESS_NOT_FOUND',
            message: 'To address not found in database',
            status: 404,
            details: { address: to }
          }
        });
      }

      let pathResult;

      if (includeAlternatives) {
        // Find multiple paths
        const allPaths = this.pathFinder.findAllPaths(from, to, parseInt(maxDepth), 5);
        pathResult = {
          paths: allPaths.paths.map(path => ({
            path: path.path,
            length: path.hops,
            totalVolume: path.totalVolume || '0',
            bottleneckVolume: path.minEdgeVolume || '0',
            pathScore: this._calculatePathScore(path)
          })),
          metadata: {
            searchTime: allPaths.metadata.executionTime,
            nodesExplored: allPaths.metadata.pathsAnalyzed || 0,
            pathsFound: allPaths.paths.length
          }
        };
      } else {
        // Find single shortest path
        const shortestPath = this.pathFinder.findShortestPath(from, to, {
          weightType: algorithm === 'dijkstra' ? 'hops' : algorithm,
          maxDepth: parseInt(maxDepth)
        });

        if (!shortestPath.found) {
          pathResult = {
            paths: [],
            metadata: {
              searchTime: shortestPath.metadata?.executionTime || 0,
              nodesExplored: 0,
              pathsFound: 0
            }
          };
        } else {
          pathResult = {
            paths: [{
              path: shortestPath.path,
              length: shortestPath.hops,
              totalVolume: this._calculatePathTotalVolume(shortestPath.edges),
              bottleneckVolume: this._calculateBottleneckVolume(shortestPath.edges),
              pathScore: this._calculatePathScore(shortestPath)
            }],
            metadata: {
              searchTime: shortestPath.metadata.executionTime,
              nodesExplored: shortestPath.path.length,
              pathsFound: 1
            }
          };
        }
      }

      const executionTime = Date.now() - startTime;
      logger.info(`Path finding completed in ${executionTime}ms`);

      res.json(pathResult);

    } catch (error) {
      logger.error('Error in getShortestPath:', error);

      if (error.message.includes('timeout')) {
        return res.status(504).json({
          error: {
            code: 'QUERY_TIMEOUT',
            message: 'Path finding query took too long to complete',
            status: 504
          }
        });
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error finding path',
          status: 500
        }
      });
    }
  }

  /**
   * Get detailed metrics for a specific node
   * GET /api/graph/metrics/:address
   */
  async getNodeMetrics(req, res) {
    const startTime = Date.now();

    try {
      const { address } = req.params;

      logger.info(`Getting node metrics for ${address}`);

      // Validate address exists
      const account = this.db.getAccount(address);
      if (!account) {
        return res.status(404).json({
          error: {
            code: 'ADDRESS_NOT_FOUND',
            message: 'Address not found in database',
            status: 404,
            details: { address }
          }
        });
      }

      // Calculate various centrality metrics
      const degreeCentrality = this.graphMetrics.calculateDegreeCentrality(address);
      const clusteringCoefficient = this.graphMetrics.calculateClusteringCoefficient(address);

      // Get betweenness centrality (approximate)
      const betweennessResult = this.graphMetrics.calculateBetweennessCentrality([address]);
      const betweenness = betweennessResult.nodes.find(n => n.address === address)?.betweenness || 0;

      // Get PageRank (approximate)
      const pageRankResult = this.graphMetrics.calculatePageRank([address]);
      const pageRank = pageRankResult.nodes.find(n => n.address === address)?.pageRank || 0;

      // Calculate additional metrics
      const metrics = {
        degree: degreeCentrality.totalDegree,
        inDegree: degreeCentrality.inDegree,
        outDegree: degreeCentrality.outDegree,
        weightedDegree: degreeCentrality.totalVolume.toString(),
        clusteringCoefficient: clusteringCoefficient.coefficient,
        betweennessCentrality: betweenness,
        closenessCentrality: await this._calculateClosenessCentrality(address),
        eigenvectorCentrality: pageRank, // Using PageRank as approximation
        pageRank: pageRank
      };

      // Get rankings relative to other nodes
      const rankings = await this._calculateNodeRankings(address, metrics);

      // Classify node influence
      const comparisons = this._classifyNodeInfluence(metrics, rankings);

      const result = {
        address,
        metrics,
        rankings,
        comparisons
      };

      const executionTime = Date.now() - startTime;
      logger.info(`Node metrics calculated in ${executionTime}ms for ${address}`);

      res.json(result);

    } catch (error) {
      logger.error('Error in getNodeMetrics:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error calculating node metrics',
          status: 500
        }
      });
    }
  }

  /**
   * Detect suspicious patterns for an address
   * GET /api/graph/patterns/:address
   */
  async detectPatterns(req, res) {
    const startTime = Date.now();

    try {
      const { address } = req.params;
      const {
        depth = 2,
        timeWindow = 86400,
        sensitivity = 'medium'
      } = req.query;

      logger.info(`Detecting patterns for ${address}`, { depth, timeWindow, sensitivity });

      // Validate address exists
      const account = this.db.getAccount(address);
      if (!account) {
        return res.status(404).json({
          error: {
            code: 'ADDRESS_NOT_FOUND',
            message: 'Address not found in database',
            status: 404,
            details: { address }
          }
        });
      }

      const patterns = [];

      // Detect circular flows
      const circularFlows = this.graphQueries.detectCircularFlows(address, {
        maxDepth: parseInt(depth),
        minVolume: '1000000000' // 1 DOT minimum
      });

      if (circularFlows.circularPaths.length > 0) {
        patterns.push({
          type: 'circular_flow',
          confidence: 0.92,
          severity: 'high',
          description: `Funds returned to origin through ${circularFlows.circularPaths[0].path_length} hops`,
          evidence: {
            path: circularFlows.circularPaths[0].circular_path.split('->'),
            volume: circularFlows.circularPaths[0].min_volume_in_path,
            timeElapsed: 'unknown' // Would need additional temporal analysis
          },
          timestamp: Math.floor(Date.now() / 1000)
        });
      }

      // Detect rapid sequential transfers
      const rapidTransfers = await this._detectRapidTransfers(address, parseInt(timeWindow));
      if (rapidTransfers.length > 0) {
        patterns.push({
          type: 'rapid_sequential',
          confidence: 0.85,
          severity: 'medium',
          description: 'Rapid sequential transfers detected',
          evidence: {
            transferCount: rapidTransfers.length,
            timeSpan: parseInt(timeWindow),
            totalVolume: rapidTransfers.reduce((sum, t) => BigInt(sum) + BigInt(t.volume), BigInt(0)).toString(),
            addresses: rapidTransfers.map(t => t.target).slice(0, 5)
          },
          timestamp: Math.floor(Date.now() / 1000)
        });
      }

      // Detect unusual transaction amounts (round numbers)
      const roundNumberPatterns = await this._detectRoundNumberPatterns(address);
      if (roundNumberPatterns.suspiciousCount > 5) {
        patterns.push({
          type: 'round_number_pattern',
          confidence: 0.65,
          severity: 'low',
          description: 'Frequent round number transfers detected',
          evidence: {
            roundTransferCount: roundNumberPatterns.suspiciousCount,
            totalTransfers: roundNumberPatterns.totalCount,
            percentage: Math.round((roundNumberPatterns.suspiciousCount / roundNumberPatterns.totalCount) * 100)
          },
          timestamp: Math.floor(Date.now() / 1000)
        });
      }

      // Calculate overall risk assessment
      const riskAssessment = this._calculateRiskAssessment(patterns, address);

      const result = {
        address,
        patterns,
        riskAssessment
      };

      const executionTime = Date.now() - startTime;
      logger.info(`Pattern detection completed in ${executionTime}ms for ${address}`);

      res.json(result);

    } catch (error) {
      logger.error('Error in detectPatterns:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error detecting patterns',
          status: 500
        }
      });
    }
  }

  /**
   * Progressive graph expansion from cursor
   * GET /api/graph/expand
   */
  async expandGraph(req, res) {
    const startTime = Date.now();

    try {
      const { cursor, limit = 20, direction = 'outward' } = req.query;

      if (!cursor) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Cursor parameter is required',
            status: 400
          }
        });
      }

      logger.info(`Expanding graph`, { cursor: `${cursor.slice(0, 20)  }...`, limit, direction });

      // Decode cursor
      let cursorData;
      try {
        const decodedString = Buffer.from(cursor, 'base64').toString();
        controllerLogger.debug('Decoded cursor string:', decodedString);
        cursorData = JSON.parse(decodedString);
        controllerLogger.debug('Parsed cursor data:', cursorData);
      } catch (e) {
        controllerLogger.warn('Failed to decode cursor as JSON, checking if it looks like an address', {
          cursor: `${cursor.slice(0, 20)  }...`,
          error: e.message
        });

        // Check if cursor looks like a Substrate address (48+ characters, alphanumeric)
        if (cursor.length >= 48 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(cursor)) {
          controllerLogger.info('Cursor appears to be a Substrate address, treating as center address for expansion');
          // Treat as a fresh expansion from this address
          cursorData = {
            centerAddress: cursor,
            currentDepth: 1,
            lastNodes: [cursor],
            excludeNodes: []
          };
        } else {
          return res.status(400).json({
            error: {
              code: 'INVALID_CURSOR',
              message: 'Invalid cursor format - must be base64 encoded JSON or valid Substrate address',
              status: 400,
              details: {
                cursor: `${cursor.slice(0, 20)  }...`,
                error: e.message
              }
            }
          });
        }
      }

      const { centerAddress, currentDepth, lastNodes, excludeNodes = [] } = cursorData;

      // Validate cursor data structure
      if (!centerAddress || !lastNodes || !Array.isArray(lastNodes) || typeof currentDepth !== 'number') {
        controllerLogger.warn('Invalid cursor data structure', { cursorData });
        return res.status(400).json({
          error: {
            code: 'INVALID_CURSOR_DATA',
            message: 'Cursor data missing required fields: centerAddress, currentDepth, lastNodes',
            status: 400,
            details: {
              received: Object.keys(cursorData),
              expected: ['centerAddress', 'currentDepth', 'lastNodes']
            }
          }
        });
      }

      // Validate that the center address exists in the database
      const centerAccount = this.db.getAccount(centerAddress);
      if (!centerAccount) {
        controllerLogger.warn(`Center address not found in database: ${centerAddress}`);
        return res.status(404).json({
          error: {
            code: 'ADDRESS_NOT_FOUND',
            message: 'Center address not found in database',
            status: 404,
            details: {
              address: centerAddress,
              expected: 'Valid Substrate address in database'
            }
          }
        });
      }

      // Get additional connections for last nodes
      const newNodes = new Map();
      const newEdges = [];
      const processedAddresses = new Set(excludeNodes);

      controllerLogger.info('Starting graph expansion', {
        centerAddress,
        currentDepth,
        lastNodesCount: lastNodes.length,
        excludeNodesCount: excludeNodes.length,
        direction
      });

      for (const nodeAddress of lastNodes.slice(0, 5)) { // Limit expansion points
        if (processedAddresses.has(nodeAddress)) {
          controllerLogger.debug(`Skipping already processed address: ${nodeAddress}`);
          continue;
        }

        controllerLogger.debug(`Getting connections for: ${nodeAddress}`);
        const connections = this.graphQueries.getDirectConnections(nodeAddress, {
          minVolume: '0',
          limit: Math.ceil(parseInt(limit) / lastNodes.length)
        });

        controllerLogger.debug(`Found ${connections.nodes.length} nodes and ${connections.edges.length} edges for ${nodeAddress}`);

        connections.nodes.forEach(node => {
          if (!processedAddresses.has(node.address) && node.address !== centerAddress) {
            newNodes.set(node.address, {
              ...node,
              hopLevel: currentDepth + 1
            });
          }
        });

        connections.edges.forEach(edge => {
          if (!excludeNodes.includes(edge.target) && edge.target !== centerAddress) {
            newEdges.push(edge);
          }
        });

        processedAddresses.add(nodeAddress);
      }

      // Limit results
      const limitedNodes = Array.from(newNodes.values()).slice(0, parseInt(limit));
      const nodeAddresses = new Set(limitedNodes.map(n => n.address));
      const filteredEdges = newEdges.filter(e => nodeAddresses.has(e.target));

      // Generate next cursor if there are more nodes
      const hasMore = newNodes.size > parseInt(limit);
      const nextCursor = hasMore ? this._generateExpansionCursor({
        centerAddress,
        currentDepth: currentDepth + 1,
        lastNodes: limitedNodes.map(n => n.address),
        excludeNodes: [...excludeNodes, ...limitedNodes.map(n => n.address)]
      }) : null;

      const result = {
        nodes: limitedNodes,
        edges: filteredEdges,
        removals: {
          nodes: [],
          edges: []
        },
        metadata: {
          addedNodes: limitedNodes.length,
          addedEdges: filteredEdges.length,
          hasMore,
          nextCursor
        }
      };

      const executionTime = Date.now() - startTime;
      controllerLogger.info(`Graph expansion completed in ${executionTime}ms`, {
        addedNodes: limitedNodes.length,
        addedEdges: filteredEdges.length,
        hasMore,
        nextCursor: nextCursor ? `${nextCursor.slice(0, 20)  }...` : null
      });

      res.json(result);

    } catch (error) {
      logger.error('Error in expandGraph:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error expanding graph',
          status: 500
        }
      });
    }
  }

  // Helper methods

  /**
   * Transform graph data to D3.js format
   * @private
   */
  async _transformToD3Format(graphData, options) {
    const { includeRiskScores } = options;

    // Transform nodes
    const d3Nodes = await Promise.all(graphData.nodes.map(async (node) => {
      const d3Node = {
        // Core properties
        address: node.address,

        // Identity data
        identity: node.identity ? {
          display: node.identity,
          isConfirmed: true,
          isInvalid: false
        } : null,

        // Balance information
        balance: node.balance ? {
          free: node.balance,
          reserved: '0',
          frozen: '0'
        } : null,

        // Enhanced properties
        nodeType: node.nodeType || 'regular',

        // Graph metrics
        degree: node.metrics?.degree || 0,
        inDegree: node.metrics?.inDegree || 0,
        outDegree: node.metrics?.outDegree || 0,
        totalVolume: node.metrics?.totalVolume || '0',

        // Visual hints
        suggestedSize: this._calculateNodeSize(node),
        suggestedColor: this._getNodeColor(node),

        // Temporal data
        firstSeen: Math.floor(Date.now() / 1000), // Placeholder
        lastActive: Math.floor(Date.now() / 1000) // Placeholder
      };

      // Add risk data if requested
      if (includeRiskScores) {
        d3Node.riskScore = node.riskScore || 0;
        d3Node.riskFactors = node.riskFactors || [];
        d3Node.importanceScore = 100 - (node.riskScore || 0);
      }

      return d3Node;
    }));

    // Transform edges
    const d3Edges = graphData.edges.map((edge, index) => ({
      id: edge.id || `edge_${index}`,
      source: edge.source,
      target: edge.target,
      count: edge.transferCount || 1,
      volume: edge.volume || '0',

      // Edge type
      edgeType: 'transfer',

      // Temporal data
      firstTransfer: edge.firstTransferTime || Math.floor(Date.now() / 1000),
      lastTransfer: edge.lastTransferTime || Math.floor(Date.now() / 1000),

      // Risk indicators
      suspiciousPattern: false,
      patternType: null,

      // Visual hints
      suggestedWidth: this._calculateEdgeWidth(edge),
      suggestedColor: '#2196F3',
      suggestedOpacity: 0.8,
      animated: false,

      // Direction hints
      bidirectional: false,
      dominantDirection: 'forward'
    }));

    return {
      nodes: d3Nodes,
      edges: d3Edges,
      metadata: graphData.metadata
    };
  }

  /**
   * Generate layout parameters based on graph size and type
   * @private
   */
  _generateLayoutParameters(layout, nodeCount) {
    const baseForceParams = {
      chargeStrength: -5000,
      linkDistance: 400,
      linkStrength: 0.8,
      centerX: 500,
      centerY: 500
    };

    // Adjust parameters based on node count
    if (nodeCount > 100) {
      baseForceParams.chargeStrength = -8000;
      baseForceParams.linkDistance = 300;
    } else if (nodeCount < 20) {
      baseForceParams.chargeStrength = -3000;
      baseForceParams.linkDistance = 500;
    }

    return {
      forceParameters: baseForceParams,
      fixedPositions: {}
    };
  }

  /**
   * Calculate network density
   * @private
   */
  _calculateNetworkDensity(nodeCount, edgeCount) {
    if (nodeCount <= 1) {
      return 0;
    }
    const maxPossibleEdges = nodeCount * (nodeCount - 1);
    return edgeCount / maxPossibleEdges;
  }

  /**
   * Calculate average clustering coefficient
   * @private
   */
  async _calculateAverageClusteringCoefficient(nodes) {
    // Sample a few nodes for performance
    const sampleSize = Math.min(10, nodes.length);
    const sampleNodes = nodes.slice(0, sampleSize);

    let totalCoefficient = 0;
    let validNodes = 0;

    for (const node of sampleNodes) {
      try {
        const clustering = this.graphMetrics.calculateClusteringCoefficient(node.address);
        totalCoefficient += clustering.coefficient;
        validNodes++;
      } catch (e) {
        // Skip node if calculation fails
        continue;
      }
    }

    return validNodes > 0 ? totalCoefficient / validNodes : 0;
  }

  /**
   * Detect clusters in the graph
   * @private
   */
  async _detectClusters(nodes, edges, algorithm) {
    try {
      const addresses = nodes.map(n => n.address);
      const communityResult = this.graphMetrics.detectCommunities(addresses, algorithm);

      return communityResult.communities.map((community, index) => ({
        clusterId: `cluster_${algorithm}_${index}`,
        nodes: community.members,
        internalEdges: 0, // Would need to calculate
        externalEdges: 0, // Would need to calculate
        density: 0.8, // Placeholder
        totalVolume: '0', // Would need to calculate
        clusterType: 'detected',
        riskLevel: 'low',
        suggestedColor: this._getClusterColor(index),
        boundingBox: {
          minX: 0,
          minY: 0,
          maxX: 100,
          maxY: 100
        }
      }));
    } catch (error) {
      logger.warn('Error detecting clusters:', error);
      return [];
    }
  }

  /**
   * Calculate rendering complexity hint
   * @private
   */
  _calculateRenderingComplexity(nodeCount, edgeCount) {
    const totalElements = nodeCount + edgeCount;
    if (totalElements < 50) {
      return 'low';
    }
    if (totalElements < 200) {
      return 'medium';
    }
    return 'high';
  }

  /**
   * Suggest optimal layout based on graph characteristics
   * @private
   */
  _suggestLayout(nodeCount, edgeCount) {
    const density = this._calculateNetworkDensity(nodeCount, edgeCount);

    if (nodeCount < 20) {
      return 'circular';
    }
    if (density > 0.1) {
      return 'hierarchical';
    }
    return 'force';
  }

  /**
   * Generate cursor for pagination
   * @private
   */
  _generateCursor(nodes, centerAddress, currentDepth = 2) {
    const cursorData = {
      centerAddress,
      currentDepth,
      lastNodes: nodes.slice(-Math.min(5, nodes.length)).map(n => n.address || n.id),
      excludeNodes: nodes.map(n => n.address || n.id)
    };
    return Buffer.from(JSON.stringify(cursorData)).toString('base64');
  }

  /**
   * Generate expansion cursor
   * @private
   */
  _generateExpansionCursor(data) {
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  /**
   * Calculate path score
   * @private
   */
  _calculatePathScore(path) {
    // Score based on hop count, volume, and recency
    const hopPenalty = path.hops * 10;
    const volumeBonus = Math.min(50, Math.log10(Number(BigInt(path.totalVolume || '0')) / 1e12) * 10);
    return Math.max(0, 100 - hopPenalty + volumeBonus);
  }

  /**
   * Calculate total volume for a path
   * @private
   */
  _calculatePathTotalVolume(edges) {
    return edges.reduce((sum, edge) => BigInt(sum) + BigInt(edge.volume || '0'), BigInt(0)).toString();
  }

  /**
   * Calculate bottleneck volume (minimum edge volume)
   * @private
   */
  _calculateBottleneckVolume(edges) {
    if (edges.length === 0) {
      return '0';
    }
    return edges.reduce((min, edge) => {
      const vol = BigInt(edge.volume || '0');
      return min === null || vol < min ? vol : min;
    }, null).toString();
  }

  /**
   * Calculate node size for visualization
   * @private
   */
  _calculateNodeSize(node) {
    const baseSize = 40;
    const degree = node.metrics?.degree || 0;
    return Math.min(120, baseSize + degree * 2);
  }

  /**
   * Get node color based on type and properties
   * @private
   */
  _getNodeColor(node) {
    switch (node.nodeType) {
      case 'exchange': return '#FF5722';
      case 'validator': return '#4CAF50';
      case 'mixer': return '#F44336';
      case 'center': return '#2196F3';
      default: return '#9E9E9E';
    }
  }

  /**
   * Calculate edge width for visualization
   * @private
   */
  _calculateEdgeWidth(edge) {
    // Handle edge volume safely - BigInt cannot handle decimals
    let volumeStr = edge.volume || '0';

    // If volume is a number, convert to string
    if (typeof volumeStr === 'number') {
      volumeStr = Math.floor(volumeStr).toString();
    }

    // Remove decimal part if present
    if (volumeStr.includes('.')) {
      volumeStr = volumeStr.split('.')[0];
    }

    const volume = Number(BigInt(volumeStr)) / 1e12; // Convert to DOT
    return Math.min(10, Math.max(1, Math.log10(volume + 1) * 2));
  }

  /**
   * Get cluster color
   * @private
   */
  _getClusterColor(index) {
    const colors = ['#E8F5E9', '#E3F2FD', '#FFF3E0', '#F3E5F5', '#E0F2F1'];
    return colors[index % colors.length];
  }

  /**
   * Calculate closeness centrality approximation
   * @private
   */
  async _calculateClosenessCentrality(_address) {
    // Simplified calculation - would need shortest paths to all nodes
    return 0.0156; // Placeholder
  }

  /**
   * Calculate node rankings
   * @private
   */
  async _calculateNodeRankings(_address, _metrics) {
    // This would require comparing with all other nodes
    // For now, return placeholders
    return {
      degreeRank: 12,
      volumeRank: 8,
      betweennessRank: 34,
      pageRankRank: 15
    };
  }

  /**
   * Classify node influence
   * @private
   */
  _classifyNodeInfluence(metrics, rankings) {
    const avgRank = Object.values(rankings).reduce((a, b) => a + b, 0) / Object.values(rankings).length;

    let category, influence;
    if (avgRank <= 20) {
      category = 'hub';
      influence = 'high';
    } else if (avgRank <= 50) {
      category = 'connector';
      influence = 'medium';
    } else {
      category = 'peripheral';
      influence = 'low';
    }

    return {
      percentile: Math.max(1, 100 - avgRank),
      category,
      influence
    };
  }

  /**
   * Detect rapid transfers
   * @private
   */
  async _detectRapidTransfers(address, timeWindow) {
    const stmt = this.db.db.prepare(`
      SELECT 
        t1.to_address as target,
        t1.value as volume,
        t1.timestamp,
        COUNT(*) as rapid_count
      FROM transfers t1
      JOIN transfers t2 ON t1.from_address = t2.from_address
      WHERE t1.from_address = ?
        AND ABS(julianday(t2.timestamp) - julianday(t1.timestamp)) * 24 * 60 * 60 <= ?
        AND t1.id != t2.id
      GROUP BY t1.to_address, t1.value, t1.timestamp
      HAVING rapid_count >= 3
      ORDER BY t1.timestamp DESC
      LIMIT 10
    `);

    return stmt.all(address, timeWindow);
  }

  /**
   * Detect round number patterns
   * @private
   */
  async _detectRoundNumberPatterns(address) {
    const stmt = this.db.db.prepare(`
      SELECT 
        COUNT(*) as total_count,
        SUM(
          CASE WHEN 
            CAST(value AS REAL) % 1000000000000 = 0 OR
            CAST(value AS REAL) % 10000000000000 = 0 OR
            CAST(value AS REAL) % 100000000000000 = 0
          THEN 1 ELSE 0 END
        ) as suspicious_count
      FROM transfers
      WHERE from_address = ?
    `);

    return stmt.get(address) || { total_count: 0, suspicious_count: 0 };
  }

  /**
   * Calculate risk assessment
   * @private
   */
  _calculateRiskAssessment(patterns, _address) {
    const weights = {
      'circular_flow': 30,
      'rapid_sequential': 20,
      'round_number_pattern': 10
    };

    let overallRisk = 0;
    const riskFactors = [];

    patterns.forEach(pattern => {
      const weight = weights[pattern.type] || 5;
      const contribution = weight * pattern.confidence;
      overallRisk += contribution;

      riskFactors.push(pattern.type);
    });

    // Cap at 100
    overallRisk = Math.min(100, overallRisk);

    let recommendation;
    if (overallRisk < 30) {
      recommendation = 'monitor';
    } else if (overallRisk < 70) {
      recommendation = 'investigate';
    } else {
      recommendation = 'flag_for_review';
    }

    return {
      overallRisk: Math.round(overallRisk),
      riskFactors,
      recommendation
    };
  }

  /**
   * Build graph data from relationships API as fallback
   * @private
   */
  async _buildGraphFromRelationships(address, options = {}) {
    const { minVolume = '0', limit = 100 } = options;

    try {
      logger.info(`Building graph from relationships for ${address}`);

      // Get relationships using the same method as the relationships API
      const relationships = this.db.getRelationships(address, {
        depth: 1,
        minVolume,
        limit
      });

      const nodes = new Map();
      const edges = [];

      // Add center node
      const centerAccount = this.db.getAccount(address);
      nodes.set(address, {
        id: address,
        address: address,
        identity: centerAccount?.identity_display,
        balance: centerAccount?.balance,
        nodeType: 'center',
        hopLevel: 0,
        metrics: {
          degree: relationships.length,
          totalVolume: relationships.reduce((sum, rel) =>
            BigInt(sum) + BigInt(rel.total_volume || '0'), BigInt(0)).toString()
        }
      });

      // Add connected nodes and edges
      relationships.forEach((rel, _index) => {
        const connectedAddr = rel.connected_address;

        // Add connected node
        if (!nodes.has(connectedAddr)) {
          const connectedAccount = this.db.getAccount(connectedAddr);
          nodes.set(connectedAddr, {
            id: connectedAddr,
            address: connectedAddr,
            identity: connectedAccount?.identity_display,
            balance: connectedAccount?.balance,
            nodeType: 'regular',
            hopLevel: 1,
            riskScore: rel.risk_score || 0,
            metrics: {
              relationshipScore: 50 // Default score
            }
          });
        }

        // Add edge
        edges.push({
          id: `${address}->${connectedAddr}`,
          source: address,
          target: connectedAddr,
          volume: rel.total_volume,
          transferCount: rel.outgoing_count + rel.incoming_count,
          firstTransferTime: rel.first_interaction,
          lastTransferTime: rel.last_interaction,
          relationshipScore: 50, // Default score
          direction: rel.outgoing_count > rel.incoming_count ? 'outgoing' : 'incoming'
        });
      });

      logger.info(`Built graph from relationships: ${nodes.size} nodes, ${edges.length} edges`);

      return {
        nodes: Array.from(nodes.values()),
        edges: edges,
        metadata: {
          centerAddress: address,
          depth: 1,
          source: 'relationships'
        }
      };

    } catch (error) {
      logger.error('Error building graph from relationships:', error);
      return {
        nodes: [],
        edges: [],
        metadata: {
          error: error.message
        }
      };
    }
  }
}