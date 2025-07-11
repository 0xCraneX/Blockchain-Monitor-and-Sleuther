import { logger } from '../utils/logger.js';

/**
 * Advanced path finding service with multiple algorithms
 * for analyzing blockchain transaction networks
 */
export class PathFinder {
  constructor(databaseService, graphQueries) {
    this.db = databaseService?.db;
    this.databaseService = databaseService;
    this.graphQueries = graphQueries;
    
    if (!this.db) {
      throw new Error('Database service is required for PathFinder');
    }
    
    // Prepare commonly used statements
    this.prepareStatements();
  }

  prepareStatements() {
    // Get all outgoing edges for an address
    this.outgoingEdgesStmt = this.db.prepare(`
      SELECT 
        ar.to_address,
        ar.total_volume,
        ar.transfer_count,
        ar.first_transfer_time,
        ar.last_transfer_time,
        COALESCE(rs.total_score, 0) as relationship_score
      FROM account_relationships ar
      LEFT JOIN relationship_scores rs ON rs.from_address = ar.from_address AND rs.to_address = ar.to_address
      WHERE ar.from_address = ?
    `);
    
    // Get all incoming edges for an address
    this.incomingEdgesStmt = this.db.prepare(`
      SELECT 
        ar.from_address,
        ar.total_volume,
        ar.transfer_count,
        ar.first_transfer_time,
        ar.last_transfer_time,
        COALESCE(rs.total_score, 0) as relationship_score
      FROM account_relationships ar
      LEFT JOIN relationship_scores rs ON rs.from_address = ar.from_address AND rs.to_address = ar.to_address
      WHERE ar.to_address = ?
    `);
    
    // Get edge details between two addresses
    this.edgeDetailsStmt = this.db.prepare(`
      SELECT 
        ar.total_volume,
        ar.transfer_count,
        ar.first_transfer_time,
        ar.last_transfer_time,
        COALESCE(rs.total_score, 0) as relationship_score,
        COALESCE(nm1.risk_score, 0) as from_risk_score,
        COALESCE(nm2.risk_score, 0) as to_risk_score
      FROM account_relationships ar
      LEFT JOIN relationship_scores rs ON rs.from_address = ar.from_address AND rs.to_address = ar.to_address
      LEFT JOIN node_metrics nm1 ON nm1.address = ar.from_address
      LEFT JOIN node_metrics nm2 ON nm2.address = ar.to_address
      WHERE ar.from_address = ? AND ar.to_address = ?
    `);
  }

  /**
   * Find shortest path using Dijkstra's algorithm with custom edge weights
   * @param {string} from - Starting address
   * @param {string} to - Target address
   * @param {Object} options - Path finding options
   * @returns {Object} Path information or null if no path exists
   */
  findShortestPath(from, to, options = {}) {
    const startTime = Date.now();
    const {
      weightType = 'hops', // 'hops', 'volume', 'risk', 'time'
      maxDepth = 6,
      minVolume = '0'
    } = options;
    
    try {
      logger.info(`Finding shortest path from ${from} to ${to}`, { weightType, maxDepth });
      
      // Check if from and to are the same
      if (from === to) {
        return {
          found: true,
          path: [from],
          cost: 0,
          hops: 0,
          metadata: { executionTime: 0 }
        };
      }
      
      // Initialize data structures
      const distances = new Map();
      const previous = new Map();
      const visited = new Set();
      const queue = new Map(); // Using Map as priority queue
      
      // Initialize starting node
      distances.set(from, 0);
      queue.set(from, 0);
      
      while (queue.size > 0 && !visited.has(to)) {
        // Find node with minimum distance
        let current = null;
        let minDist = Infinity;
        for (const [node, dist] of queue) {
          if (dist < minDist) {
            current = node;
            minDist = dist;
          }
        }
        
        if (!current) break;
        
        // Remove from queue and mark as visited
        queue.delete(current);
        visited.add(current);
        
        // Check depth limit
        const currentDepth = this._getPathDepth(previous, current);
        if (currentDepth >= maxDepth) continue;
        
        // Get neighbors
        const edges = this.outgoingEdgesStmt.all(current);
        
        for (const edge of edges) {
          const neighbor = edge.to_address;
          
          // Skip if already visited or volume too low
          if (visited.has(neighbor) || BigInt(edge.total_volume) < BigInt(minVolume)) {
            continue;
          }
          
          // Calculate edge weight based on type
          const edgeWeight = this._calculateEdgeWeight(edge, weightType);
          const altDistance = distances.get(current) + edgeWeight;
          
          // Update distance if shorter path found
          if (!distances.has(neighbor) || altDistance < distances.get(neighbor)) {
            distances.set(neighbor, altDistance);
            previous.set(neighbor, current);
            queue.set(neighbor, altDistance);
          }
        }
      }
      
      // Check if path exists
      if (!distances.has(to)) {
        return {
          found: false,
          message: `No path found from ${from} to ${to} within ${maxDepth} hops`
        };
      }
      
      // Reconstruct path
      const path = this._reconstructPath(previous, to);
      
      // Build detailed path information
      const pathDetails = this._buildPathDetails(path);
      
      const executionTime = Date.now() - startTime;
      logger.info(`Shortest path found in ${executionTime}ms`, {
        pathLength: path.length,
        cost: distances.get(to)
      });
      
      return {
        found: true,
        path: path,
        cost: distances.get(to),
        hops: path.length - 1,
        edges: pathDetails.edges,
        nodes: pathDetails.nodes,
        metadata: {
          executionTime,
          algorithm: 'dijkstra',
          weightType
        }
      };
      
    } catch (error) {
      logger.error('Error finding shortest path', error);
      throw error;
    }
  }

  /**
   * Find all paths between two addresses up to a maximum depth
   * @param {string} from - Starting address
   * @param {string} to - Target address
   * @param {number} maxDepth - Maximum path depth
   * @param {number} maxPaths - Maximum number of paths to return
   * @returns {Array} Array of paths found
   */
  findAllPaths(from, to, maxDepth = 4, maxPaths = 100) {
    const startTime = Date.now();
    
    try {
      logger.info(`Finding all paths from ${from} to ${to}`, { maxDepth, maxPaths });
      
      const paths = [];
      const currentPath = [];
      const visited = new Set();
      
      // DFS to find all paths
      const dfs = (current, depth) => {
        if (paths.length >= maxPaths) return;
        
        currentPath.push(current);
        visited.add(current);
        
        if (current === to && currentPath.length > 1) {
          // Found a path
          paths.push({
            path: [...currentPath],
            hops: currentPath.length - 1
          });
        } else if (depth < maxDepth) {
          // Continue searching
          const edges = this.outgoingEdgesStmt.all(current);
          
          for (const edge of edges) {
            const neighbor = edge.to_address;
            if (!visited.has(neighbor)) {
              dfs(neighbor, depth + 1);
            }
          }
        }
        
        // Backtrack
        currentPath.pop();
        visited.delete(current);
      };
      
      // Start DFS
      dfs(from, 0);
      
      // Sort paths by length
      paths.sort((a, b) => a.hops - b.hops);
      
      // Add details to each path
      const detailedPaths = paths.map(p => {
        const details = this._buildPathDetails(p.path);
        return {
          ...p,
          ...details,
          totalVolume: this._calculatePathVolume(p.path),
          minEdgeVolume: this._calculateMinEdgeVolume(p.path)
        };
      });
      
      const executionTime = Date.now() - startTime;
      logger.info(`Found ${paths.length} paths in ${executionTime}ms`);
      
      return {
        paths: detailedPaths,
        metadata: {
          executionTime,
          totalPathsFound: paths.length,
          maxDepth,
          maxPaths
        }
      };
      
    } catch (error) {
      logger.error('Error finding all paths', error);
      throw error;
    }
  }

  /**
   * Find paths with minimum volume constraints
   * @param {string} from - Starting address
   * @param {string} to - Target address
   * @param {string} minVolume - Minimum volume for path edges
   * @returns {Array} High value paths
   */
  findHighValuePaths(from, to, minVolume) {
    const startTime = Date.now();
    
    try {
      logger.info(`Finding high value paths from ${from} to ${to}`, { minVolume });
      
      // Use SQL for efficient high-volume path finding
      const highValueQuery = this.db.prepare(`
        WITH RECURSIVE high_value_paths AS (
          SELECT 
            from_address,
            to_address,
            1 as hop_count,
            CAST(from_address || '->' || to_address AS TEXT) as path,
            total_volume,
            total_volume as min_edge_volume
          FROM account_relationships
          WHERE from_address = ?
            AND total_volume >= CAST(? AS INTEGER)
          
          UNION ALL
          
          SELECT 
            hvp.from_address,
            ar.to_address,
            hvp.hop_count + 1,
            hvp.path || '->' || ar.to_address,
            CAST(hvp.total_volume AS INTEGER) + CAST(ar.total_volume AS INTEGER),
            MIN(hvp.min_edge_volume, ar.total_volume)
          FROM account_relationships ar
          JOIN high_value_paths hvp ON ar.from_address = hvp.to_address
          WHERE hvp.hop_count < 5
            AND ar.total_volume >= CAST(? AS INTEGER)
            AND hvp.path NOT LIKE '%' || ar.to_address || '%'
            AND ar.to_address = ?
        )
        SELECT 
          path,
          hop_count,
          total_volume,
          min_edge_volume
        FROM high_value_paths
        WHERE to_address = ?
        ORDER BY min_edge_volume DESC, hop_count ASC
        LIMIT 20
      `);
      
      const results = highValueQuery.all(from, minVolume, minVolume, to, to);
      
      // Convert SQL results to detailed path objects
      const paths = results.map(result => {
        const pathAddresses = result.path.split('->');
        const details = this._buildPathDetails(pathAddresses);
        
        return {
          path: pathAddresses,
          hops: result.hop_count,
          totalVolume: result.total_volume,
          minEdgeVolume: result.min_edge_volume,
          ...details
        };
      });
      
      const executionTime = Date.now() - startTime;
      logger.info(`Found ${paths.length} high value paths in ${executionTime}ms`);
      
      return {
        paths,
        metadata: {
          executionTime,
          minVolume,
          pathsFound: paths.length
        }
      };
      
    } catch (error) {
      logger.error('Error finding high value paths', error);
      throw error;
    }
  }

  /**
   * Find paths optimized for time (most recent activity)
   * @param {string} from - Starting address
   * @param {string} to - Target address
   * @param {number} timeWindow - Time window in seconds
   * @returns {Array} Time-optimized paths
   */
  findQuickestPaths(from, to, timeWindow) {
    const startTime = Date.now();
    const cutoffTime = Math.floor(Date.now() / 1000) - timeWindow;
    
    try {
      logger.info(`Finding quickest paths from ${from} to ${to}`, { timeWindow });
      
      // Modified Dijkstra prioritizing recent edges
      const distances = new Map();
      const previous = new Map();
      const visited = new Set();
      const queue = new Map();
      
      distances.set(from, 0);
      queue.set(from, 0);
      
      while (queue.size > 0 && !visited.has(to)) {
        // Find node with minimum time cost
        let current = null;
        let minCost = Infinity;
        for (const [node, cost] of queue) {
          if (cost < minCost) {
            current = node;
            minCost = cost;
          }
        }
        
        if (!current) break;
        
        queue.delete(current);
        visited.add(current);
        
        // Get recent edges only
        const edges = this.outgoingEdgesStmt.all(current);
        const recentEdges = edges.filter(e => e.last_transfer_time >= cutoffTime);
        
        for (const edge of recentEdges) {
          const neighbor = edge.to_address;
          
          if (visited.has(neighbor)) continue;
          
          // Time-based weight (prefer more recent edges)
          const timeCost = Math.max(1, (Date.now() / 1000 - edge.last_transfer_time) / 3600); // Hours ago
          const altCost = distances.get(current) + timeCost;
          
          if (!distances.has(neighbor) || altCost < distances.get(neighbor)) {
            distances.set(neighbor, altCost);
            previous.set(neighbor, current);
            queue.set(neighbor, altCost);
          }
        }
      }
      
      const paths = [];
      
      // If path found, reconstruct it
      if (distances.has(to)) {
        const path = this._reconstructPath(previous, to);
        const details = this._buildPathDetails(path);
        
        paths.push({
          path,
          hops: path.length - 1,
          timeCost: distances.get(to),
          ...details,
          lastActivity: this._getPathLastActivity(path)
        });
      }
      
      // Also find alternative recent paths
      const allPaths = this.findAllPaths(from, to, 4, 10);
      const recentPaths = allPaths.paths.filter(p => {
        const lastActivity = this._getPathLastActivity(p.path);
        return lastActivity >= cutoffTime;
      });
      
      // Combine and deduplicate
      const uniquePaths = new Map();
      [...paths, ...recentPaths].forEach(p => {
        const key = p.path.join('->');
        if (!uniquePaths.has(key)) {
          uniquePaths.set(key, p);
        }
      });
      
      const finalPaths = Array.from(uniquePaths.values())
        .sort((a, b) => b.lastActivity - a.lastActivity);
      
      const executionTime = Date.now() - startTime;
      logger.info(`Found ${finalPaths.length} quickest paths in ${executionTime}ms`);
      
      return {
        paths: finalPaths,
        metadata: {
          executionTime,
          timeWindow,
          cutoffTime,
          pathsFound: finalPaths.length
        }
      };
      
    } catch (error) {
      logger.error('Error finding quickest paths', error);
      throw error;
    }
  }

  /**
   * Analyze risk factors for a given path
   * @param {Array} path - Array of addresses forming the path
   * @returns {Object} Risk analysis
   */
  analyzePathRisk(path) {
    const startTime = Date.now();
    
    try {
      logger.info(`Analyzing risk for path of length ${path.length}`);
      
      const riskFactors = {
        nodeRisks: [],
        edgeRisks: [],
        totalRisk: 0,
        maxNodeRisk: 0,
        avgNodeRisk: 0,
        suspiciousPatterns: []
      };
      
      // Analyze each node
      for (const address of path) {
        const nodeMetrics = this.db.prepare(`
          SELECT 
            COALESCE(risk_score, 0) as risk_score,
            COALESCE(node_type, 'regular') as node_type,
            COALESCE(suspicious_patterns, '[]') as patterns
          FROM node_metrics
          WHERE address = ?
        `).get(address);
        
        const risk = nodeMetrics?.risk_score || 0;
        riskFactors.nodeRisks.push({
          address,
          risk,
          nodeType: nodeMetrics?.node_type || 'regular',
          patterns: JSON.parse(nodeMetrics?.patterns || '[]')
        });
        
        riskFactors.maxNodeRisk = Math.max(riskFactors.maxNodeRisk, risk);
        
        // Check for suspicious patterns
        if (nodeMetrics?.node_type === 'mixer' || nodeMetrics?.node_type === 'exchange') {
          riskFactors.suspiciousPatterns.push({
            type: 'high_risk_node',
            address,
            nodeType: nodeMetrics.node_type
          });
        }
      }
      
      // Analyze edges
      for (let i = 0; i < path.length - 1; i++) {
        const edge = this.edgeDetailsStmt.get(path[i], path[i + 1]);
        
        if (edge) {
          const edgeRisk = this._calculateEdgeRisk(edge);
          riskFactors.edgeRisks.push({
            from: path[i],
            to: path[i + 1],
            risk: edgeRisk,
            volume: edge.total_volume,
            transferCount: edge.transfer_count
          });
          
          // Check for suspicious edge patterns
          if (edge.transfer_count === 1 && BigInt(edge.total_volume) > BigInt('1000000000000')) {
            riskFactors.suspiciousPatterns.push({
              type: 'large_single_transfer',
              from: path[i],
              to: path[i + 1],
              volume: edge.total_volume
            });
          }
        }
      }
      
      // Calculate aggregate risks
      riskFactors.avgNodeRisk = riskFactors.nodeRisks.reduce((sum, n) => sum + n.risk, 0) / riskFactors.nodeRisks.length;
      riskFactors.totalRisk = this._calculateTotalPathRisk(riskFactors);
      
      // Classify risk level
      riskFactors.riskLevel = this._classifyRiskLevel(riskFactors.totalRisk);
      
      const executionTime = Date.now() - startTime;
      logger.info(`Path risk analysis completed in ${executionTime}ms`, {
        riskLevel: riskFactors.riskLevel,
        totalRisk: riskFactors.totalRisk
      });
      
      return {
        ...riskFactors,
        metadata: {
          executionTime,
          pathLength: path.length
        }
      };
      
    } catch (error) {
      logger.error('Error analyzing path risk', error);
      throw error;
    }
  }

  /**
   * Find nodes that appear in most paths between two addresses
   * @param {string} from - Starting address
   * @param {string} to - Target address
   * @returns {Array} Critical nodes sorted by importance
   */
  findCriticalNodes(from, to) {
    const startTime = Date.now();
    
    try {
      logger.info(`Finding critical nodes between ${from} and ${to}`);
      
      // Find multiple paths
      const pathsResult = this.findAllPaths(from, to, 5, 100);
      const paths = pathsResult.paths;
      
      if (paths.length === 0) {
        return {
          criticalNodes: [],
          metadata: {
            executionTime: Date.now() - startTime,
            pathsAnalyzed: 0
          }
        };
      }
      
      // Count node appearances
      const nodeFrequency = new Map();
      const nodePathParticipation = new Map();
      
      paths.forEach((pathObj, pathIndex) => {
        const path = pathObj.path;
        // Skip first and last nodes (from and to)
        for (let i = 1; i < path.length - 1; i++) {
          const node = path[i];
          
          // Update frequency
          nodeFrequency.set(node, (nodeFrequency.get(node) || 0) + 1);
          
          // Track which paths this node participates in
          if (!nodePathParticipation.has(node)) {
            nodePathParticipation.set(node, new Set());
          }
          nodePathParticipation.get(node).add(pathIndex);
        }
      });
      
      // Calculate criticality metrics
      const criticalNodes = [];
      
      for (const [node, frequency] of nodeFrequency) {
        const participationRate = frequency / paths.length;
        const pathIndices = Array.from(nodePathParticipation.get(node));
        
        // Get node details
        const nodeMetrics = this.db.prepare(`
          SELECT 
            COALESCE(degree, 0) as degree,
            COALESCE(betweenness_centrality, 0) as betweenness,
            COALESCE(node_type, 'regular') as node_type
          FROM node_metrics
          WHERE address = ?
        `).get(node);
        
        // Check if removing this node would disconnect the graph
        const alternativePaths = this._findPathsAvoidingNode(from, to, node, 3);
        const isCritical = alternativePaths.length === 0;
        
        criticalNodes.push({
          address: node,
          frequency,
          participationRate,
          pathsParticipatedIn: pathIndices.length,
          degree: nodeMetrics?.degree || 0,
          betweenness: nodeMetrics?.betweenness || 0,
          nodeType: nodeMetrics?.node_type || 'regular',
          isCritical,
          criticalityScore: this._calculateCriticalityScore({
            participationRate,
            isCritical,
            degree: nodeMetrics?.degree || 0,
            betweenness: nodeMetrics?.betweenness || 0
          })
        });
      }
      
      // Sort by criticality score
      criticalNodes.sort((a, b) => b.criticalityScore - a.criticalityScore);
      
      const executionTime = Date.now() - startTime;
      logger.info(`Found ${criticalNodes.length} critical nodes in ${executionTime}ms`);
      
      return {
        criticalNodes,
        metadata: {
          executionTime,
          pathsAnalyzed: paths.length,
          totalNodesAnalyzed: nodeFrequency.size
        }
      };
      
    } catch (error) {
      logger.error('Error finding critical nodes', error);
      throw error;
    }
  }

  /**
   * Reconstruct path from predecessor map
   * @param {Map} cameFrom - Predecessor map
   * @param {string} target - Target node
   * @returns {Array} Path from source to target
   */
  _reconstructPath(cameFrom, target) {
    const path = [target];
    let current = target;
    
    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      path.unshift(current);
    }
    
    return path;
  }

  /**
   * Calculate edge weight based on type
   * @private
   */
  _calculateEdgeWeight(edge, weightType) {
    switch (weightType) {
      case 'hops':
        return 1;
        
      case 'volume':
        // Inverse of volume (higher volume = lower weight)
        return 1 / (1 + Math.log10(1 + Number(BigInt(edge.total_volume) / BigInt(1000000000))));
        
      case 'risk':
        // Higher risk score = higher weight
        const riskScore = edge.relationship_score;
        return 1 + (riskScore / 100);
        
      case 'time':
        // Older edges have higher weight
        const ageInDays = (Date.now() / 1000 - edge.last_transfer_time) / 86400;
        return 1 + Math.log10(1 + ageInDays);
        
      default:
        return 1;
    }
  }

  /**
   * Get depth of a path from predecessor map
   * @private
   */
  _getPathDepth(previous, node) {
    let depth = 0;
    let current = node;
    
    while (previous.has(current)) {
      depth++;
      current = previous.get(current);
    }
    
    return depth;
  }

  /**
   * Build detailed path information
   * @private
   */
  _buildPathDetails(path) {
    const nodes = [];
    const edges = [];
    
    // Build nodes
    for (let i = 0; i < path.length; i++) {
      const address = path[i];
      const account = this.databaseService.getAccount(address);
      
      nodes.push({
        id: address,
        address,
        identity: account?.identity_display,
        balance: account?.balance,
        pathIndex: i,
        isSource: i === 0,
        isTarget: i === path.length - 1
      });
    }
    
    // Build edges
    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.edgeDetailsStmt.get(path[i], path[i + 1]);
      
      if (edge) {
        edges.push({
          id: `${path[i]}->${path[i + 1]}`,
          source: path[i],
          target: path[i + 1],
          volume: edge.total_volume,
          transferCount: edge.transfer_count,
          firstTransferTime: edge.first_transfer_time,
          lastTransferTime: edge.last_transfer_time,
          relationshipScore: edge.relationship_score
        });
      }
    }
    
    return { nodes, edges };
  }

  /**
   * Calculate total volume along a path
   * @private
   */
  _calculatePathVolume(path) {
    let totalVolume = BigInt(0);
    
    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.edgeDetailsStmt.get(path[i], path[i + 1]);
      if (edge) {
        totalVolume += BigInt(edge.total_volume);
      }
    }
    
    return totalVolume.toString();
  }

  /**
   * Calculate minimum edge volume in a path
   * @private
   */
  _calculateMinEdgeVolume(path) {
    let minVolume = null;
    
    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.edgeDetailsStmt.get(path[i], path[i + 1]);
      if (edge) {
        const volume = BigInt(edge.total_volume);
        if (minVolume === null || volume < minVolume) {
          minVolume = volume;
        }
      }
    }
    
    return minVolume ? minVolume.toString() : '0';
  }

  /**
   * Get last activity time for a path
   * @private
   */
  _getPathLastActivity(path) {
    let lastActivity = 0;
    
    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.edgeDetailsStmt.get(path[i], path[i + 1]);
      if (edge && edge.last_transfer_time > lastActivity) {
        lastActivity = edge.last_transfer_time;
      }
    }
    
    return lastActivity;
  }

  /**
   * Calculate risk score for an edge
   * @private
   */
  _calculateEdgeRisk(edge) {
    let risk = 0;
    
    // Factor 1: Risk scores of connected nodes
    risk += (edge.from_risk_score + edge.to_risk_score) / 2;
    
    // Factor 2: Low relationship score indicates suspicious activity
    if (edge.relationship_score < 50) {
      risk += 20;
    }
    
    // Factor 3: Single large transfers
    if (edge.transfer_count === 1 && BigInt(edge.total_volume) > BigInt('1000000000000')) {
      risk += 30;
    }
    
    return Math.min(100, risk);
  }

  /**
   * Calculate total risk for a path
   * @private
   */
  _calculateTotalPathRisk(riskFactors) {
    // Weighted combination of factors
    const nodeRiskWeight = 0.4;
    const edgeRiskWeight = 0.3;
    const patternWeight = 0.3;
    
    const avgEdgeRisk = riskFactors.edgeRisks.length > 0
      ? riskFactors.edgeRisks.reduce((sum, e) => sum + e.risk, 0) / riskFactors.edgeRisks.length
      : 0;
    
    const patternRisk = riskFactors.suspiciousPatterns.length * 20;
    
    return Math.min(100,
      riskFactors.avgNodeRisk * nodeRiskWeight +
      avgEdgeRisk * edgeRiskWeight +
      patternRisk * patternWeight
    );
  }

  /**
   * Classify risk level based on score
   * @private
   */
  _classifyRiskLevel(riskScore) {
    if (riskScore < 20) return 'low';
    if (riskScore < 50) return 'medium';
    if (riskScore < 80) return 'high';
    return 'critical';
  }

  /**
   * Find paths avoiding a specific node
   * @private
   */
  _findPathsAvoidingNode(from, to, avoidNode, maxDepth) {
    const paths = [];
    const currentPath = [];
    const visited = new Set();
    
    const dfs = (current, depth) => {
      if (current === avoidNode) return;
      
      currentPath.push(current);
      visited.add(current);
      
      if (current === to && currentPath.length > 1) {
        paths.push([...currentPath]);
      } else if (depth < maxDepth) {
        const edges = this.outgoingEdgesStmt.all(current);
        
        for (const edge of edges) {
          const neighbor = edge.to_address;
          if (!visited.has(neighbor)) {
            dfs(neighbor, depth + 1);
          }
        }
      }
      
      currentPath.pop();
      visited.delete(current);
    };
    
    dfs(from, 0);
    return paths;
  }

  /**
   * Calculate criticality score for a node
   * @private
   */
  _calculateCriticalityScore(metrics) {
    const {
      participationRate,
      isCritical,
      degree,
      betweenness
    } = metrics;
    
    let score = participationRate * 40; // 40% weight on participation
    
    if (isCritical) {
      score += 30; // 30% bonus for being critical
    }
    
    // Normalize degree and betweenness contributions
    score += Math.min(15, degree / 10); // Up to 15% for degree
    score += Math.min(15, betweenness * 100); // Up to 15% for betweenness
    
    return Math.min(100, score);
  }
}