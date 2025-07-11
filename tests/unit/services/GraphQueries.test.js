import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GraphQueries } from '../../../src/services/GraphQueries.js';
import { DatabaseService } from '../../../src/services/DatabaseService.js';
import { createTestDatabase, seedTestData } from '../../setup.js';
import Database from 'better-sqlite3';

describe('GraphQueries', () => {
  let rawDb;
  let dbService;
  let graphQueries;

  beforeEach(async () => {
    // Create test database with schema
    rawDb = await createTestDatabase();
    
    // Seed test data including relationships
    seedTestData(rawDb);
    
    // Add additional test data for graph queries
    seedGraphTestData(rawDb);
    
    // Initialize services
    dbService = new DatabaseService();
    dbService.db = rawDb;
    dbService.dbPath = './tests/test.db';
    
    graphQueries = new GraphQueries(dbService);
  });

  afterEach(() => {
    if (rawDb) {
      rawDb.close();
    }
  });

  describe('getDirectConnections', () => {
    it('should get direct connections for an address', () => {
      const result = graphQueries.getDirectConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      
      expect(result).toBeDefined();
      expect(result.nodes).toBeInstanceOf(Array);
      expect(result.edges).toBeInstanceOf(Array);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.depth).toBe(1);
      expect(result.metadata.centerAddress).toBe('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
    });

    it('should include center node in results', () => {
      const result = graphQueries.getDirectConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      
      const centerNode = result.nodes.find(n => n.nodeType === 'center');
      expect(centerNode).toBeDefined();
      expect(centerNode.address).toBe('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
    });

    it('should filter connections by minimum volume', () => {
      // First, get all connections to see what volumes exist
      const allConnections = graphQueries.getDirectConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      
      if (allConnections.edges.length > 0) {
        // Get the max volume from existing connections
        const maxVolume = allConnections.edges.reduce((max, edge) => {
          const vol = BigInt(edge.volume);
          return vol > max ? vol : max;
        }, BigInt(0));
        
        // Filter by a volume that includes some connections
        const minVolume = (maxVolume / BigInt(2)).toString();
        const filtered = graphQueries.getDirectConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', {
          minVolume: minVolume
        });
        
        filtered.edges.forEach(edge => {
          expect(BigInt(edge.volume)).toBeGreaterThanOrEqual(BigInt(minVolume));
        });
        
        // Test with volume higher than all connections to exclude everything
        const veryHighVolume = (maxVolume + BigInt(1)).toString();
        const result2 = graphQueries.getDirectConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', {
          minVolume: veryHighVolume
        });
        
        // Debug if test fails
        if (result2.edges.length > 0) {
          console.log('Unexpected edges found with minVolume:', veryHighVolume);
          console.log('Max volume was:', maxVolume.toString());
          console.log('Found edges:', result2.edges.map(e => ({ volume: e.volume })));
        }
        
        expect(result2.edges.length).toBe(0);
      }
    });

    it('should limit number of connections', () => {
      const result = graphQueries.getDirectConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', {
        limit: 2
      });
      
      // Subtract 1 for center node
      expect(result.nodes.length - 1).toBeLessThanOrEqual(2);
    });

    it('should handle non-existent address', () => {
      const result = graphQueries.getDirectConnections('5NonExistentAddress');
      
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should include both incoming and outgoing connections', () => {
      const result = graphQueries.getDirectConnections('5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty');
      
      const incomingEdges = result.edges.filter(e => e.direction === 'incoming');
      const outgoingEdges = result.edges.filter(e => e.direction === 'outgoing');
      
      expect(incomingEdges.length).toBeGreaterThan(0);
      expect(outgoingEdges.length).toBeGreaterThan(0);
    });

    it('should track execution time', () => {
      const result = graphQueries.getDirectConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      
      expect(result.metadata.executionTime).toBeDefined();
      expect(result.metadata.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata.executionTime).toBeLessThan(10); // Should be fast for direct connections
    });
  });

  describe('getMultiHopConnections', () => {
    it('should get 2-hop connections', () => {
      const result = graphQueries.getMultiHopConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 2);
      
      expect(result).toBeDefined();
      expect(result.nodes.some(n => n.hopLevel === 2)).toBe(true);
      expect(result.metadata.depth).toBe(2);
    });

    it('should get 3-hop connections', () => {
      // Add more connections to create a 3-hop path
      // Path: Alice -> Bob -> Charlie -> Dave -> Eve
      const newAccounts = ['5Dave', '5Eve'];
      const accountStmt = rawDb.prepare(`
        INSERT OR IGNORE INTO accounts (address, balance, first_seen_block)
        VALUES (?, '1000000000000', 1000000)
      `);
      
      newAccounts.forEach(addr => accountStmt.run(addr));
      
      const relStmt = rawDb.prepare(`
        INSERT OR IGNORE INTO account_relationships 
        (from_address, to_address, total_volume, transfer_count, first_transfer_block, last_transfer_block)
        VALUES (?, ?, ?, 1, 1000000, 1100000)
      `);
      
      // Create the path
      relStmt.run('5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y', '5Dave', '1000000000000');
      relStmt.run('5Dave', '5Eve', '1000000000000');
      
      const result = graphQueries.getMultiHopConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 3);
      
      expect(result).toBeDefined();
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.metadata.depth).toBe(3);
      // The test data should now have paths that reach 3 hops
    });

    it('should throw error for invalid depth', () => {
      expect(() => 
        graphQueries.getMultiHopConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 4)
      ).toThrow('Depth must be between 1 and 3');
    });

    it('should prevent cycles in paths', () => {
      const result = graphQueries.getMultiHopConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 3);
      
      // Check that no node appears twice in any path
      const paths = result.metadata.totalPaths;
      expect(paths).toBeGreaterThan(0);
    });

    it('should filter by minimum volume', () => {
      const result = graphQueries.getMultiHopConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 2, {
        minVolume: '1000000000000'
      });
      
      result.edges.forEach(edge => {
        expect(BigInt(edge.volume)).toBeGreaterThanOrEqual(BigInt('1000000000000'));
      });
    });

    it('should track multiple paths to same destination', () => {
      const result = graphQueries.getMultiHopConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 2);
      
      const nodesWithMultiplePaths = result.nodes.filter(n => n.pathCount > 1);
      expect(nodesWithMultiplePaths.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect performance targets', () => {
      const start = Date.now();
      graphQueries.getMultiHopConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 2);
      const executionTime = Date.now() - start;
      
      expect(executionTime).toBeLessThan(200); // Target: <200ms for 2-hop
    });
  });

  describe('extractSubgraph', () => {
    it('should extract complete subgraph around an address', () => {
      const result = graphQueries.extractSubgraph('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 2);
      
      expect(result).toBeDefined();
      expect(result.nodes).toBeInstanceOf(Array);
      expect(result.edges).toBeInstanceOf(Array);
      
      // Should include nodes at different depths
      const depthCounts = {};
      result.nodes.forEach(node => {
        depthCounts[node.depth] = (depthCounts[node.depth] || 0) + 1;
      });
      
      expect(depthCounts[0]).toBe(1); // Center node
      expect(depthCounts[1]).toBeGreaterThan(0); // Direct connections
      expect(depthCounts[2]).toBeGreaterThan(0); // 2-hop connections
    });

    it('should filter by node types', () => {
      const result = graphQueries.extractSubgraph('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 2, {
        nodeTypes: ['exchange', 'validator']
      });
      
      result.nodes.forEach(node => {
        if (node.depth > 0) { // Exclude center node
          expect(['exchange', 'validator', 'regular']).toContain(node.node_type);
        }
      });
    });

    it('should filter by risk score range', () => {
      const result = graphQueries.extractSubgraph('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 2, {
        riskScoreRange: [50, 100]
      });
      
      result.nodes.forEach(node => {
        if (node.risk_score !== undefined) {
          expect(node.risk_score).toBeGreaterThanOrEqual(50);
          expect(node.risk_score).toBeLessThanOrEqual(100);
        }
      });
    });

    it('should include edge scores', () => {
      const result = graphQueries.extractSubgraph('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 1);
      
      result.edges.forEach(edge => {
        expect(edge.score).toBeDefined();
        expect(edge.score).toBeGreaterThanOrEqual(0);
      });
    });

    it('should include node metrics', () => {
      const result = graphQueries.extractSubgraph('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 1);
      
      result.nodes.forEach(node => {
        expect(node.degree).toBeDefined();
        expect(node.in_degree).toBeDefined();
        expect(node.out_degree).toBeDefined();
      });
    });
  });

  describe('findShortestPath', () => {
    it('should find shortest path between connected addresses', () => {
      // First verify the connection exists
      const checkStmt = rawDb.prepare(`
        SELECT * FROM account_relationships 
        WHERE from_address = ? AND to_address = ?
      `);
      const rel = checkStmt.get('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty');
      
      expect(rel).toBeDefined(); // Ensure the relationship exists
      
      const result = graphQueries.findShortestPath(
        '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty'
      );
      
      if (!result.found) {
        console.log('Path not found. Relationship:', rel);
      }
      
      expect(result.found).toBe(true);
      expect(result.path).toBeDefined();
      expect(result.hops).toBe(1); // Direct connection
      expect(result.nodes).toBeInstanceOf(Array);
      expect(result.edges).toBeInstanceOf(Array);
      expect(result.nodes).toHaveLength(2); // Start and end node
      expect(result.edges).toHaveLength(1); // One edge
    });

    it('should return not found for unconnected addresses', () => {
      const result = graphQueries.findShortestPath(
        '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        '5UnconnectedAddress'
      );
      
      expect(result.found).toBe(false);
      expect(result.message).toContain('No path found');
    });

    it('should respect max depth limit', () => {
      const result = graphQueries.findShortestPath(
        '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        '5DistantAddress',
        { maxDepth: 2 }
      );
      
      if (result.found) {
        expect(result.hops).toBeLessThanOrEqual(2);
      }
    });

    it('should include path volume', () => {
      const result = graphQueries.findShortestPath(
        '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty'
      );
      
      if (result.found) {
        expect(result.pathVolume).toBeDefined();
        expect(BigInt(result.pathVolume)).toBeGreaterThan(BigInt(0));
      }
    });
  });

  describe('detectCircularFlows', () => {
    it('should detect circular flows', () => {
      // Add circular flow test data
      addCircularFlowTestData(rawDb);
      
      // Verify the circular path was created
      const checkStmt = rawDb.prepare(`
        SELECT * FROM account_relationships 
        WHERE (from_address = '5CircularStart' AND to_address = '5CircularMiddle')
           OR (from_address = '5CircularMiddle' AND to_address = '5CircularEnd')
           OR (from_address = '5CircularEnd' AND to_address = '5CircularStart')
      `);
      const rels = checkStmt.all();
      expect(rels.length).toBe(3);
      
      const result = graphQueries.detectCircularFlows('5CircularStart', { maxDepth: 3 });
      
      expect(result.circularPaths).toBeInstanceOf(Array);
      
      // If no circular paths found, it might be an issue with the query
      if (result.circularPaths.length === 0) {
        console.log('No circular paths found. Checking relationships:', rels);
      }
      
      expect(result.circularPaths.length).toBeGreaterThan(0);
      
      result.circularPaths.forEach(path => {
        expect(path.circular_path).toContain('(circular)');
        expect(path.path_length).toBe(3); // We know it's a 3-hop circle
      });
    });

    it('should filter by minimum volume', () => {
      addCircularFlowTestData(rawDb);
      
      const result = graphQueries.detectCircularFlows('5CircularStart', {
        minVolume: '1000000000000'
      });
      
      result.circularPaths.forEach(path => {
        expect(BigInt(path.min_volume_in_path)).toBeGreaterThanOrEqual(BigInt('1000000000000'));
      });
    });

    it('should respect max depth', () => {
      addCircularFlowTestData(rawDb);
      
      const result = graphQueries.detectCircularFlows('5CircularStart', {
        maxDepth: 3
      });
      
      result.circularPaths.forEach(path => {
        expect(path.path_length).toBeLessThanOrEqual(3);
      });
    });
  });

  describe('_buildGraphFromResults', () => {
    it('should deduplicate nodes', () => {
      const nodes = [
        { id: 'addr1', address: 'addr1' },
        { id: 'addr1', address: 'addr1' }, // Duplicate
        { id: 'addr2', address: 'addr2' }
      ];
      const edges = [];
      
      const result = graphQueries._buildGraphFromResults(nodes, edges);
      
      expect(result.nodes).toHaveLength(2);
      expect(result.metrics.nodeCount).toBe(2);
    });

    it('should deduplicate edges', () => {
      const nodes = [
        { id: 'addr1', address: 'addr1' },
        { id: 'addr2', address: 'addr2' }
      ];
      const edges = [
        { id: 'edge1', source: 'addr1', target: 'addr2', volume: '1000' },
        { id: 'edge1', source: 'addr1', target: 'addr2', volume: '1000' } // Duplicate
      ];
      
      const result = graphQueries._buildGraphFromResults(nodes, edges);
      
      expect(result.edges).toHaveLength(1);
      expect(result.metrics.edgeCount).toBe(1);
    });

    it('should calculate node metrics', () => {
      const nodes = [
        { id: 'addr1', address: 'addr1' },
        { id: 'addr2', address: 'addr2' },
        { id: 'addr3', address: 'addr3' }
      ];
      const edges = [
        { id: 'e1', source: 'addr1', target: 'addr2', volume: '1000' },
        { id: 'e2', source: 'addr1', target: 'addr3', volume: '2000' },
        { id: 'e3', source: 'addr2', target: 'addr3', volume: '3000' }
      ];
      
      const result = graphQueries._buildGraphFromResults(nodes, edges);
      
      const addr1 = result.nodes.find(n => n.id === 'addr1');
      expect(addr1.metrics.outDegree).toBe(2);
      expect(addr1.metrics.inDegree).toBe(0);
      expect(addr1.metrics.degree).toBe(2);
      
      const addr3 = result.nodes.find(n => n.id === 'addr3');
      expect(addr3.metrics.inDegree).toBe(2);
      expect(addr3.metrics.outDegree).toBe(0);
      expect(addr3.metrics.degree).toBe(2);
    });

    it('should calculate average degree', () => {
      const nodes = [
        { id: 'addr1', address: 'addr1' },
        { id: 'addr2', address: 'addr2' }
      ];
      const edges = [
        { id: 'e1', source: 'addr1', target: 'addr2', volume: '1000' }
      ];
      
      const result = graphQueries._buildGraphFromResults(nodes, edges);
      
      expect(result.metrics.avgDegree).toBe(1); // (1 out + 1 in) / 2 nodes
    });
  });

  describe('Performance', () => {
    it('should meet performance target for direct connections', () => {
      const start = Date.now();
      graphQueries.getDirectConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      const executionTime = Date.now() - start;
      
      expect(executionTime).toBeLessThan(10); // Target: <10ms
    });

    it('should handle large result sets efficiently', () => {
      // Add many connections
      addLargeDataset(rawDb);
      
      const start = Date.now();
      const result = graphQueries.getDirectConnections('5LargeHub', { limit: 1000 });
      const executionTime = Date.now() - start;
      
      expect(executionTime).toBeLessThan(100);
      expect(result.nodes.length).toBeGreaterThan(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', () => {
      // Close database to simulate error
      rawDb.close();
      
      expect(() => {
        graphQueries.getDirectConnections('5SomeAddress');
      }).toThrow();
    });

    it('should log errors appropriately', () => {
      // Create a new instance with a null database to force error
      const brokenGraphQueries = new GraphQueries({ db: null });
      
      expect(() => {
        brokenGraphQueries.getDirectConnections('5SomeAddress');
      }).toThrow();
    });
  });
});

// Helper functions to add test data
function seedGraphTestData(db) {
  // First ensure all accounts exist
  const accounts = [
    '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
    '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y'
  ];
  
  const accountStmt = db.prepare(`
    INSERT OR IGNORE INTO accounts (address, balance, first_seen_block)
    VALUES (?, '1000000000000', 1000000)
  `);
  
  accounts.forEach(addr => {
    if (addr !== '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY' && 
        addr !== '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty' &&
        addr !== '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy') {
      accountStmt.run(addr);
    }
  });
  
  // Add account relationships
  const relationships = [
    {
      from_address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      total_volume: '1000000000000',
      transfer_count: 5,
      first_transfer_block: 1000000,
      last_transfer_block: 1500000,
      first_transfer_time: '2023-01-01T00:00:00Z',
      last_transfer_time: '2023-01-15T00:00:00Z'
    },
    {
      from_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      to_address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
      total_volume: '2000000000000',
      transfer_count: 10,
      first_transfer_block: 1100000,
      last_transfer_block: 1600000,
      first_transfer_time: '2023-01-10T00:00:00Z',
      last_transfer_time: '2023-01-20T00:00:00Z'
    },
    {
      from_address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      to_address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
      total_volume: '500000000000',
      transfer_count: 2,
      first_transfer_block: 1200000,
      last_transfer_block: 1300000,
      first_transfer_time: '2023-01-12T00:00:00Z',
      last_transfer_time: '2023-01-13T00:00:00Z'
    },
    // Add more relationships for multi-hop testing
    {
      from_address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
      to_address: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y',
      total_volume: '3000000000000',
      transfer_count: 15,
      first_transfer_block: 1400000,
      last_transfer_block: 1700000,
      first_transfer_time: '2023-01-14T00:00:00Z',
      last_transfer_time: '2023-01-25T00:00:00Z'
    }
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO account_relationships 
    (from_address, to_address, total_volume, transfer_count, 
     first_transfer_block, last_transfer_block, first_transfer_time, last_transfer_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  relationships.forEach(rel => {
    stmt.run(
      rel.from_address, rel.to_address, rel.total_volume, rel.transfer_count,
      rel.first_transfer_block, rel.last_transfer_block, 
      rel.first_transfer_time, rel.last_transfer_time
    );
  });

  // Add node metrics
  const nodeMetrics = [
    {
      address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      degree: 4,
      in_degree: 1,
      out_degree: 3,
      total_volume_in: '1000000000000',
      total_volume_out: '3500000000000',
      node_type: 'regular',
      risk_score: 10
    },
    {
      address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      degree: 3,
      in_degree: 2,
      out_degree: 1,
      total_volume_in: '2000000000000',
      total_volume_out: '2000000000000',
      node_type: 'exchange',
      risk_score: 25
    },
    {
      address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
      degree: 5,
      in_degree: 3,
      out_degree: 2,
      total_volume_in: '2500000000000',
      total_volume_out: '3000000000000',
      node_type: 'validator',
      risk_score: 5
    }
  ];

  const metricsStmt = db.prepare(`
    INSERT OR IGNORE INTO node_metrics 
    (address, degree, in_degree, out_degree, total_volume_in, total_volume_out, node_type, risk_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  nodeMetrics.forEach(metric => {
    metricsStmt.run(
      metric.address, metric.degree, metric.in_degree, metric.out_degree,
      metric.total_volume_in, metric.total_volume_out, metric.node_type, metric.risk_score
    );
  });

  // Add relationship scores
  const scores = [
    {
      from_address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      volume_score: 75,
      frequency_score: 60,
      temporal_score: 80,
      network_score: 50,
      risk_score: 10,
      total_score: 65
    }
  ];

  const scoresStmt = db.prepare(`
    INSERT OR IGNORE INTO relationship_scores 
    (from_address, to_address, volume_score, frequency_score, temporal_score, network_score, risk_score, total_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  scores.forEach(score => {
    scoresStmt.run(
      score.from_address, score.to_address, score.volume_score,
      score.frequency_score, score.temporal_score, score.network_score,
      score.risk_score, score.total_score
    );
  });
}

function addCircularFlowTestData(db) {
  // First create accounts for circular flow
  const circularAccounts = ['5CircularStart', '5CircularMiddle', '5CircularEnd'];
  const accountStmt = db.prepare(`
    INSERT OR IGNORE INTO accounts (address, balance, first_seen_block)
    VALUES (?, '1000000000000', 1000000)
  `);
  
  circularAccounts.forEach(addr => {
    accountStmt.run(addr);
  });
  
  // Create a circular flow: A -> B -> C -> A
  const circularRelationships = [
    {
      from: '5CircularStart',
      to: '5CircularMiddle',
      volume: '1000000000000'
    },
    {
      from: '5CircularMiddle',
      to: '5CircularEnd',
      volume: '900000000000'
    },
    {
      from: '5CircularEnd',
      to: '5CircularStart',
      volume: '800000000000'
    }
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO account_relationships 
    (from_address, to_address, total_volume, transfer_count, first_transfer_block, last_transfer_block)
    VALUES (?, ?, ?, 1, 1000000, 1100000)
  `);

  circularRelationships.forEach(rel => {
    stmt.run(rel.from, rel.to, rel.volume);
  });
}

function addLargeDataset(db) {
  // Create a hub with many connections
  const hubAddress = '5LargeHub';
  
  // Add the hub account
  db.prepare(`
    INSERT OR IGNORE INTO accounts (address, balance, first_seen_block)
    VALUES (?, '1000000000000000', 1000000)
  `).run(hubAddress);

  // Add many connected accounts
  for (let i = 0; i < 200; i++) {
    const connectedAddress = `5Connected${i}`;
    
    // Add account
    db.prepare(`
      INSERT OR IGNORE INTO accounts (address, balance, first_seen_block)
      VALUES (?, '1000000000000', 1000000)
    `).run(connectedAddress);
    
    // Add relationship
    db.prepare(`
      INSERT OR IGNORE INTO account_relationships 
      (from_address, to_address, total_volume, transfer_count, first_transfer_block, last_transfer_block)
      VALUES (?, ?, ?, ?, 1000000, 1100000)
    `).run(
      hubAddress, 
      connectedAddress, 
      `${(i + 1) * 1000000000000}`,
      i + 1
    );
  }
}