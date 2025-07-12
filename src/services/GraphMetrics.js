import { logger } from '../utils/logger.js';

/**
 * Graph metrics calculation service for network analysis
 */
export class GraphMetrics {
  constructor(databaseService) {
    this.db = databaseService?.db;
    this.databaseService = databaseService;

    if (!this.db) {
      throw new Error('Database service is required for GraphMetrics');
    }

    // Prepare commonly used statements
    this.prepareStatements();
  }

  prepareStatements() {
    // Get all edges for degree calculations
    this.allEdgesStmt = this.db.prepare(`
      SELECT from_address, to_address, total_volume
      FROM account_relationships
    `);

    // Get in-degree for an address
    this.inDegreeStmt = this.db.prepare(`
      SELECT COUNT(*) as in_degree
      FROM account_relationships
      WHERE to_address = ?
    `);

    // Get out-degree for an address
    this.outDegreeStmt = this.db.prepare(`
      SELECT COUNT(*) as out_degree
      FROM account_relationships
      WHERE from_address = ?
    `);

    // Get neighbors of an address
    this.neighborsStmt = this.db.prepare(`
      SELECT DISTINCT 
        CASE 
          WHEN from_address = ? THEN to_address
          ELSE from_address
        END as neighbor
      FROM account_relationships
      WHERE from_address = ? OR to_address = ?
    `);

    // Get edges between neighbors
    this.neighborEdgesStmt = this.db.prepare(`
      SELECT COUNT(*) as edge_count
      FROM account_relationships
      WHERE (from_address = ? AND to_address = ?)
         OR (from_address = ? AND to_address = ?)
    `);
  }

  /**
   * Calculate degree centrality for an address
   * @param {string} address - Address to analyze
   * @returns {Object} Degree centrality metrics
   */
  calculateDegreeCentrality(address) {
    const startTime = Date.now();

    try {
      logger.info(`Calculating degree centrality for ${address}`);

      // Get in-degree
      const inDegreeResult = this.inDegreeStmt.get(address);
      const inDegree = inDegreeResult?.in_degree || 0;

      // Get out-degree
      const outDegreeResult = this.outDegreeStmt.get(address);
      const outDegree = outDegreeResult?.out_degree || 0;

      // Total degree
      const totalDegree = inDegree + outDegree;

      // Get total node count for normalization
      const totalNodes = this.db.prepare(`
        SELECT COUNT(DISTINCT address) as count
        FROM (
          SELECT from_address as address FROM account_relationships
          UNION
          SELECT to_address as address FROM account_relationships
        )
      `).get().count;

      // Normalized degree centrality (0-1)
      const normalizedDegree = totalNodes > 1 ? totalDegree / (totalNodes - 1) : 0;
      const normalizedInDegree = totalNodes > 1 ? inDegree / (totalNodes - 1) : 0;
      const normalizedOutDegree = totalNodes > 1 ? outDegree / (totalNodes - 1) : 0;

      // Get volume metrics
      const volumeMetrics = this.db.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN to_address = ? THEN total_volume ELSE 0 END), 0) as in_volume,
          COALESCE(SUM(CASE WHEN from_address = ? THEN total_volume ELSE 0 END), 0) as out_volume
        FROM account_relationships
        WHERE from_address = ? OR to_address = ?
      `).get(address, address, address, address);

      const executionTime = Date.now() - startTime;
      logger.info(`Degree centrality calculated in ${executionTime}ms`);

      return {
        inDegree,
        outDegree,
        totalDegree,
        normalizedDegree,
        normalizedInDegree,
        normalizedOutDegree,
        inVolume: volumeMetrics.in_volume,
        outVolume: volumeMetrics.out_volume,
        totalVolume: BigInt(volumeMetrics.in_volume) + BigInt(volumeMetrics.out_volume),
        metadata: {
          executionTime,
          totalNodes
        }
      };

    } catch (error) {
      logger.error('Error calculating degree centrality', error);
      throw error;
    }
  }

  /**
   * Calculate local clustering coefficient for an address
   * @param {string} address - Address to analyze
   * @returns {Object} Clustering coefficient and details
   */
  calculateClusteringCoefficient(address) {
    const startTime = Date.now();

    try {
      logger.info(`Calculating clustering coefficient for ${address}`);

      // Get all neighbors
      const neighbors = this.neighborsStmt.all(address, address, address);
      const neighborList = neighbors.map(n => n.neighbor);

      if (neighborList.length < 2) {
        return {
          coefficient: 0,
          possibleTriangles: 0,
          actualTriangles: 0,
          neighbors: neighborList.length,
          metadata: {
            executionTime: Date.now() - startTime
          }
        };
      }

      // Count edges between neighbors
      let edgeCount = 0;
      const triangles = [];

      for (let i = 0; i < neighborList.length; i++) {
        for (let j = i + 1; j < neighborList.length; j++) {
          const edge = this.neighborEdgesStmt.get(
            neighborList[i], neighborList[j],
            neighborList[j], neighborList[i]
          );

          if (edge && edge.edge_count > 0) {
            edgeCount++;
            triangles.push({
              node1: neighborList[i],
              node2: neighborList[j],
              center: address
            });
          }
        }
      }

      // Calculate clustering coefficient
      const possibleEdges = (neighborList.length * (neighborList.length - 1)) / 2;
      const coefficient = possibleEdges > 0 ? edgeCount / possibleEdges : 0;

      const executionTime = Date.now() - startTime;
      logger.info(`Clustering coefficient calculated in ${executionTime}ms`, {
        coefficient,
        triangles: triangles.length
      });

      return {
        coefficient,
        possibleTriangles: possibleEdges,
        actualTriangles: edgeCount,
        neighbors: neighborList.length,
        triangles: triangles.slice(0, 10), // Return first 10 triangles
        metadata: {
          executionTime
        }
      };

    } catch (error) {
      logger.error('Error calculating clustering coefficient', error);
      throw error;
    }
  }

  /**
   * Calculate approximate betweenness centrality
   * @param {Array} nodes - Nodes to analyze (if empty, analyzes all)
   * @param {number} sampleSize - Number of nodes to sample for paths
   * @returns {Array} Nodes with betweenness scores
   */
  calculateBetweennessCentrality(nodes = [], sampleSize = 100) {
    const startTime = Date.now();

    try {
      logger.info(`Calculating betweenness centrality`, {
        nodeCount: nodes.length,
        sampleSize
      });

      // Get all nodes if not provided
      if (nodes.length === 0) {
        const allNodes = this.db.prepare(`
          SELECT DISTINCT address
          FROM (
            SELECT from_address as address FROM account_relationships
            UNION
            SELECT to_address as address FROM account_relationships
          )
          LIMIT 1000
        `).all();
        nodes = allNodes.map(n => n.address);
      }

      // Sample nodes for path calculations
      const sampledNodes = this._sampleNodes(nodes, Math.min(sampleSize, nodes.length));

      // Initialize betweenness scores
      const betweenness = new Map();
      nodes.forEach(node => betweenness.set(node, 0));

      // Calculate shortest paths and update betweenness
      for (let i = 0; i < sampledNodes.length; i++) {
        for (let j = i + 1; j < sampledNodes.length; j++) {
          const source = sampledNodes[i];
          const target = sampledNodes[j];

          // Find shortest paths using BFS
          const paths = this._findShortestPathsBFS(source, target);

          // Update betweenness for intermediate nodes
          paths.forEach(path => {
            // Skip source and target
            for (let k = 1; k < path.length - 1; k++) {
              const node = path[k];
              if (betweenness.has(node)) {
                betweenness.set(node, betweenness.get(node) + 1 / paths.length);
              }
            }
          });
        }
      }

      // Normalize betweenness scores
      const n = nodes.length;
      const normalizationFactor = n > 2 ? 2 / ((n - 1) * (n - 2)) : 1;

      const results = [];
      for (const [node, score] of betweenness) {
        results.push({
          address: node,
          betweenness: score * normalizationFactor,
          unnormalizedBetweenness: score
        });
      }

      // Sort by betweenness score
      results.sort((a, b) => b.betweenness - a.betweenness);

      const executionTime = Date.now() - startTime;
      logger.info(`Betweenness centrality calculated in ${executionTime}ms`);

      return {
        nodes: results,
        metadata: {
          executionTime,
          totalNodes: nodes.length,
          sampledNodes: sampledNodes.length,
          normalizationFactor
        }
      };

    } catch (error) {
      logger.error('Error calculating betweenness centrality', error);
      throw error;
    }
  }

  /**
   * Calculate PageRank for a set of nodes
   * @param {Array} nodes - Nodes to analyze (if empty, analyzes all)
   * @param {number} iterations - Number of iterations
   * @returns {Array} Nodes with PageRank scores
   */
  calculatePageRank(nodes = [], iterations = 20) {
    const startTime = Date.now();
    const dampingFactor = 0.85;

    try {
      logger.info(`Calculating PageRank`, { nodeCount: nodes.length, iterations });

      // Get all edges
      let edges;
      if (nodes.length === 0) {
        // Get all edges and derive nodes
        edges = this.allEdgesStmt.all();
        const nodeSet = new Set();
        edges.forEach(edge => {
          nodeSet.add(edge.from_address);
          nodeSet.add(edge.to_address);
        });
        nodes = Array.from(nodeSet);

        // Limit to manageable size
        if (nodes.length > 500) {
          nodes = nodes.slice(0, 500);
          edges = edges.filter(e =>
            nodes.includes(e.from_address) && nodes.includes(e.to_address)
          );
        }
      } else {
        // Get edges for specified nodes
        const nodeSet = new Set(nodes);
        edges = this.allEdgesStmt.all().filter(e =>
          nodeSet.has(e.from_address) && nodeSet.has(e.to_address)
        );
      }

      // Build adjacency lists
      const outLinks = new Map();
      const inLinks = new Map();

      nodes.forEach(node => {
        outLinks.set(node, []);
        inLinks.set(node, []);
      });

      edges.forEach(edge => {
        if (outLinks.has(edge.from_address)) {
          outLinks.get(edge.from_address).push(edge.to_address);
        }
        if (inLinks.has(edge.to_address)) {
          inLinks.get(edge.to_address).push(edge.from_address);
        }
      });

      // Initialize PageRank scores
      const n = nodes.length;
      const initialScore = 1 / n;
      const pageRank = new Map();
      nodes.forEach(node => pageRank.set(node, initialScore));

      // Iterative calculation
      for (let iter = 0; iter < iterations; iter++) {
        const newPageRank = new Map();

        nodes.forEach(node => {
          let rank = (1 - dampingFactor) / n;

          // Sum contributions from incoming links
          const incomingNodes = inLinks.get(node) || [];
          incomingNodes.forEach(inNode => {
            const outDegree = outLinks.get(inNode)?.length || 1;
            rank += dampingFactor * (pageRank.get(inNode) || 0) / outDegree;
          });

          newPageRank.set(node, rank);
        });

        // Update PageRank scores
        newPageRank.forEach((rank, node) => pageRank.set(node, rank));
      }

      // Convert to array and sort
      const results = [];
      for (const [node, rank] of pageRank) {
        const account = this.databaseService.getAccount(node);
        results.push({
          address: node,
          pageRank: rank,
          normalizedPageRank: rank * n, // Normalized to sum to n
          identity: account?.identity_display,
          outDegree: outLinks.get(node)?.length || 0,
          inDegree: inLinks.get(node)?.length || 0
        });
      }

      results.sort((a, b) => b.pageRank - a.pageRank);

      const executionTime = Date.now() - startTime;
      logger.info(`PageRank calculated in ${executionTime}ms`);

      return {
        nodes: results,
        metadata: {
          executionTime,
          totalNodes: nodes.length,
          totalEdges: edges.length,
          iterations,
          dampingFactor,
          convergence: this._checkPageRankConvergence(results)
        }
      };

    } catch (error) {
      logger.error('Error calculating PageRank', error);
      throw error;
    }
  }

  /**
   * Identify hub nodes based on degree threshold
   * @param {number} threshold - Minimum degree to be considered a hub
   * @returns {Array} Hub nodes with metrics
   */
  identifyHubs(threshold = 10) {
    const startTime = Date.now();

    try {
      logger.info(`Identifying hub nodes with threshold ${threshold}`);

      // Query for high-degree nodes
      const hubQuery = this.db.prepare(`
        WITH node_degrees AS (
          SELECT 
            address,
            SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as out_degree,
            SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) as in_degree,
            COUNT(*) as total_degree,
            SUM(CAST(total_volume AS REAL)) as total_volume,
            COUNT(DISTINCT other_address) as unique_connections
          FROM (
            SELECT from_address as address, to_address as other_address, total_volume, 'out' as direction 
            FROM account_relationships
            UNION ALL
            SELECT to_address as address, from_address as other_address, total_volume, 'in' as direction 
            FROM account_relationships
          ) edges
          GROUP BY address
          HAVING total_degree >= ?
        )
        SELECT 
          nd.*,
          a.identity_display,
          COALESCE(nm.node_type, 'regular') as node_type,
          COALESCE(nm.risk_score, 0) as risk_score,
          COALESCE(nm.clustering_coefficient, 0) as clustering_coefficient
        FROM node_degrees nd
        JOIN accounts a ON a.address = nd.address
        LEFT JOIN node_metrics nm ON nm.address = nd.address
        ORDER BY total_degree DESC
      `);

      const hubs = hubQuery.all(threshold);

      // Enhance hub information
      const enhancedHubs = hubs.map(hub => {
        // Calculate hub score
        const hubScore = this._calculateHubScore({
          degree: hub.total_degree,
          volume: hub.total_volume,
          uniqueConnections: hub.unique_connections,
          clustering: hub.clustering_coefficient
        });

        return {
          address: hub.address,
          identity: hub.identity_display,
          nodeType: hub.node_type,
          metrics: {
            inDegree: hub.in_degree,
            outDegree: hub.out_degree,
            totalDegree: hub.total_degree,
            uniqueConnections: hub.unique_connections,
            totalVolume: hub.total_volume,
            clusteringCoefficient: hub.clustering_coefficient,
            riskScore: hub.risk_score
          },
          hubScore,
          classification: this._classifyHub(hub)
        };
      });

      const executionTime = Date.now() - startTime;
      logger.info(`Identified ${hubs.length} hub nodes in ${executionTime}ms`);

      return {
        hubs: enhancedHubs,
        metadata: {
          executionTime,
          threshold,
          totalHubs: enhancedHubs.length,
          hubTypes: this._countHubTypes(enhancedHubs)
        }
      };

    } catch (error) {
      logger.error('Error identifying hubs', error);
      throw error;
    }
  }

  /**
   * Detect communities using basic algorithms
   * @param {Array} nodes - Nodes to analyze
   * @param {string} algorithm - Algorithm to use ('label_propagation' or 'modularity')
   * @returns {Object} Community assignments
   */
  detectCommunities(nodes = [], algorithm = 'label_propagation') {
    const startTime = Date.now();

    try {
      logger.info(`Detecting communities using ${algorithm}`, { nodeCount: nodes.length });

      // Get edges for community detection
      if (nodes.length === 0) {
        // Get a sample of nodes
        const sampleNodes = this.db.prepare(`
          SELECT DISTINCT address
          FROM (
            SELECT from_address as address FROM account_relationships
            UNION
            SELECT to_address as address FROM account_relationships
          )
          LIMIT 1000
        `).all();
        nodes = sampleNodes.map(n => n.address);
      }

      // Get edges between these nodes
      const nodeSet = new Set(nodes);
      const edges = this.allEdgesStmt.all().filter(e =>
        nodeSet.has(e.from_address) && nodeSet.has(e.to_address)
      );

      let communities;

      switch (algorithm) {
        case 'label_propagation':
          communities = this._labelPropagation(nodes, edges);
          break;

        case 'modularity':
          communities = this._modularityOptimization(nodes, edges);
          break;

        default:
          throw new Error(`Unknown algorithm: ${algorithm}`);
      }

      // Calculate community metrics
      const communityMetrics = this._calculateCommunityMetrics(communities, edges);

      const executionTime = Date.now() - startTime;
      logger.info(`Communities detected in ${executionTime}ms`, {
        communitiesFound: communityMetrics.communityCount
      });

      return {
        communities,
        metrics: communityMetrics,
        metadata: {
          executionTime,
          algorithm,
          totalNodes: nodes.length,
          totalEdges: edges.length
        }
      };

    } catch (error) {
      logger.error('Error detecting communities', error);
      throw error;
    }
  }

  /**
   * Calculate overall graph density metrics
   * @param {Array} nodes - Nodes to analyze
   * @returns {Object} Density metrics
   */
  calculateGraphDensity(nodes = []) {
    const startTime = Date.now();

    try {
      logger.info(`Calculating graph density`, { nodeCount: nodes.length });

      // Get nodes and edges
      let nodeSet, edges;

      if (nodes.length === 0) {
        // Get all nodes
        const allNodes = this.db.prepare(`
          SELECT DISTINCT address
          FROM (
            SELECT from_address as address FROM account_relationships
            UNION
            SELECT to_address as address FROM account_relationships
          )
        `).all();
        nodes = allNodes.map(n => n.address);
        nodeSet = new Set(nodes);
        edges = this.allEdgesStmt.all();
      } else {
        nodeSet = new Set(nodes);
        edges = this.allEdgesStmt.all().filter(e =>
          nodeSet.has(e.from_address) && nodeSet.has(e.to_address)
        );
      }

      const n = nodes.length;
      const m = edges.length;

      // Calculate various density metrics
      const maxPossibleEdges = n * (n - 1); // For directed graph
      const density = maxPossibleEdges > 0 ? m / maxPossibleEdges : 0;

      // Calculate average degree
      const degreeMap = new Map();
      nodes.forEach(node => degreeMap.set(node, { in: 0, out: 0 }));

      edges.forEach(edge => {
        if (degreeMap.has(edge.from_address)) {
          degreeMap.get(edge.from_address).out++;
        }
        if (degreeMap.has(edge.to_address)) {
          degreeMap.get(edge.to_address).in++;
        }
      });

      const degrees = Array.from(degreeMap.values());
      const avgInDegree = degrees.reduce((sum, d) => sum + d.in, 0) / n;
      const avgOutDegree = degrees.reduce((sum, d) => sum + d.out, 0) / n;
      const avgTotalDegree = avgInDegree + avgOutDegree;

      // Calculate degree distribution
      const degreeDistribution = this._calculateDegreeDistribution(degrees);

      // Calculate reciprocity (bidirectional edges)
      const reciprocity = this._calculateReciprocity(edges);

      // Calculate connected components
      const components = this._findConnectedComponents(nodes, edges);

      const executionTime = Date.now() - startTime;
      logger.info(`Graph density calculated in ${executionTime}ms`);

      return {
        nodeCount: n,
        edgeCount: m,
        density,
        avgInDegree,
        avgOutDegree,
        avgTotalDegree,
        maxPossibleEdges,
        degreeDistribution,
        reciprocity,
        components: {
          count: components.length,
          largestSize: Math.max(...components.map(c => c.length)),
          sizes: components.map(c => c.length).sort((a, b) => b - a)
        },
        metadata: {
          executionTime,
          isConnected: components.length === 1,
          sparsity: 1 - density
        }
      };

    } catch (error) {
      logger.error('Error calculating graph density', error);
      throw error;
    }
  }

  /**
   * Find shortest paths using BFS
   * @private
   */
  _findShortestPathsBFS(source, target) {
    const queue = [[source, [source]]];
    const visited = new Set();
    const paths = [];
    let shortestLength = Infinity;

    while (queue.length > 0) {
      const [current, path] = queue.shift();

      if (path.length > shortestLength) {
        break; // All shortest paths found
      }

      if (current === target) {
        shortestLength = path.length;
        paths.push(path);
        continue;
      }

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      // Get neighbors
      const edges = this.db.prepare(`
        SELECT to_address FROM account_relationships WHERE from_address = ?
      `).all(current);

      for (const edge of edges) {
        if (!path.includes(edge.to_address)) {
          queue.push([edge.to_address, [...path, edge.to_address]]);
        }
      }
    }

    return paths;
  }

  /**
   * Sample nodes randomly
   * @private
   */
  _sampleNodes(nodes, sampleSize) {
    if (nodes.length <= sampleSize) {
      return [...nodes];
    }

    const sampled = [];
    const indices = new Set();

    while (sampled.length < sampleSize) {
      const index = Math.floor(Math.random() * nodes.length);
      if (!indices.has(index)) {
        indices.add(index);
        sampled.push(nodes[index]);
      }
    }

    return sampled;
  }

  /**
   * Check PageRank convergence
   * @private
   */
  _checkPageRankConvergence(results) {
    const scores = results.map(r => r.pageRank);
    const sum = scores.reduce((a, b) => a + b, 0);
    const mean = sum / scores.length;
    const variance = scores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / scores.length;

    return {
      sum,
      mean,
      variance,
      stdDev: Math.sqrt(variance),
      converged: variance < 0.0001
    };
  }

  /**
   * Calculate hub score
   * @private
   */
  _calculateHubScore(metrics) {
    const { degree, volume, uniqueConnections, clustering } = metrics;

    // Normalize components
    const degreeScore = Math.min(1, degree / 100);
    const volumeScore = Math.min(1, Number(BigInt(volume) / BigInt('1000000000000'))); // 1T
    const connectivityScore = Math.min(1, uniqueConnections / 50);
    const clusteringScore = clustering;

    // Weighted combination
    return (
      degreeScore * 0.3 +
      volumeScore * 0.3 +
      connectivityScore * 0.2 +
      (1 - clusteringScore) * 0.2 // Lower clustering = more hub-like
    );
  }

  /**
   * Classify hub type
   * @private
   */
  _classifyHub(hub) {
    const inOutRatio = hub.out_degree / (hub.in_degree + 1);

    if (hub.node_type === 'exchange') {
      return 'exchange_hub';
    } else if (hub.node_type === 'mixer') {
      return 'mixer_hub';
    } else if (inOutRatio > 10) {
      return 'distribution_hub';
    } else if (inOutRatio < 0.1) {
      return 'collection_hub';
    } else {
      return 'balanced_hub';
    }
  }

  /**
   * Count hub types
   * @private
   */
  _countHubTypes(hubs) {
    const types = {};
    hubs.forEach(hub => {
      types[hub.classification] = (types[hub.classification] || 0) + 1;
    });
    return types;
  }

  /**
   * Label propagation algorithm for community detection
   * @private
   */
  _labelPropagation(nodes, edges) {
    // Initialize each node with its own label
    const labels = new Map();
    nodes.forEach((node, index) => labels.set(node, index));

    // Build adjacency lists
    const neighbors = new Map();
    nodes.forEach(node => neighbors.set(node, []));

    edges.forEach(edge => {
      if (neighbors.has(edge.from_address)) {
        neighbors.get(edge.from_address).push(edge.to_address);
      }
      if (neighbors.has(edge.to_address)) {
        neighbors.get(edge.to_address).push(edge.from_address);
      }
    });

    // Iterate until convergence
    let changed = true;
    let iterations = 0;
    const maxIterations = 100;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      // Random order for nodes
      const shuffledNodes = [...nodes].sort(() => Math.random() - 0.5);

      for (const node of shuffledNodes) {
        const nodeNeighbors = neighbors.get(node) || [];
        if (nodeNeighbors.length === 0) {
          continue;
        }

        // Count neighbor labels
        const labelCounts = new Map();
        nodeNeighbors.forEach(neighbor => {
          const label = labels.get(neighbor);
          labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
        });

        // Find most frequent label
        let maxCount = 0;
        let bestLabel = labels.get(node);

        for (const [label, count] of labelCounts) {
          if (count > maxCount || (count === maxCount && Math.random() < 0.5)) {
            maxCount = count;
            bestLabel = label;
          }
        }

        // Update label if changed
        if (labels.get(node) !== bestLabel) {
          labels.set(node, bestLabel);
          changed = true;
        }
      }
    }

    // Convert to community structure
    const communities = new Map();
    for (const [node, label] of labels) {
      if (!communities.has(label)) {
        communities.set(label, []);
      }
      communities.get(label).push(node);
    }

    return Array.from(communities.values()).map((members, index) => ({
      id: index,
      members,
      size: members.length
    }));
  }

  /**
   * Basic modularity optimization
   * @private
   */
  _modularityOptimization(nodes, edges) {
    // Simplified modularity optimization
    // Start with each node in its own community
    const communities = new Map();
    nodes.forEach((node, index) => {
      communities.set(index, [node]);
    });

    // This is a placeholder for a more sophisticated algorithm
    // In practice, you'd implement Louvain or similar
    return this._labelPropagation(nodes, edges);
  }

  /**
   * Calculate community metrics
   * @private
   */
  _calculateCommunityMetrics(communities, edges) {
    const communityMap = new Map();

    // Build node to community mapping
    communities.forEach((community, index) => {
      community.members.forEach(node => {
        communityMap.set(node, index);
      });
    });

    // Count internal and external edges
    let internalEdges = 0;
    let externalEdges = 0;

    edges.forEach(edge => {
      const fromCommunity = communityMap.get(edge.from_address);
      const toCommunity = communityMap.get(edge.to_address);

      if (fromCommunity !== undefined && toCommunity !== undefined) {
        if (fromCommunity === toCommunity) {
          internalEdges++;
        } else {
          externalEdges++;
        }
      }
    });

    // Calculate modularity
    const m = edges.length;
    const modularity = m > 0 ? (internalEdges - externalEdges) / m : 0;

    return {
      communityCount: communities.length,
      avgCommunitySize: communities.reduce((sum, c) => sum + c.size, 0) / communities.length,
      largestCommunity: Math.max(...communities.map(c => c.size)),
      smallestCommunity: Math.min(...communities.map(c => c.size)),
      internalEdges,
      externalEdges,
      modularity
    };
  }

  /**
   * Calculate degree distribution
   * @private
   */
  _calculateDegreeDistribution(degrees) {
    const distribution = {
      in: {},
      out: {},
      total: {}
    };

    degrees.forEach(d => {
      distribution.in[d.in] = (distribution.in[d.in] || 0) + 1;
      distribution.out[d.out] = (distribution.out[d.out] || 0) + 1;
      const total = d.in + d.out;
      distribution.total[total] = (distribution.total[total] || 0) + 1;
    });

    return distribution;
  }

  /**
   * Calculate reciprocity
   * @private
   */
  _calculateReciprocity(edges) {
    const edgeSet = new Set();
    let reciprocalCount = 0;

    edges.forEach(edge => {
      const forward = `${edge.from_address}->${edge.to_address}`;
      const backward = `${edge.to_address}->${edge.from_address}`;

      if (edgeSet.has(backward)) {
        reciprocalCount++;
      }
      edgeSet.add(forward);
    });

    return edges.length > 0 ? reciprocalCount / edges.length : 0;
  }

  /**
   * Find connected components
   * @private
   */
  _findConnectedComponents(nodes, edges) {
    // Build undirected adjacency list
    const adjacency = new Map();
    nodes.forEach(node => adjacency.set(node, []));

    edges.forEach(edge => {
      if (adjacency.has(edge.from_address)) {
        adjacency.get(edge.from_address).push(edge.to_address);
      }
      if (adjacency.has(edge.to_address)) {
        adjacency.get(edge.to_address).push(edge.from_address);
      }
    });

    const visited = new Set();
    const components = [];

    // DFS to find components
    const dfs = (node, component) => {
      visited.add(node);
      component.push(node);

      const neighbors = adjacency.get(node) || [];
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          dfs(neighbor, component);
        }
      });
    };

    // Find all components
    nodes.forEach(node => {
      if (!visited.has(node)) {
        const component = [];
        dfs(node, component);
        components.push(component);
      }
    });

    return components;
  }
}