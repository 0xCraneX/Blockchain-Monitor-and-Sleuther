import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTestDatabase, seedTestData, MockBlockchainService } from '../setup.js';
import apiRouter from '../../src/api/index.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { DatabaseService } from '../../src/services/DatabaseService.js';

describe('API Integration Tests', () => {
  let app;
  let db;
  let blockchain;

  beforeAll(async () => {
    // Create test app
    app = express();
    app.use(express.json());
    
    // Initialize test database
    const rawDb = await createTestDatabase();
    seedTestData(rawDb);
    
    // Mock database service
    const dbService = new DatabaseService();
    dbService.db = rawDb;
    
    // Mock blockchain service
    blockchain = new MockBlockchainService();
    await blockchain.connect();
    
    // Mock some blockchain accounts
    blockchain.setMockAccount('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', {
      address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      balance: '1500000000000',
      nonce: 10,
      identity: {
        display: 'Alice Updated',
        email: 'alice@polkadot.network'
      }
    });
    
    // Set up app locals
    app.locals.db = dbService;
    app.locals.blockchain = blockchain;
    
    // Mount API routes
    app.use('/api', apiRouter);
    app.use(errorHandler);
  });

  describe('GET /api', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/api')
        .expect(200);
      
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
    });
  });

  describe('Address Search API', () => {
    describe('GET /api/addresses/search', () => {
      it('should search addresses by prefix', async () => {
        const response = await request(app)
          .get('/api/addresses/search?q=5Grw')
          .expect(200);
        
        expect(response.body.query).toBe('5Grw');
        expect(response.body.count).toBe(1);
        expect(response.body.results).toHaveLength(1);
        expect(response.body.results[0].address).toBe('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      });

      it('should search addresses by identity', async () => {
        const response = await request(app)
          .get('/api/addresses/search?q=Bob')
          .expect(200);
        
        expect(response.body.results).toHaveLength(1);
        expect(response.body.results[0].identity_display).toBe('Bob');
      });

      it('should limit search results', async () => {
        const response = await request(app)
          .get('/api/addresses/search?q=5&limit=2')
          .expect(200);
        
        expect(response.body.results.length).toBeLessThanOrEqual(2);
      });

      it('should require query parameter', async () => {
        await request(app)
          .get('/api/addresses/search')
          .expect(400);
      });

      it('should validate limit parameter', async () => {
        await request(app)
          .get('/api/addresses/search?q=test&limit=invalid')
          .expect(400);
      });
    });

    describe('GET /api/addresses/:address', () => {
      it('should get account details', async () => {
        const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
        const response = await request(app)
          .get(`/api/addresses/${address}`)
          .expect(200);
        
        expect(response.body.address).toBe(address);
        expect(response.body.identity_display).toBe('Alice');
      });

      it('should return 404 for non-existent address', async () => {
        const response = await request(app)
          .get('/api/addresses/5NonExistentAddress123456789')
          .expect(404);
        
        expect(response.body.error.message).toBe('Address not found');
      });

      it('should validate address format', async () => {
        await request(app)
          .get('/api/addresses/invalid-address')
          .expect(400);
      });
    });

    describe('GET /api/addresses/:address/transfers', () => {
      it('should get transfers for address', async () => {
        const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
        const response = await request(app)
          .get(`/api/addresses/${address}/transfers`)
          .expect(200);
        
        expect(response.body.address).toBe(address);
        expect(response.body.transfers).toBeDefined();
        expect(Array.isArray(response.body.transfers)).toBe(true);
      });

      it('should support pagination', async () => {
        const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
        const response = await request(app)
          .get(`/api/addresses/${address}/transfers?limit=10&offset=0`)
          .expect(200);
        
        expect(response.body.transfers.length).toBeLessThanOrEqual(10);
      });

      it('should validate pagination parameters', async () => {
        const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
        
        await request(app)
          .get(`/api/addresses/${address}/transfers?limit=invalid`)
          .expect(400);
      });
    });

    describe('GET /api/addresses/:address/relationships', () => {
      it('should get relationships for address', async () => {
        const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
        const response = await request(app)
          .get(`/api/addresses/${address}/relationships`)
          .expect(200);
        
        expect(response.body.address).toBe(address);
        expect(response.body.relationships).toBeDefined();
        expect(Array.isArray(response.body.relationships)).toBe(true);
      });

      it('should support depth parameter', async () => {
        const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
        const response = await request(app)
          .get(`/api/addresses/${address}/relationships?depth=2`)
          .expect(200);
        
        expect(response.body.relationships).toBeDefined();
      });

      it('should support minimum volume filter', async () => {
        const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
        const response = await request(app)
          .get(`/api/addresses/${address}/relationships?minVolume=1000000000000`)
          .expect(200);
        
        expect(response.body.relationships).toBeDefined();
      });
    });

    describe('GET /api/addresses/:address/patterns', () => {
      it('should get patterns for address', async () => {
        const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
        const response = await request(app)
          .get(`/api/addresses/${address}/patterns`)
          .expect(200);
        
        expect(response.body.address).toBe(address);
        expect(response.body.patterns).toBeDefined();
        expect(Array.isArray(response.body.patterns)).toBe(true);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to search endpoints', async () => {
      // Make multiple rapid requests
      const requests = Array(25).fill(0).map(() => 
        request(app).get('/api/addresses/search?q=test')
      );
      
      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle internal server errors gracefully', async () => {
      // Force an error by breaking the database connection
      app.locals.db.db = null;
      
      const response = await request(app)
        .get('/api/addresses/search?q=test')
        .expect(500);
      
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBeDefined();
    });

    it('should return proper error format', async () => {
      const response = await request(app)
        .get('/api/addresses/invalid-format')
        .expect(400);
      
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBeDefined();
      expect(response.body.error.status).toBe(400);
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api')
        .expect(200);
      
      // Check for helmet security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });
});