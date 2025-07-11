import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app, server } from '../../../src/index';
import { createTestDatabase, seedTestData } from '../../utils/graph-test-helper';
import Database from 'better-sqlite3';

describe('Graph API Endpoints', () => {
  let db;
  let testAccounts;

  beforeAll(async () => {
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Setup test database
    db = await createTestDatabase('./tests/temp/graph-api-test.db');
    const { accounts } = seedTestData(db, {
      accountCount: 20,
      transferCount: 100,
      relationshipCount: 50
    });
    testAccounts = accounts;
  });

  afterAll(async () => {
    db.close();
    server.close();
  });

  describe('GET /api/v1/accounts/:address/graph', () => {
    it('should return graph data for valid address', async () => {
      const address = testAccounts[0].address;
      
      const response = await request(app)
        .get(`/api/v1/accounts/${address}/graph`)
        .expect(200);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('nodes');
      expect(response.body.data).toHaveProperty('edges');
      expect(response.body.data.nodes).toBeInstanceOf(Array);
      expect(response.body.data.edges).toBeInstanceOf(Array);
      
      // Check node structure
      const node = response.body.data.nodes[0];
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('address');
      expect(node).toHaveProperty('identity');
      expect(node).toHaveProperty('balance');
      
      // Check edge structure
      if (response.body.data.edges.length > 0) {
        const edge = response.body.data.edges[0];
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
        expect(edge).toHaveProperty('transferVolume');
      }
    });

    it('should respect depth parameter', async () => {
      const address = testAccounts[0].address;
      
      const depth1Response = await request(app)
        .get(`/api/v1/accounts/${address}/graph?depth=1`)
        .expect(200);
      
      const depth2Response = await request(app)
        .get(`/api/v1/accounts/${address}/graph?depth=2`)
        .expect(200);
      
      // Depth 2 should have more or equal nodes
      expect(depth2Response.body.data.nodes.length)
        .toBeGreaterThanOrEqual(depth1Response.body.data.nodes.length);
    });

    it('should apply volume filters', async () => {
      const address = testAccounts[0].address;
      const minVolume = '10000000000000'; // 10 DOT
      
      const response = await request(app)
        .get(`/api/v1/accounts/${address}/graph?minVolume=${minVolume}`)
        .expect(200);
      
      // All edges should have volume >= minVolume
      response.body.data.edges.forEach(edge => {
        expect(BigInt(edge.transferVolume.totalAmount))
          .toBeGreaterThanOrEqual(BigInt(minVolume));
      });
    });

    it('should handle concurrent requests', async () => {
      const addresses = testAccounts.slice(0, 5).map(a => a.address);
      
      const requests = addresses.map(address =>
        request(app)
          .get(`/api/v1/accounts/${address}/graph?depth=2`)
          .expect(200)
      );
      
      const responses = await Promise.all(requests);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('nodes');
        expect(response.body.data).toHaveProperty('edges');
      });
    });

    it('should return 404 for non-existent address', async () => {
      const invalidAddress = '5InvalidAddressDoesNotExistInDatabase1234567890';
      
      const response = await request(app)
        .get(`/api/v1/accounts/${invalidAddress}/graph`)
        .expect(404);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('ACCOUNT_NOT_FOUND');
    });

    it('should timeout for excessive depth', async () => {
      const address = testAccounts[0].address;
      
      const response = await request(app)
        .get(`/api/v1/accounts/${address}/graph?depth=10`)
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('INVALID_PARAMS');
      expect(response.body.error.message).toMatch(/depth/i);
    });

    it('should limit number of connections', async () => {
      const address = testAccounts[0].address;
      const limit = 5;
      
      const response = await request(app)
        .get(`/api/v1/accounts/${address}/graph?limit=${limit}`)
        .expect(200);
      
      // Should respect the limit
      expect(response.body.data.nodes.length).toBeLessThanOrEqual(limit + 1); // +1 for center node
    });

    it('should include relationship scores', async () => {
      const address = testAccounts[0].address;
      
      const response = await request(app)
        .get(`/api/v1/accounts/${address}/graph?includeScores=true`)
        .expect(200);
      
      // Edges should include score information
      if (response.body.data.edges.length > 0) {
        const edge = response.body.data.edges[0];
        expect(edge).toHaveProperty('score');
        expect(edge.score).toHaveProperty('total');
        expect(edge.score).toHaveProperty('volume');
        expect(edge.score).toHaveProperty('frequency');
      }
    });
  });

  describe('POST /api/v1/graph/subgraph', () => {
    it('should extract subgraph for multiple addresses', async () => {
      const addresses = testAccounts.slice(0, 3).map(a => a.address);
      
      const response = await request(app)
        .post('/api/v1/graph/subgraph')
        .send({
          addresses,
          depth: 1
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('nodes');
      expect(response.body.data).toHaveProperty('edges');
      
      // Should include all requested addresses
      const nodeAddresses = response.body.data.nodes.map(n => n.address);
      addresses.forEach(addr => {
        expect(nodeAddresses).toContain(addr);
      });
    });

    it('should merge overlapping neighborhoods', async () => {
      // Get two connected addresses
      const address1 = testAccounts[0].address;
      const address2 = testAccounts[1].address;
      
      // Create a connection between them
      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES ('0xmergetest', 3000000, datetime('now'), ?, ?, '1000000000000', '125000000', 1)
      `).run(address1, address2);
      
      const response = await request(app)
        .post('/api/v1/graph/subgraph')
        .send({
          addresses: [address1, address2],
          depth: 1
        })
        .expect(200);
      
      // Should not have duplicate nodes
      const nodeAddresses = response.body.data.nodes.map(n => n.address);
      const uniqueAddresses = new Set(nodeAddresses);
      expect(nodeAddresses.length).toBe(uniqueAddresses.size);
    });

    it('should apply consistent scoring', async () => {
      const addresses = testAccounts.slice(0, 2).map(a => a.address);
      
      const response = await request(app)
        .post('/api/v1/graph/subgraph')
        .send({
          addresses,
          includeScores: true
        })
        .expect(200);
      
      // All edges should have valid scores
      response.body.data.edges.forEach(edge => {
        if (edge.score) {
          expect(edge.score.total).toBeGreaterThanOrEqual(0);
          expect(edge.score.total).toBeLessThanOrEqual(100);
        }
      });
    });

    it('should handle large address lists', async () => {
      const addresses = testAccounts.slice(0, 10).map(a => a.address);
      
      const response = await request(app)
        .post('/api/v1/graph/subgraph')
        .send({
          addresses,
          depth: 1,
          limit: 100
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body.data.nodes.length).toBeGreaterThan(0);
    });

    it('should validate request body', async () => {
      const invalidRequests = [
        { addresses: [] }, // Empty addresses
        { addresses: ['invalid'] }, // Invalid address format
        { addresses: testAccounts[0].address }, // Not an array
        { addresses: [testAccounts[0].address], depth: -1 }, // Invalid depth
        { addresses: [testAccounts[0].address], depth: 100 }, // Excessive depth
      ];
      
      for (const invalidBody of invalidRequests) {
        const response = await request(app)
          .post('/api/v1/graph/subgraph')
          .send(invalidBody)
          .expect(400);
        
        expect(response.body).toHaveProperty('error');
        expect(response.body.error.code).toBe('INVALID_PARAMS');
      }
    });
  });

  describe('GET /api/v1/graph/path', () => {
    it('should find shortest path between addresses', async () => {
      const from = testAccounts[0].address;
      const to = testAccounts[1].address;
      
      const response = await request(app)
        .get(`/api/v1/graph/path?from=${from}&to=${to}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('path');
      expect(response.body.data).toHaveProperty('hops');
      expect(response.body.data).toHaveProperty('totalTransfers');
    });

    it('should return null for disconnected addresses', async () => {
      // Create isolated accounts
      const isolated1 = '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw';
      const isolated2 = '5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9';
      
      db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, '1000000000000'), (?, '1000000000000')
      `).run(isolated1, isolated2);
      
      const response = await request(app)
        .get(`/api/v1/graph/path?from=${isolated1}&to=${isolated2}`)
        .expect(200);
      
      expect(response.body.data).toBeNull();
    });

    it('should respect maxDepth parameter', async () => {
      const from = testAccounts[0].address;
      const to = testAccounts[testAccounts.length - 1].address;
      
      const response = await request(app)
        .get(`/api/v1/graph/path?from=${from}&to=${to}&maxDepth=2`)
        .expect(200);
      
      if (response.body.data) {
        expect(response.body.data.hops).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('GET /api/v1/graph/metrics/:address', () => {
    it('should return graph metrics for address', async () => {
      const address = testAccounts[0].address;
      
      const response = await request(app)
        .get(`/api/v1/graph/metrics/${address}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('degreeCentrality');
      expect(response.body.data).toHaveProperty('clusteringCoefficient');
      expect(response.body.data).toHaveProperty('pageRank');
      expect(response.body.data).toHaveProperty('betweennessCentrality');
      
      // Check degree centrality structure
      expect(response.body.data.degreeCentrality).toHaveProperty('in');
      expect(response.body.data.degreeCentrality).toHaveProperty('out');
      expect(response.body.data.degreeCentrality).toHaveProperty('total');
    });

    it('should cache metrics for performance', async () => {
      const address = testAccounts[0].address;
      
      // First request
      const start1 = Date.now();
      await request(app)
        .get(`/api/v1/graph/metrics/${address}`)
        .expect(200);
      const duration1 = Date.now() - start1;
      
      // Second request (should be cached)
      const start2 = Date.now();
      const response2 = await request(app)
        .get(`/api/v1/graph/metrics/${address}`)
        .expect(200);
      const duration2 = Date.now() - start2;
      
      // Cached request should be faster
      expect(duration2).toBeLessThan(duration1 * 0.5);
      
      // Check cache headers
      expect(response2.headers['x-cache']).toBe('HIT');
    });
  });

  describe('POST /api/v1/graph/analyze', () => {
    it('should analyze graph patterns', async () => {
      const response = await request(app)
        .post('/api/v1/graph/analyze')
        .send({
          addresses: testAccounts.slice(0, 5).map(a => a.address),
          patterns: ['hub', 'cluster', 'chain']
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('patterns');
      expect(response.body.data.patterns).toBeInstanceOf(Array);
      
      // Check pattern structure
      if (response.body.data.patterns.length > 0) {
        const pattern = response.body.data.patterns[0];
        expect(pattern).toHaveProperty('type');
        expect(pattern).toHaveProperty('confidence');
        expect(pattern).toHaveProperty('nodes');
      }
    });

    it('should detect suspicious patterns', async () => {
      // Create a suspicious pattern (rapid transfers)
      const suspiciousFrom = '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw';
      const suspiciousTo = '5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9';
      
      db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, '1000000000000'), (?, '1000000000000')
      `).run(suspiciousFrom, suspiciousTo);
      
      // Create rapid transfers
      const baseTime = new Date();
      for (let i = 0; i < 5; i++) {
        const time = new Date(baseTime);
        time.setMinutes(time.getMinutes() + i);
        
        db.prepare(`
          INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
          VALUES (?, ?, ?, ?, ?, '10000000000000', '125000000', 1)
        `).run(`0xsuspicious${i}`, 3000000 + i, time.toISOString(), suspiciousFrom, suspiciousTo);
      }
      
      const response = await request(app)
        .post('/api/v1/graph/analyze')
        .send({
          addresses: [suspiciousFrom, suspiciousTo],
          patterns: ['suspicious']
        })
        .expect(200);
      
      const suspiciousPatterns = response.body.data.patterns.filter(p => p.type === 'suspicious');
      expect(suspiciousPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const address = testAccounts[0].address;
      const requests = [];
      
      // Make many rapid requests
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app)
            .get(`/api/v1/accounts/${address}/graph`)
        );
      }
      
      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      
      // Check rate limit headers
      const limitedResponse = rateLimited[0];
      expect(limitedResponse.headers['x-ratelimit-limit']).toBeDefined();
      expect(limitedResponse.headers['x-ratelimit-remaining']).toBeDefined();
      expect(limitedResponse.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Temporarily close the database to simulate error
      const originalDb = db;
      db.close();
      
      const response = await request(app)
        .get(`/api/v1/accounts/${testAccounts[0].address}/graph`)
        .expect(503);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
      
      // Restore database
      db = originalDb;
    });

    it('should validate address format', async () => {
      const invalidAddresses = [
        'invalid',
        '0x1234567890abcdef', // Ethereum format
        '1234567890', // Too short
        '5' + 'x'.repeat(50), // Too long
        '4GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY' // Wrong prefix
      ];
      
      for (const address of invalidAddresses) {
        const response = await request(app)
          .get(`/api/v1/accounts/${address}/graph`)
          .expect(400);
        
        expect(response.body).toHaveProperty('error');
        expect(response.body.error.code).toBe('INVALID_ADDRESS');
      }
    });
  });
});