import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import apiRouter from '../../src/api/index.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

describe('Server Integration Test', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Mock services for testing
    app.locals.db = {
      searchAccounts: () => [],
      getAccount: () => null,
      getTransfers: () => [],
      getRelationships: () => [],
      getPatterns: () => [],
      saveInvestigation: () => ({ changes: 1 }),
      getInvestigation: () => null,
      getSyncStatus: () => null,
      getStatistics: () => []
    };
    
    app.locals.blockchain = {
      getAccount: () => Promise.resolve({
        address: 'test',
        balance: '0',
        nonce: 0,
        identity: null
      })
    };
    
    // Mount routes
    app.use('/api', apiRouter);
    app.use(errorHandler);
  });

  it('should return API information', async () => {
    const response = await request(app)
      .get('/api')
      .expect(200);
    
    expect(response.body).toHaveProperty('name');
    expect(response.body).toHaveProperty('version');
    expect(response.body).toHaveProperty('endpoints');
  });

  it('should handle address search', async () => {
    const response = await request(app)
      .get('/api/addresses/search?q=test')
      .expect(200);
    
    expect(response.body).toHaveProperty('query');
    expect(response.body).toHaveProperty('count');
    expect(response.body).toHaveProperty('results');
  });

  it('should validate address format', async () => {
    await request(app)
      .get('/api/addresses/invalid')
      .expect(400);
  });

  it('should handle graph endpoint', async () => {
    const response = await request(app)
      .get('/api/graph?address=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY')
      .expect(200);
    
    expect(response.body).toHaveProperty('nodes');
    expect(response.body).toHaveProperty('edges');
    expect(response.body).toHaveProperty('metadata');
  });

  it('should handle investigations endpoint', async () => {
    const investigation = {
      title: 'Test Investigation',
      addresses: ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY']
    };

    const response = await request(app)
      .post('/api/investigations')
      .send(investigation)
      .expect(201);
    
    expect(response.body).toHaveProperty('sessionId');
  });

  it('should handle stats endpoint', async () => {
    const response = await request(app)
      .get('/api/stats')
      .expect(200);
    
    expect(response.body).toHaveProperty('totalAccounts');
  });

  it('should handle sync status endpoint', async () => {
    const response = await request(app)
      .get('/api/stats/sync')
      .expect(200);
    
    expect(response.body).toHaveProperty('chainId');
    expect(response.body).toHaveProperty('status');
  });

  it('should handle errors gracefully', async () => {
    const response = await request(app)
      .get('/api/addresses/search')
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
  });
});