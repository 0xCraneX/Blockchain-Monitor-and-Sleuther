import { logger } from '../utils/logger.js';

export class GraphQueries {
  constructor(databaseService) {
    this.db = databaseService?.db;
    this.databaseService = databaseService;
    
    // Prepare commonly used statements if db is available
    if (this.db) {
      this.prepareStatements();
    }
  }

  prepareStatements() {
    // Direct connections query
    this.directConnectionsStmt = this.db.prepare(`
      WITH account_data AS (
        SELECT id, address FROM accounts WHERE address = ?
      )
      SELECT 
        CASE 
          WHEN ar.from_address = ad.address THEN 'outgoing'
          ELSE 'incoming'
        END as direction,
        CASE 
          WHEN ar.from_address = ad.address THEN ar.to_address
          ELSE ar.from_address
        END as connected_address,
        CASE 
          WHEN ar.from_address = ad.address THEN a2.identity_display
          ELSE a1.identity_display
        END as connected_identity,
        ar.total_volume,
        ar.transfer_count,
        ar.last_transfer_time,
        COALESCE(rs.total_score, 0) as relationship_score,
        COALESCE(nm.risk_score, 0) as connected_risk_score,
        COALESCE(nm.node_type, 'regular') as connected_node_type
      FROM account_data ad
      JOIN account_relationships ar ON ar.from_address = ad.address OR ar.to_address = ad.address
      JOIN accounts a1 ON a1.address = ar.from_address
      JOIN accounts a2 ON a2.address = ar.to_address
      LEFT JOIN relationship_scores rs ON rs.from_address = ar.from_address AND rs.to_address = ar.to_address
      LEFT JOIN node_metrics nm ON nm.address = CASE 
        WHEN ar.from_address = ad.address THEN ar.to_address
        ELSE ar.from_address
      END
      WHERE CAST(ar.total_volume AS INTEGER) >= CAST(COALESCE(?, 0) AS INTEGER)
      ORDER BY ar.total_volume DESC
      LIMIT ?
    `);
  }

  /**
   * Get direct connections for an address (1-hop relationships)
   * @param {string} address - The address to query
   * @param {Object} options - Query options
   * @param {string} options.minVolume - Minimum volume filter (default: '0')
   * @param {number} options.limit - Maximum results (default: 100)
   * @returns {Object} Object containing nodes and edges
   */
  getDirectConnections(address, options = {}) {
    const startTime = Date.now();
    const { minVolume = '0', limit = 100 } = options;
    
    try {
      logger.info(`Getting direct connections for ${address}`, { minVolume, limit });
      
      if (!this.db) {
        throw new Error('Database not initialized');
      }
      
      // Get direct connections
      const connections = this.directConnectionsStmt.all(address, minVolume, limit);
      
      // Build graph structure
      const nodes = new Map();
      const edges = [];
      
      // Add center node
      const centerAccount = this.databaseService.getAccount(address);
      if (!centerAccount) {
        logger.warn(`Address not found: ${address}`);
        return { nodes: [], edges: [] };
      }
      
      nodes.set(address, {
        id: address,
        address: address,
        identity: centerAccount.identity_display,
        balance: centerAccount.balance,
        nodeType: 'center',
        metrics: {
          degree: connections.length,
          totalVolume: connections.reduce((sum, conn) => {
            let volumeStr = conn.total_volume.toString();
            if (volumeStr.includes('.')) {
              volumeStr = volumeStr.split('.')[0];
            }
            return BigInt(sum) + BigInt(volumeStr || 0);
          }, BigInt(0)).toString()
        }
      });
      
      // Process connections
      connections.forEach(conn => {
        const connectedAddr = conn.connected_address;
        
        // Add connected node
        if (!nodes.has(connectedAddr)) {
          nodes.set(connectedAddr, {
            id: connectedAddr,
            address: connectedAddr,
            identity: conn.connected_identity,
            nodeType: conn.connected_node_type,
            riskScore: conn.connected_risk_score,
            metrics: {
              relationshipScore: conn.relationship_score
            }
          });
        }
        
        // Add edge
        edges.push({
          id: `${conn.direction === 'outgoing' ? address : connectedAddr}->${conn.direction === 'outgoing' ? connectedAddr : address}`,
          source: conn.direction === 'outgoing' ? address : connectedAddr,
          target: conn.direction === 'outgoing' ? connectedAddr : address,
          volume: conn.total_volume,
          transferCount: conn.transfer_count,
          lastTransferTime: conn.last_transfer_time,
          relationshipScore: conn.relationship_score,
          direction: conn.direction
        });
      });
      
      const executionTime = Date.now() - startTime;
      logger.info(`Direct connections query completed in ${executionTime}ms`, {
        nodesCount: nodes.size,
        edgesCount: edges.length
      });
      
      return {
        nodes: Array.from(nodes.values()),
        edges: edges,
        metadata: {
          executionTime,
          centerAddress: address,
          depth: 1
        }
      };
      
    } catch (error) {
      logger.error('Error getting direct connections', error);
      throw error;
    }
  }

  /**
   * Get multi-hop connections using recursive traversal
   * @param {string} address - Starting address
   * @param {number} depth - Maximum depth (1-3)
   * @param {Object} options - Query options
   * @returns {Object} Object containing nodes and edges
   */
  getMultiHopConnections(address, depth = 2, options = {}) {
    const startTime = Date.now();
    const { minVolume = '0', limit = 500 } = options;
    
    // Validate depth
    if (depth < 1 || depth > 3) {
      throw new Error('Depth must be between 1 and 3');
    }
    
    // Set timeout based on depth
    const timeout = depth === 1 ? 1000 : depth === 2 ? 1000 : 5000;
    
    try {
      logger.info(`Getting ${depth}-hop connections for ${address}`, { minVolume, limit });
      
      // Prepare recursive query
      const recursiveQuery = this.db.prepare(`
        WITH RECURSIVE graph_traversal AS (
          -- Base case: direct connections
          SELECT 
            from_address,
            to_address,
            1 as hop_count,
            CAST(from_address || ' -> ' || to_address AS TEXT) as path,
            total_volume,
            transfer_count,
            CAST(total_volume AS DECIMAL) as path_min_volume
          FROM account_relationships
          WHERE from_address = ?
            AND total_volume >= CAST(? AS INTEGER)
          
          UNION ALL
          
          -- Recursive case: extend paths
          SELECT 
            gt.from_address,
            ar.to_address,
            gt.hop_count + 1,
            gt.path || ' -> ' || ar.to_address,
            ar.total_volume,
            ar.transfer_count,
            MIN(gt.path_min_volume, CAST(ar.total_volume AS DECIMAL)) as path_min_volume
          FROM account_relationships ar
          INNER JOIN graph_traversal gt ON ar.from_address = gt.to_address
          WHERE gt.hop_count < ?
            AND gt.path NOT LIKE '%' || ar.to_address || '%'  -- prevent cycles
            AND ar.total_volume >= CAST(? AS INTEGER)
        ),
        aggregated_paths AS (
          SELECT 
            to_address,
            MIN(hop_count) as min_hops,
            COUNT(*) as path_count,
            MAX(path_min_volume) as best_path_volume,
            GROUP_CONCAT(path, ' | ') as all_paths
          FROM graph_traversal
          WHERE to_address != ?
          GROUP BY to_address
        )
        SELECT 
          ap.*,
          a.identity_display,
          COALESCE(nm.risk_score, 0) as risk_score,
          COALESCE(nm.node_type, 'regular') as node_type
        FROM aggregated_paths ap
        JOIN accounts a ON a.address = ap.to_address
        LEFT JOIN node_metrics nm ON nm.address = ap.to_address
        ORDER BY min_hops, best_path_volume DESC
        LIMIT ?
      `);
      
      // Execute query synchronously (better-sqlite3 is synchronous)
      // For timeout handling, we'll rely on SQLite's built-in timeout mechanism
      const pathResults = recursiveQuery.all(address, minVolume, depth, minVolume, address, limit);
      
      // Build graph from results
      const nodes = new Map();
      const edges = new Map();
      const processedPaths = new Set();
      
      // Add center node
      const centerAccount = this.databaseService.getAccount(address);
      nodes.set(address, {
        id: address,
        address: address,
        identity: centerAccount?.identity_display,
        nodeType: 'center',
        hopLevel: 0
      });
      
      // Process path results
      pathResults.forEach(result => {
        // Add destination node
        if (!nodes.has(result.to_address)) {
          nodes.set(result.to_address, {
            id: result.to_address,
            address: result.to_address,
            identity: result.identity_display,
            nodeType: result.node_type,
            riskScore: result.risk_score,
            hopLevel: result.min_hops,
            pathCount: result.path_count,
            bestPathVolume: result.best_path_volume
          });
        }
        
        // Extract edges from paths
        const paths = result.all_paths.split(' | ');
        paths.forEach(path => {
          if (processedPaths.has(path)) return;
          processedPaths.add(path);
          
          const segments = path.split(' -> ');
          for (let i = 0; i < segments.length - 1; i++) {
            const source = segments[i];
            const target = segments[i + 1];
            const edgeId = `${source}->${target}`;
            
            // Add intermediate nodes if not exists
            if (!nodes.has(source)) {
              const account = this.databaseService.getAccount(source);
              nodes.set(source, {
                id: source,
                address: source,
                identity: account?.identity_display,
                nodeType: 'intermediate',
                hopLevel: i
              });
            }
            
            if (!nodes.has(target)) {
              const account = this.databaseService.getAccount(target);
              nodes.set(target, {
                id: target,
                address: target,
                identity: account?.identity_display,
                nodeType: 'intermediate',
                hopLevel: i + 1
              });
            }
            
            // Add edge if not exists
            if (!edges.has(edgeId)) {
              const relationship = this.db.prepare(`
                SELECT total_volume, transfer_count, last_transfer_time
                FROM account_relationships
                WHERE from_address = ? AND to_address = ?
              `).get(source, target);
              
              if (relationship) {
                edges.set(edgeId, {
                  id: edgeId,
                  source: source,
                  target: target,
                  volume: relationship.total_volume,
                  transferCount: relationship.transfer_count,
                  lastTransferTime: relationship.last_transfer_time
                });
              }
            }
          }
        });
      });
      
      const executionTime = Date.now() - startTime;
      logger.info(`Multi-hop query completed in ${executionTime}ms`, {
        depth,
        nodesCount: nodes.size,
        edgesCount: edges.size
      });
      
      return {
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
        metadata: {
          executionTime,
          centerAddress: address,
          depth,
          totalPaths: processedPaths.size
        }
      };
      
    } catch (error) {
      logger.error('Error getting multi-hop connections', error);
      throw error;
    }
  }

  /**
   * Extract complete subgraph around an address
   * @param {string} centerAddress - Center address
   * @param {number} depth - Maximum depth
   * @param {Object} filters - Additional filters
   * @returns {Object} Complete subgraph with nodes and edges
   */
  extractSubgraph(centerAddress, depth = 2, filters = {}) {
    const startTime = Date.now();
    const { minVolume = '0', nodeTypes = [], riskScoreRange = [] } = filters;
    
    try {
      logger.info(`Extracting subgraph for ${centerAddress}`, { depth, filters });
      
      // Prepare subgraph extraction query
      const subgraphQuery = this.db.prepare(`
        WITH RECURSIVE subgraph_nodes AS (
          -- Start with the center node
          SELECT ? as address, 0 as depth
          
          UNION
          
          -- Add connected nodes up to specified depth
          SELECT 
            CASE 
              WHEN ar.from_address = sn.address THEN ar.to_address
              ELSE ar.from_address
            END as address,
            sn.depth + 1
          FROM account_relationships ar
          JOIN subgraph_nodes sn ON ar.from_address = sn.address OR ar.to_address = sn.address
          WHERE sn.depth < ?
            AND ar.total_volume >= CAST(? AS INTEGER)
        ),
        subgraph_edges AS (
          SELECT DISTINCT
            ar.*,
            COALESCE(rs.total_score, 0) as edge_score
          FROM account_relationships ar
          JOIN subgraph_nodes sn1 ON ar.from_address = sn1.address
          JOIN subgraph_nodes sn2 ON ar.to_address = sn2.address
          LEFT JOIN relationship_scores rs ON rs.from_address = ar.from_address AND rs.to_address = ar.to_address
        )
        SELECT 
          'nodes' as result_type,
          json_object(
            'address', a.address,
            'identity', a.identity_display,
            'balance', a.balance,
            'node_type', COALESCE(nm.node_type, 'regular'),
            'risk_score', COALESCE(nm.risk_score, 0),
            'degree', COALESCE(nm.degree, 0),
            'in_degree', COALESCE(nm.in_degree, 0),
            'out_degree', COALESCE(nm.out_degree, 0),
            'depth', sn.depth
          ) as data
        FROM subgraph_nodes sn
        JOIN accounts a ON a.address = sn.address
        LEFT JOIN node_metrics nm ON nm.address = a.address
        WHERE 1=1
          ${nodeTypes.length > 0 ? `AND COALESCE(nm.node_type, 'regular') IN (${nodeTypes.map(() => '?').join(',')})` : ''}
          ${riskScoreRange.length === 2 ? 'AND COALESCE(nm.risk_score, 0) BETWEEN ? AND ?' : ''}
        
        UNION ALL
        
        SELECT 
          'edges' as result_type,
          json_object(
            'from', from_address,
            'to', to_address,
            'volume', total_volume,
            'count', transfer_count,
            'score', edge_score,
            'first_transfer_time', first_transfer_time,
            'last_transfer_time', last_transfer_time
          ) as data
        FROM subgraph_edges
      `);
      
      // Build parameters
      const params = [centerAddress, depth, minVolume];
      if (nodeTypes.length > 0) params.push(...nodeTypes);
      if (riskScoreRange.length === 2) params.push(...riskScoreRange);
      
      // Execute query
      const results = subgraphQuery.all(...params);
      
      // Parse results
      const nodes = [];
      const edges = [];
      
      results.forEach(row => {
        const data = JSON.parse(row.data);
        if (row.result_type === 'nodes') {
          nodes.push({
            id: data.address,
            ...data
          });
        } else {
          edges.push({
            id: `${data.from}->${data.to}`,
            source: data.from,
            target: data.to,
            ...data
          });
        }
      });
      
      const executionTime = Date.now() - startTime;
      logger.info(`Subgraph extraction completed in ${executionTime}ms`, {
        nodesCount: nodes.length,
        edgesCount: edges.length
      });
      
      return {
        nodes,
        edges,
        metadata: {
          executionTime,
          centerAddress,
          depth,
          filters
        }
      };
      
    } catch (error) {
      logger.error('Error extracting subgraph', error);
      throw error;
    }
  }

  /**
   * Find shortest path between two addresses
   * @param {string} fromAddress - Starting address
   * @param {string} toAddress - Target address
   * @param {Object} options - Query options
   * @returns {Object} Shortest path information
   */
  findShortestPath(fromAddress, toAddress, options = {}) {
    const startTime = Date.now();
    const { maxDepth = 4 } = options;
    
    try {
      logger.info(`Finding shortest path from ${fromAddress} to ${toAddress}`);
      
      // First check for direct connection
      const directCheck = this.db.prepare(`
        SELECT total_volume, transfer_count
        FROM account_relationships
        WHERE from_address = ? AND to_address = ?
      `).get(fromAddress, toAddress);
      
      if (directCheck) {
        // Direct connection found
        return {
          found: true,
          path: `${fromAddress} -> ${toAddress}`,
          hops: 1,
          pathVolume: directCheck.total_volume,
          nodes: [
            { id: fromAddress, address: fromAddress, pathIndex: 0 },
            { id: toAddress, address: toAddress, pathIndex: 1 }
          ],
          edges: [{
            id: `${fromAddress}->${toAddress}`,
            source: fromAddress,
            target: toAddress,
            volume: directCheck.total_volume,
            transferCount: directCheck.transfer_count
          }],
          metadata: {
            executionTime: Date.now() - startTime,
            fromAddress,
            toAddress
          }
        };
      }
      
      // If no direct connection, use recursive search
      const pathQuery = this.db.prepare(`
        WITH RECURSIVE path_search AS (
          SELECT 
            from_address, 
            to_address, 
            1 as hop_count, 
            from_address || ' -> ' || to_address as path,
            total_volume
          FROM account_relationships
          WHERE from_address = ?
          
          UNION ALL
          
          SELECT 
            ps.from_address, 
            ar.to_address, 
            ps.hop_count + 1, 
            ps.path || ' -> ' || ar.to_address,
            MIN(ps.total_volume, ar.total_volume) as total_volume
          FROM account_relationships ar
          JOIN path_search ps ON ar.from_address = ps.to_address
          WHERE ps.hop_count < ?
            AND ps.to_address != ?  -- Not at destination yet
            AND ps.path NOT LIKE '%' || ar.to_address || '%'  -- No cycles
        )
        SELECT path as full_path, hop_count as total_hops, total_volume as path_volume
        FROM path_search
        WHERE to_address = ?
        ORDER BY hop_count, total_volume DESC
        LIMIT 1
      `);
      
      const result = pathQuery.get(fromAddress, maxDepth, toAddress, toAddress);
      
      if (!result) {
        return {
          found: false,
          message: `No path found between ${fromAddress} and ${toAddress} within ${maxDepth} hops`
        };
      }
      
      // Parse path segments
      const segments = result.full_path.split(' -> ');
      const nodes = [];
      const edges = [];
      
      // Build nodes and edges from path
      segments.forEach((address, index) => {
        const account = this.databaseService.getAccount(address);
        nodes.push({
          id: address,
          address: address,
          identity: account?.identity_display,
          pathIndex: index
        });
        
        if (index < segments.length - 1) {
          const nextAddress = segments[index + 1];
          const relationship = this.db.prepare(`
            SELECT total_volume, transfer_count
            FROM account_relationships
            WHERE from_address = ? AND to_address = ?
          `).get(address, nextAddress);
          
          edges.push({
            id: `${address}->${nextAddress}`,
            source: address,
            target: nextAddress,
            volume: relationship?.total_volume || '0',
            transferCount: relationship?.transfer_count || 0
          });
        }
      });
      
      const executionTime = Date.now() - startTime;
      
      return {
        found: true,
        path: result.full_path,
        hops: result.total_hops,
        pathVolume: result.path_volume,
        nodes,
        edges,
        metadata: {
          executionTime,
          fromAddress,
          toAddress
        }
      };
      
    } catch (error) {
      logger.error('Error finding shortest path', error);
      throw error;
    }
  }

  /**
   * Detect circular flows (money returning to origin)
   * @param {string} address - Starting address
   * @param {Object} options - Query options
   * @returns {Array} Array of circular paths found
   */
  detectCircularFlows(address, options = {}) {
    const startTime = Date.now();
    const { maxDepth = 5, minVolume = '0' } = options;
    
    try {
      logger.info(`Detecting circular flows for ${address}`);
      
      const circularQuery = this.db.prepare(`
        WITH RECURSIVE circular_paths AS (
          SELECT 
            from_address as origin,
            to_address as current,
            1 as depth,
            CAST(from_address || '->' || to_address AS TEXT) as path,
            total_volume,
            0 as is_circular
          FROM account_relationships
          WHERE from_address = ?
            AND total_volume >= CAST(? AS INTEGER)
          
          UNION ALL
          
          SELECT 
            cp.origin,
            ar.to_address,
            cp.depth + 1,
            cp.path || '->' || ar.to_address,
            MIN(cp.total_volume, ar.total_volume),
            CASE WHEN ar.to_address = cp.origin THEN 1 ELSE 0 END as is_circular
          FROM account_relationships ar
          JOIN circular_paths cp ON ar.from_address = cp.current
          WHERE cp.depth < ?
            AND cp.is_circular = 0
            AND (ar.to_address = cp.origin OR cp.path NOT LIKE '%' || ar.to_address || '%')
        )
        SELECT 
          path || ' (circular)' as circular_path,
          depth as path_length,
          total_volume as min_volume_in_path
        FROM circular_paths
        WHERE is_circular = 1
        ORDER BY depth, total_volume DESC
      `);
      
      const results = circularQuery.all(address, minVolume, maxDepth);
      
      const executionTime = Date.now() - startTime;
      logger.info(`Circular flow detection completed in ${executionTime}ms`, {
        circularPathsFound: results.length
      });
      
      return {
        circularPaths: results,
        metadata: {
          executionTime,
          address,
          maxDepth,
          minVolume
        }
      };
      
    } catch (error) {
      logger.error('Error detecting circular flows', error);
      throw error;
    }
  }

  /**
   * Build graph structure from query results
   * @param {Array} nodes - Array of nodes
   * @param {Array} edges - Array of edges
   * @returns {Object} Formatted graph object
   */
  _buildGraphFromResults(nodes, edges) {
    // Ensure unique nodes
    const uniqueNodes = new Map();
    nodes.forEach(node => {
      if (!uniqueNodes.has(node.id)) {
        uniqueNodes.set(node.id, node);
      }
    });
    
    // Ensure unique edges
    const uniqueEdges = new Map();
    edges.forEach(edge => {
      if (!uniqueEdges.has(edge.id)) {
        uniqueEdges.set(edge.id, edge);
      }
    });
    
    // Calculate graph metrics
    const nodeMetrics = new Map();
    uniqueEdges.forEach(edge => {
      // Out-degree for source
      if (!nodeMetrics.has(edge.source)) {
        nodeMetrics.set(edge.source, { outDegree: 0, inDegree: 0, totalVolume: BigInt(0) });
      }
      nodeMetrics.get(edge.source).outDegree++;
      nodeMetrics.get(edge.source).totalVolume += BigInt(edge.volume || 0);
      
      // In-degree for target
      if (!nodeMetrics.has(edge.target)) {
        nodeMetrics.set(edge.target, { outDegree: 0, inDegree: 0, totalVolume: BigInt(0) });
      }
      nodeMetrics.get(edge.target).inDegree++;
    });
    
    // Enhance nodes with metrics
    uniqueNodes.forEach((node, id) => {
      const metrics = nodeMetrics.get(id);
      if (metrics) {
        node.metrics = {
          ...node.metrics,
          inDegree: metrics.inDegree,
          outDegree: metrics.outDegree,
          degree: metrics.inDegree + metrics.outDegree,
          totalVolume: metrics.totalVolume.toString()
        };
      }
    });
    
    return {
      nodes: Array.from(uniqueNodes.values()),
      edges: Array.from(uniqueEdges.values()),
      metrics: {
        nodeCount: uniqueNodes.size,
        edgeCount: uniqueEdges.size,
        avgDegree: uniqueNodes.size > 0 
          ? Array.from(nodeMetrics.values()).reduce((sum, m) => sum + m.inDegree + m.outDegree, 0) / uniqueNodes.size 
          : 0
      }
    };
  }

  /**
   * Log query performance for monitoring
   * @param {string} queryType - Type of query executed
   * @param {Object} parameters - Query parameters
   * @param {number} executionTime - Execution time in ms
   * @param {number} rowsReturned - Number of rows returned
   */
  logQueryPerformance(queryType, parameters, executionTime, rowsReturned) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO query_performance_log (query_type, parameters, execution_time_ms, rows_returned)
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run(queryType, JSON.stringify(parameters), executionTime, rowsReturned);
    } catch (error) {
      logger.error('Error logging query performance', error);
    }
  }
}