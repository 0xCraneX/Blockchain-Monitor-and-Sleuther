import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { GraphQueries } from '../../../src/services/GraphQueries';
import { createTestDatabase, seedTestData } from '../../utils/graph-test-helper';

describe('Graph Query Functions', () => {
  let db;
  let graphQueries;

  beforeEach(async () => {
    db = await createTestDatabase();
    graphQueries = new GraphQueries(db);
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getDirectConnections', () => {
    it('should return all direct connections for a node', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const connections = graphQueries.getDirectConnections(address);

      expect(connections).toHaveLength(2);
      expect(connections[0]).toHaveProperty('connected_address');
      expect(connections[0]).toHaveProperty('transfer_count');
      expect(connections[0]).toHaveProperty('total_volume');
      expect(connections[0]).toHaveProperty('direction');
    });

    it('should handle nodes with no connections', () => {
      const isolatedAddress = '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy';
      const connections = graphQueries.getDirectConnections(isolatedAddress);

      expect(connections).toHaveLength(0);
    });

    it('should respect connection limits', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const connections = graphQueries.getDirectConnections(address, 1);

      expect(connections).toHaveLength(1);
      expect(connections[0].transfer_count).toBeGreaterThan(0);
    });

    it('should include bidirectional connections', () => {
      const address = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
      const connections = graphQueries.getDirectConnections(address);

      const directions = connections.map(c => c.direction);
      expect(directions).toContain('incoming');
      expect(directions).toContain('outgoing');
    });

    it('should handle self-referencing edges', () => {
      // Add a self-referencing transfer
      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES ('0xself', 2000000, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
      `).run('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');

      const connections = graphQueries.getDirectConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      const selfConnection = connections.find(c => c.connected_address === '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      
      expect(selfConnection).toBeDefined();
    });
  });

  describe('getMultiHopConnections', () => {
    it('should traverse up to specified depth', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      const depth1 = graphQueries.getMultiHopConnections(address, 1);
      const depth2 = graphQueries.getMultiHopConnections(address, 2);
      
      expect(depth2.length).toBeGreaterThanOrEqual(depth1.length);
      expect(depth2.some(c => c.distance === 2)).toBe(true);
    });

    it('should prevent infinite loops in cyclic graphs', () => {
      // Create a cycle: A -> B -> C -> A
      const addresses = [
        '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy'
      ];

      // Add transfers to create cycle
      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES 
          ('0xcycle1', 2000000, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
          ('0xcycle2', 2000001, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
          ('0xcycle3', 2000002, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
      `).run(
        addresses[0], addresses[1],
        addresses[1], addresses[2],
        addresses[2], addresses[0]
      );

      // Should not throw or enter infinite loop
      const connections = graphQueries.getMultiHopConnections(addresses[0], 5);
      expect(connections).toBeDefined();
      expect(connections.length).toBeLessThan(100); // Reasonable upper bound
    });

    it('should respect node count limits', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const connections = graphQueries.getMultiHopConnections(address, 3, 5);
      
      expect(connections.length).toBeLessThanOrEqual(5);
    });

    it('should handle disconnected subgraphs', () => {
      // Create an isolated subgraph
      const isolatedAddresses = [
        '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
        '5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9'
      ];

      db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, '1000000000000'), (?, '2000000000000')
      `).run(isolatedAddresses[0], isolatedAddresses[1]);

      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES ('0xisolated', 2000000, '2024-01-01', ?, ?, '500000000000', '125000000', 1)
      `).run(isolatedAddresses[0], isolatedAddresses[1]);

      const mainConnections = graphQueries.getMultiHopConnections('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 10);
      
      // Should not include isolated subgraph
      expect(mainConnections.every(c => !isolatedAddresses.includes(c.address))).toBe(true);
    });

    it('should timeout on large graphs', async () => {
      // Mock a large graph scenario
      const mockQuery = vi.fn(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve([]), 6000); // 6 seconds
        });
      });

      graphQueries.db = { prepare: () => ({ all: mockQuery }) };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      await expect(
        Promise.race([
          graphQueries.getMultiHopConnections('test', 5),
          timeoutPromise
        ])
      ).rejects.toThrow('Timeout');
    });
  });

  describe('findShortestPath', () => {
    it('should find direct path when available', () => {
      const from = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const to = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
      
      const path = graphQueries.findShortestPath(from, to);
      
      expect(path).toBeDefined();
      expect(path.depth).toBe(1);
      expect(path.path).toBe(`${from} → ${to}`);
    });

    it('should find multi-hop path', () => {
      // Add intermediate node
      const intermediate = '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw';
      const from = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const to = '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy';

      db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, '1000000000000')
      `).run(intermediate);

      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES 
          ('0xpath1', 2000000, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
          ('0xpath2', 2000001, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
      `).run(from, intermediate, intermediate, to);

      const path = graphQueries.findShortestPath(from, to);
      
      expect(path).toBeDefined();
      expect(path.depth).toBe(2);
      expect(path.path).toContain(intermediate);
    });

    it('should return null for disconnected nodes', () => {
      const from = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const to = '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw'; // Not connected
      
      const path = graphQueries.findShortestPath(from, to);
      
      expect(path).toBeNull();
    });

    it('should prefer paths with higher weights', () => {
      const from = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const to = '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy';
      const intermediate1 = '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw';
      const intermediate2 = '5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9';

      // Create two paths with different weights
      db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, '1000000000000'), (?, '1000000000000')
      `).run(intermediate1, intermediate2);

      // Path 1: Higher weight (more transfers)
      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES 
          ('0xhigh1', 2000000, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
          ('0xhigh2', 2000001, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
          ('0xhigh3', 2000002, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
          ('0xhigh4', 2000003, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
      `).run(from, intermediate1, from, intermediate1, intermediate1, to, intermediate1, to);

      // Path 2: Lower weight (fewer transfers)
      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES 
          ('0xlow1', 2000004, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
          ('0xlow2', 2000005, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
      `).run(from, intermediate2, intermediate2, to);

      const path = graphQueries.findShortestPath(from, to, 3, true);
      
      expect(path).toBeDefined();
      expect(path.path).toContain(intermediate1); // Should prefer higher weight path
    });

    it('should handle multiple equal-length paths', () => {
      const from = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const to = '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy';
      const intermediate1 = '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw';
      const intermediate2 = '5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9';

      // Create two equal-length paths
      db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, '1000000000000'), (?, '1000000000000')
      `).run(intermediate1, intermediate2);

      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES 
          ('0xeq1', 2000000, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
          ('0xeq2', 2000001, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
          ('0xeq3', 2000002, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
          ('0xeq4', 2000003, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
      `).run(from, intermediate1, intermediate1, to, from, intermediate2, intermediate2, to);

      const paths = graphQueries.findAllPaths(from, to, 2);
      
      expect(paths).toHaveLength(2);
      expect(paths.every(p => p.depth === 2)).toBe(true);
    });
  });

  describe('extractSubgraph', () => {
    it('should extract complete subgraph around an address', () => {
      const centerAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const subgraph = graphQueries.extractSubgraph(centerAddress, 2);

      expect(subgraph).toHaveProperty('nodes');
      expect(subgraph).toHaveProperty('edges');
      expect(subgraph.nodes.length).toBeGreaterThan(0);
      expect(subgraph.edges.length).toBeGreaterThan(0);

      // Center node should be included
      const centerNode = subgraph.nodes.find(n => n.address === centerAddress);
      expect(centerNode).toBeDefined();
      expect(centerNode.depth).toBe(0);
    });

    it('should respect depth limits', () => {
      const centerAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      const depth1 = graphQueries.extractSubgraph(centerAddress, 1);
      const depth2 = graphQueries.extractSubgraph(centerAddress, 2);

      expect(depth2.nodes.length).toBeGreaterThanOrEqual(depth1.nodes.length);
      expect(depth1.nodes.every(n => n.depth <= 1)).toBe(true);
      expect(depth2.nodes.some(n => n.depth === 2)).toBe(true);
    });

    it('should include edge metadata', () => {
      const centerAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const subgraph = graphQueries.extractSubgraph(centerAddress, 1);

      expect(subgraph.edges.length).toBeGreaterThan(0);
      const edge = subgraph.edges[0];
      
      expect(edge).toHaveProperty('from');
      expect(edge).toHaveProperty('to');
      expect(edge).toHaveProperty('transfers');
      expect(edge).toHaveProperty('volume');
    });

    it('should handle large subgraphs efficiently', () => {
      // Add many connections
      const manyAddresses = Array(50).fill(null).map((_, i) => 
        `5${i.toString().padStart(47, '0')}`
      );

      const insertAccount = db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, '1000000000000')
      `);

      const insertTransfer = db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES (?, ?, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
      `);

      manyAddresses.forEach((addr, i) => {
        insertAccount.run(addr);
        insertTransfer.run(`0xlarge${i}`, 2000000 + i, '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', addr);
      });

      const start = Date.now();
      const subgraph = graphQueries.extractSubgraph('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 1);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(subgraph.nodes.length).toBeGreaterThan(50);
    });
  });

  describe('getGraphMetrics', () => {
    it('should calculate degree centrality', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const metrics = graphQueries.getGraphMetrics(address);

      expect(metrics).toHaveProperty('degreeCentrality');
      expect(metrics.degreeCentrality).toHaveProperty('in');
      expect(metrics.degreeCentrality).toHaveProperty('out');
      expect(metrics.degreeCentrality).toHaveProperty('total');
    });

    it('should calculate clustering coefficient', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const metrics = graphQueries.getGraphMetrics(address);

      expect(metrics).toHaveProperty('clusteringCoefficient');
      expect(metrics.clusteringCoefficient).toBeGreaterThanOrEqual(0);
      expect(metrics.clusteringCoefficient).toBeLessThanOrEqual(1);
    });

    it('should include volume metrics', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const metrics = graphQueries.getGraphMetrics(address);

      expect(metrics).toHaveProperty('volumeMetrics');
      expect(metrics.volumeMetrics).toHaveProperty('totalInVolume');
      expect(metrics.volumeMetrics).toHaveProperty('totalOutVolume');
      expect(metrics.volumeMetrics).toHaveProperty('averageTransferSize');
    });
  });
});